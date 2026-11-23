/* Sugar Daddy — site intro controller. Pair with intro.css and the #sd-intro markup.
   The <head> snippet in index.html decides BEFORE first paint whether the intro plays
   (adds .sd-intro-off to <html> when it shouldn't), so returning visitors never see a flash.
   This file handles skip, Esc, cleanup, and tells the rest of the page when it's done.

   window.SDIntro = { playing: boolean, done: Promise<void> }
   Fires `sd:intro-done` on document when finished (or immediately if it never played). */
(function () {
  'use strict';
  var html = document.documentElement;
  var root = document.getElementById('sd-intro');
  var playing = !!root && !html.classList.contains('sd-intro-off');
  var resolveDone;
  var done = new Promise(function (r) { resolveDone = r; });
  var finished = false, timer;

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    document.removeEventListener('keydown', onKey);
    if (root && root.parentNode) root.parentNode.removeChild(root);
    html.classList.remove('sd-intro-playing');
    resolveDone();
    document.dispatchEvent(new Event('sd:intro-done'));
  }

  function skip() {
    if (finished || !root) return;
    root.classList.add('is-skipped');
    setTimeout(finish, 300);
  }

  function onKey(e) { if (e.key === 'Escape') skip(); }

  window.SDIntro = { playing: playing, done: done, skip: skip };

  if (!playing) { finish(); return; }

  html.classList.add('sd-intro-playing');
  root.querySelector('.sdi-skip').addEventListener('click', skip);
  document.addEventListener('keydown', onKey);
  root.addEventListener('animationend', function (e) { if (e.target === root && e.animationName === 'sdi-done') finish(); });
  timer = setTimeout(finish, 4600); // safety net if animationend never fires (backgrounded tab)
})();
