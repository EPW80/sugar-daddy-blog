const STORAGE_KEY = 'sd_signup_v1';
// Per-tab "this visit" marker, so a reload doesn't re-show a popup the reader already saw.
const SESSION_KEY = 'sd_signup_session_v1';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FOCUSABLE =
  'a[href],button:not(:disabled),input:not(:disabled),[tabindex]:not([tabindex="-1"])';
const messages = {
  empty: 'Enter your email address to join.',
  invalid: 'That email doesn’t look right. Check it and try again.',
  offline: 'You appear to be offline. Check your connection and try again.',
  server: 'Something went wrong on our end. Try again in a moment.',
  rejected: 'That email address wasn’t accepted. Check it and try again.',
  limited: 'Too many requests. Wait a moment and try again.',
  timeout: 'The request took too long. Please try again.',
  unavailable: 'Sign-up coming soon',
};

function demoDelay(signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Canceled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, 700);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function initSignup(options = {}, intro) {
  const cfg = {
    root: '#sd-signup',
    endpoint: null,
    scrollRatio: 0.4,
    suppressDays: 14,
    source: 'homepage-popup',
    standalone: false,
    demo: false,
    onEvent: null,
    ...options,
  };
  const root = document.querySelector(cfg.root);
  if (!root) throw new Error(`Missing signup element: ${cfg.root}`);
  const panel = root.querySelector('.sd-modal__panel');
  const form = root.querySelector('form');
  const input = form.querySelector('input[type="email"]');
  const honeypot = form.elements.namedItem('website');
  const submit = form.querySelector('[type="submit"]');
  const errorEl = root.querySelector('.sd-form__error');
  const views = [...root.querySelectorAll('[data-view]')];
  const successTitle = root.querySelector('[data-success-title]');
  const changeEmail = root.querySelector('[data-signup-change-email]');
  const controls = form.querySelector('fieldset');
  const status = root.querySelector('[data-signup-status]');
  const isDemo = !cfg.endpoint && cfg.demo === true;
  const available = Boolean(cfg.endpoint) || isDemo;
  const force = new URLSearchParams(location.search).get('sd_popup');
  const listeners = new AbortController();
  const background = new Map();
  let isOpen = false;
  let success = false;
  let loading = false;
  let destroyed = false;
  let lastFocus;
  let autoTimer;
  let closeTimer;
  let animationFrame;
  let request;
  let requestTimer;
  let scrollHandler;
  let hadScrollLock = false;
  let autoConsumed = false;
  let pendingOpen;

  function storage(patch) {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const state = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      if (patch) localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, ...patch }));
      return state;
    } catch {
      return {};
    }
  }

  function seenThisVisit(mark) {
    try {
      if (mark) sessionStorage.setItem(SESSION_KEY, '1');
      return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      return false;
    }
  }

  function track(name, props = {}) {
    // Analytics must never prevent signup or break focus management.
    try {
      cfg.onEvent?.(name, props);
    } catch {
      /* Optional integration. */
    }
  }

  function setError(message = '', invalid = false) {
    errorEl.textContent = message;
    if (invalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function setLoading(value) {
    loading = value;
    submit.disabled = value || !available;
    input.readOnly = value;
    submit.textContent = value ? 'Sending…' : 'Request entry';
    form.setAttribute('aria-busy', String(value));
  }

  function showSuccess(value) {
    success = value;
    views.forEach((view) => {
      view.hidden = view.dataset.view !== (value ? 'success' : 'form');
    });
    const labelledElement = cfg.standalone ? root : panel;
    labelledElement.setAttribute(
      'aria-labelledby',
      value ? 'sd-signup-success-title' : 'sd-signup-title',
    );
    labelledElement.setAttribute(
      'aria-describedby',
      value ? 'sd-signup-success-desc' : 'sd-signup-desc',
    );
  }

  function resetForm() {
    form.reset();
    setError();
    showSuccess(false);
  }

  function lockBackground() {
    if (background.size) return;
    hadScrollLock = document.body.classList.contains('sd-scroll-lock');
    for (const element of document.body.children) {
      if (element === root || ['SCRIPT', 'STYLE'].includes(element.tagName)) continue;
      background.set(element, element.hasAttribute('inert'));
      element.inert = true;
    }
    document.body.classList.add('sd-scroll-lock');
  }

  function unlockBackground() {
    for (const [element, wasInert] of background) element.inert = wasInert;
    background.clear();
    document.body.classList.toggle('sd-scroll-lock', hadScrollLock);
  }

  function clearAuto() {
    clearTimeout(autoTimer);
    if (scrollHandler) window.removeEventListener('scroll', scrollHandler);
    scrollHandler = null;
  }

  function open(trigger) {
    if (destroyed || cfg.standalone || isOpen) return;
    if (intro?.playing) {
      pendingOpen = trigger ?? null;
      return;
    }
    clearAuto();
    autoConsumed = true;
    if (!trigger) seenThisVisit(true);
    clearTimeout(closeTimer);
    isOpen = true;
    const candidate = trigger instanceof HTMLElement ? trigger : document.activeElement;
    if (candidate && !root.contains(candidate)) lastFocus = candidate;
    root.hidden = false;
    lockBackground();
    animationFrame = requestAnimationFrame(() => {
      if (!isOpen) return;
      root.classList.add('is-open');
      (success
        ? successTitle
        : trigger && available
          ? input
          : root.querySelector('.sd-modal__close')
      ).focus({ preventScroll: true });
    });
    track('signup_modal_open', { trigger: trigger ? 'click' : 'auto' });
  }

  function close(reason = 'button') {
    pendingOpen = undefined;
    if (!isOpen || cfg.standalone) return;
    isOpen = false;
    cancelAnimationFrame(animationFrame);
    if (!storage().subscribedAt) storage({ dismissedAt: Date.now() });
    root.classList.remove('is-open');
    closeTimer = setTimeout(
      () => {
        root.hidden = true;
        unlockBackground();
        if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
      },
      matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320,
    );
    track('signup_modal_close', { reason });
  }

  function onKey(event) {
    if (!isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close('escape');
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter(
      (element) => element.getClientRects().length,
    );
    const first = items[0];
    const last = items.at(-1);
    if (!first) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !items.includes(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !items.includes(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (loading || destroyed || !available) return;
    const email = input.value.trim();
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      setError(!email ? messages.empty : messages.invalid, true);
      input.focus();
      return;
    }
    setError();
    if (navigator.onLine === false) {
      setError(messages.offline);
      return;
    }
    setLoading(true);
    request = new AbortController();
    const currentRequest = request;
    let timedOut = false;
    // A stalled endpoint must eventually let the reader retry.
    requestTimer = setTimeout(() => {
      timedOut = true;
      currentRequest.abort();
    }, 15000);
    try {
      if (cfg.endpoint) {
        const payload = { email, source: cfg.source, page: location.pathname };
        if (honeypot?.value) payload.website = honeypot.value;
        const response = await fetch(cfg.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
          signal: request.signal,
          redirect: 'error',
        });
        if (response.status === 422) throw new Error(messages.rejected);
        if (response.status === 429) throw new Error(messages.limited);
        if (response.status !== 409) {
          if (
            !response.ok ||
            response.redirected ||
            response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
              'application/json'
          ) {
            throw new Error(messages.server);
          }
          const acknowledgement = await response.json();
          if (
            !acknowledgement ||
            typeof acknowledgement !== 'object' ||
            Array.isArray(acknowledgement)
          )
            throw new Error(messages.server);
        }
      } else {
        await demoDelay(currentRequest.signal);
      }
      if (destroyed) return;
      if (!isDemo) storage({ subscribedAt: Date.now() });
      showSuccess(true);
      if (isOpen || cfg.standalone) successTitle.focus({ preventScroll: true });
      track(isDemo ? 'signup_demo_complete' : 'signup_submit_success');
    } catch (error) {
      if (!destroyed) {
        const message = timedOut
          ? messages.timeout
          : [messages.rejected, messages.limited].includes(error.message)
            ? error.message
            : messages.server;
        setError(message, message === messages.rejected);
        track('signup_submit_error', { message });
      }
    } finally {
      clearTimeout(requestTimer);
      if (!destroyed) setLoading(false);
    }
  }

  function suppressed() {
    if (force === '1') return false;
    if (force === '0' || !available || seenThisVisit()) return true;
    const state = storage();
    return Boolean(
      state.subscribedAt ||
        (state.dismissedAt && Date.now() - state.dismissedAt < cfg.suppressDays * 864e5),
    );
  }

  function tryAuto() {
    if (destroyed || autoConsumed || suppressed()) {
      clearAuto();
      return;
    }
    const distance = document.documentElement.scrollHeight - innerHeight;
    if (force === '1' || (distance > 0 && scrollY / distance >= cfg.scrollRatio)) open();
  }

  function scheduleAuto() {
    clearAuto();
    if (cfg.standalone || destroyed || intro?.playing || autoConsumed || suppressed()) return;
    if (force === '1') {
      autoTimer = setTimeout(tryAuto, 0);
    } else {
      scrollHandler = tryAuto;
      window.addEventListener('scroll', scrollHandler, { passive: true });
    }
  }

  const listen = (element, type, handler) =>
    element.addEventListener(type, handler, { signal: listeners.signal });
  successTitle.textContent = isDemo ? 'Demo complete' : 'Check your inbox';
  root.querySelector('[data-success-live]').hidden = isDemo;
  root.querySelector('[data-success-demo]').hidden = !isDemo;
  changeEmail.hidden = isDemo;
  // A replacement controller must not inherit the old request or view state.
  showSuccess(false);
  setError();
  setLoading(false);
  listen(form, 'submit', onSubmit);
  listen(input, 'input', () => setError());
  listen(changeEmail, 'click', () => {
    if (loading || !success || isDemo) return;
    resetForm();
    input.focus();
  });
  if (!cfg.standalone) {
    listen(document, 'keydown', onKey);
    root.querySelectorAll('[data-sd-signup-close]').forEach((element) => {
      listen(element, 'click', () =>
        close(element.classList.contains('sd-modal__scrim') ? 'scrim' : 'button'),
      );
    });
    document.querySelectorAll('[data-sd-signup-open]').forEach((element) => {
      listen(element, 'click', (event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        )
          return;
        event.preventDefault();
        open(element);
      });
    });
    listen(window, 'storage', (event) => {
      if (event.key === STORAGE_KEY || event.key === null) scheduleAuto();
    });
  }
  // Bind all handlers before making the form usable.
  status.textContent = !available
    ? messages.unavailable
    : isDemo
      ? 'Demo sign-up. No email will be sent.'
      : '';
  status.hidden = available && !isDemo;
  document.querySelectorAll('[data-signup-availability]').forEach((label) => {
    label.hidden = available;
  });
  controls.disabled = !available;
  root.dataset.signupReady = 'true';
  if (!cfg.standalone && intro?.playing) {
    intro.done.then(() => {
      if (destroyed) return;
      if (pendingOpen !== undefined) {
        const trigger = pendingOpen;
        pendingOpen = undefined;
        open(trigger);
      } else {
        scheduleAuto();
        tryAuto();
      }
    });
  } else {
    scheduleAuto();
  }

  return {
    open,
    close,
    reset() {
      if (loading || destroyed) return;
      try {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(SESSION_KEY);
      } catch {
        /* Storage may be blocked. */
      }
      resetForm();
      if (isOpen) input.focus({ preventScroll: true });
    },
    destroy() {
      destroyed = true;
      clearAuto();
      clearTimeout(closeTimer);
      clearTimeout(requestTimer);
      cancelAnimationFrame(animationFrame);
      request?.abort();
      listeners.abort();
      controls.disabled = true;
      delete root.dataset.signupReady;
      if (!cfg.standalone) {
        if (background.size) unlockBackground();
        root.hidden = true;
        root.classList.remove('is-open');
      }
    },
  };
}
