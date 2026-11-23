/* Sugar Daddy — Inner Circle sign-up modal
   Framework-free. Exposes window.SDSignup = { init, open, close, reset }.

   Behaviour (see README §6):
   - Auto-opens once per visit: desktop after `desktopDelayMs`; mobile (<768px) after the
     reader scrolls `mobileScrollRatio` of the page (avoids Google's intrusive-interstitial penalty).
   - Never auto-opens if the reader subscribed, or dismissed it within `suppressDays`.
   - Any element with [data-sd-signup-open] opens it on demand, ignoring suppression.
   - ?sd_popup=1 forces auto-open (QA). ?sd_popup=0 disables it.
   - Esc, scrim click, × and "Not now" close it. Focus is trapped while open and returned after.
*/
(function () {
  'use strict';

  var STORAGE_KEY = 'sd_signup_v1';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var MSG = {
    empty: 'Enter your email address to join.',
    invalid: 'That email doesn’t look right. Check it and try again.',
    server: 'Something went wrong on our end. Try again in a moment.',
    offline: 'You appear to be offline. Check your connection and try again.'
  };
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

  var cfg, root, panel, form, input, submit, errorEl, views, lastFocus, autoTimer, scrollHandler, isOpen = false;

  function store(patch) {
    try {
      var cur = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (patch) { Object.assign(cur, patch); localStorage.setItem(STORAGE_KEY, JSON.stringify(cur)); }
      return cur;
    } catch (e) { return {}; } // private mode / storage blocked: behave as a first visit
  }

  function suppressed() {
    var force = new URLSearchParams(location.search).get('sd_popup');
    if (force === '1') return false;
    if (force === '0') return true;
    var s = store();
    if (s.subscribedAt) return true;
    if (s.dismissedAt && Date.now() - s.dismissedAt < cfg.suppressDays * 864e5) return true;
    return false;
  }

  function setBackgroundInert(on) {
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el === root || el.tagName === 'SCRIPT') return;
      if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert');
    });
    document.body.classList.toggle('sd-scroll-lock', on);
  }

  function show(view) {
    views.forEach(function (v) { v.hidden = v.getAttribute('data-view') !== view; });
  }

  function setError(msg) {
    errorEl.textContent = msg || '';
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }

  function setLoading(on) {
    submit.disabled = on;
    submit.textContent = on ? 'Sending…' : 'Request entry';
    form.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function open(trigger) {
    if (isOpen) return;
    clearAuto();
    isOpen = true;
    lastFocus = trigger && trigger.focus ? trigger : document.activeElement;
    root.hidden = false;
    setBackgroundInert(true);
    requestAnimationFrame(function () {
      root.classList.add('is-open');
      // Don't pop the iOS keyboard on an unrequested open; focus the close button instead.
      (trigger ? input : root.querySelector('.sd-modal__close')).focus({ preventScroll: true });
    });
    document.addEventListener('keydown', onKey);
    track('signup_modal_open', { trigger: trigger ? 'click' : 'auto' });
  }

  function close(reason) {
    if (!isOpen) return;
    isOpen = false;
    var s = store();
    if (!s.subscribedAt) store({ dismissedAt: Date.now() });
    root.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    var done = function () {
      root.hidden = true;
      setBackgroundInert(false);
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    };
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(done, reduce ? 0 : 320);
    track('signup_modal_close', { reason: reason || 'unknown' });
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close('escape'); return; }
    if (e.key !== 'Tab') return;
    var items = Array.prototype.filter.call(panel.querySelectorAll(FOCUSABLE), function (el) {
      return el.offsetParent !== null;
    });
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function onSubmit(e) {
    e.preventDefault();
    var email = input.value.trim();
    if (!email) { setError(MSG.empty); input.focus(); return; }
    if (!EMAIL_RE.test(email)) { setError(MSG.invalid); input.focus(); return; }
    setError('');
    if (!navigator.onLine) { setError(MSG.offline); return; }
    setLoading(true);

    var req = cfg.endpoint
      ? fetch(cfg.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ email: email, source: cfg.source, page: location.pathname })
        }).then(function (r) {
          // 409 = already subscribed: treat as success, same message.
          if (!r.ok && r.status !== 409) throw new Error('HTTP ' + r.status);
        })
      : new Promise(function (res) { setTimeout(res, 700); }); // demo mode

    req.then(function () {
      store({ subscribedAt: Date.now() });
      root.querySelector('[data-success-email]').textContent = email;
      show('success');
      root.querySelector('[data-success-title]').focus();
      track('signup_submit_success', {});
    }).catch(function (err) {
      setError(MSG.server);
      track('signup_submit_error', { message: String(err) });
    }).then(function () { setLoading(false); });
  }

  function clearAuto() {
    clearTimeout(autoTimer);
    if (scrollHandler) { removeEventListener('scroll', scrollHandler); scrollHandler = null; }
  }

  function scheduleAuto() {
    if (suppressed()) return;
    if (matchMedia('(min-width: 768px)').matches) {
      autoTimer = setTimeout(function () { open(null); }, cfg.desktopDelayMs);
    } else {
      scrollHandler = function () {
        var max = document.documentElement.scrollHeight - innerHeight;
        if (max > 0 && scrollY / max >= cfg.mobileScrollRatio) open(null);
      };
      addEventListener('scroll', scrollHandler, { passive: true });
    }
  }

  function track(name, props) {
    if (typeof cfg.onEvent === 'function') cfg.onEvent(name, props);
  }

  function reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    form.reset(); setError(''); setLoading(false); show('form');
  }

  function init(options) {
    cfg = Object.assign({
      root: '#sd-signup', endpoint: null, desktopDelayMs: 1500, mobileScrollRatio: 0.4,
      suppressDays: 14, source: 'popup', onEvent: null
    }, options || {});
    root = document.querySelector(cfg.root);
    if (!root) return;
    panel = root.querySelector('[role="dialog"]');
    form = root.querySelector('form');
    input = form.querySelector('input[type="email"]');
    submit = form.querySelector('[type="submit"]');
    errorEl = root.querySelector('.sd-form__error');
    views = Array.prototype.slice.call(root.querySelectorAll('[data-view]'));

    form.addEventListener('submit', onSubmit);
    input.addEventListener('input', function () { if (errorEl.textContent) setError(''); });
    root.querySelectorAll('[data-sd-signup-close]').forEach(function (b) {
      b.addEventListener('click', function () { close(b.classList.contains('sd-modal__scrim') ? 'scrim' : 'button'); });
    });
    document.querySelectorAll('[data-sd-signup-open]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        open(b);
      });
    });
    scheduleAuto();
  }

  window.SDSignup = { init: init, open: function () { open(null); }, close: close, reset: reset };
})();
