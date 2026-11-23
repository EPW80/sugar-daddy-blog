# Handoff Spec: Sugar Daddy — Site Intro "The Pulse"

**Version:** 1.0 · **Date:** 2026-11-22 · **Length:** 4.3s · **Dependencies:** none (CSS keyframes + 2 KB of vanilla JS)

## Package contents

| Path | What it is |
|---|---|
| `README.md` | This spec. |
| `src/intro.css` | All animation: keyframes, timing, layout. **The only file you need to touch to retime anything.** |
| `src/intro.js` | Controller: skip button, Esc, cleanup, `SDIntro.done` promise, `sd:intro-done` event. |
| `src/intro-head.html` | Snippet for the end of `<head>`. Decides **before first paint** whether the intro plays. |
| `src/intro-markup.html` | Overlay markup. Paste as the **first child of `<body>`**. |
| `demo/index.html` | Working demo over a stand-in page. Open it directly in a browser; the "Replay intro" link replays it. |
| `screenshots/00-storyboard-desktop.png` | All 9 beats on one sheet (1440×900). |
| `screenshots/00-storyboard-mobile.png` | 5 key beats on one sheet (iPhone 13, 390×664). |
| `screenshots/desktop/*.png` | Each beat at full resolution (2880×1800), named by timestamp, plus the Skip button's focus state. |
| `screenshots/mobile/*.png` | Each mobile beat at full resolution (1170×1992). |
| `screenshots/intro-recording.mp4` | Real-time screen recording of the demo, 1280×720. |

The desktop and mobile frames were captured by pausing the CSS animations at exact timestamps, so each one shows precisely what's on screen at that moment.

---

## 1. Overview

**What it is:** a branded opening that plays the first time someone reaches the homepage in a browser session, then opens onto the page.

**Why it exists:** Sugar Daddy positions itself as a premium men's health publication. The intro sets that tone before any content shows, using only the brand's own pieces: the heartbeat line from the hero art, the SD crest, gold foil and the pinstripe. It's a short brand moment, not a loading screen. The page loads normally underneath and is fully rendered by the time the doors open.

**Story in one line:** a pulse appears → the crest forms around its heartbeat → the name rises → the screen parts like doors onto the homepage.

---

## 2. Timeline

| Time | Beat | What moves | Easing | Frame |
|---|---|---|---|---|
| 0.0s | Black | Pinstriped `#0e0406` covers the viewport. | — | `01-black` |
| 0.2–1.3s | **Pulse** | Gold heartbeat line wipes in left to right (`clip-path: inset()` from 100% → 0); the spike lands at screen center. A copper glow blooms behind it (0.3–2.9s). | `cubic-bezier(.6,0,.3,1)` | `02-pulse` |
| 0.9–1.8s | **Crest** | Seal ring draws clockwise from 12 o'clock (`stroke-dashoffset 1 → 0` with `pathLength="1"`). Dark disc fades in at 1.1s, inner ring at 1.4s. | same | `03-crest-ring` |
| 1.3–1.9s | **Monogram** | "SD" in foil comes into focus: blur 8px → 0, scale .9 → 1, opacity 0 → 1. "Est. MMXXVI" shows from 1.6s to 2.0s. The pulse fades out from 1.8s. | `cubic-bezier(.2,.7,.2,1)` | `04-monogram` |
| 2.0–2.6s | **Rise** | Crest moves up 122px and scales to .6. | `cubic-bezier(.6,0,.2,1)` | `05-rise-and-name` |
| 2.1–2.6s | **Name** | SUGARDADDY rises in letter by letter, **40ms apart** (each goes from translateY 22px + blur 4px to rest over 550ms). The foil "." lands last at 2.6s. | `cubic-bezier(.2,.7,.2,1)` | `05` |
| 2.6–3.15s | **Promise** | The tagline rules grow outward from center and "Take care of yourself" fades in. | same | `06-full-lockup` |
| 3.0–3.25s | Clear | The whole stage fades out and scales to 1.03. | ease-in | — |
| 3.25–4.1s | **Seam** | A 1px champagne seam with a soft glow draws across the middle (300ms), then fades (from 3.65s). | `cubic-bezier(.6,0,.3,1)` | `07-seam` |
| 3.5–4.3s | **Doors** | Top and bottom halves slide apart (`translateY ∓101%`). The page underneath eases from opacity .35 / scale .985 to rest (3.55–4.45s). | `cubic-bezier(.7,0,.2,1)` | `08-doors-open` |
| 4.3s | Done | The overlay gets `visibility:hidden`; the controller removes it from the DOM and fires `sd:intro-done`. | — | `09-revealed` |

**Retiming:** every delay and duration lives in `src/intro.css`. The beats are tuned to overlap, so to speed it up or slow it down, multiply every value by the same factor (×0.75 gives a 3.2s cut). Keep two rules: (1) the stage must finish fading before the seam starts, or the seam reads as a strikethrough on the wordmark; (2) `.sdi`'s `sdi-done` delay and the timer in `intro.js` must stay past the end of the door animation.

---

## 3. Design tokens used

| Token (from the main package) | Value | Where |
|---|---|---|
| `--sd-color-ink-900` | `#0e0406` | Door panels |
| `--sd-color-wine-800` | `#1c070b` | Body background while the intro plays (no light flash when the doors open) |
| `--sd-color-copper-500` | `#c9844b` | Pulse line, glow |
| `--sd-color-brass-300` | `#e2b582` | Crest ring, "Est. MMXXVI", tagline rules |
| `--sd-color-champagne-200` | `#f3dcae` | Seam, Skip button, focus ring |
| `--sd-color-text-on-dark` | `#f2ece4` | Wordmark letters |
| `--sd-gradient-foil-text` | 4-stop gold, 135° | "SD" monogram, the wordmark ".", the tagline |
| `--sd-texture-pinstripe` | 1px line / 18px at 4.5% | Door panels |
| Playfair Display 500 / 500 italic | — | Wordmark (`clamp(30px, 5vw, 60px)`, tracking .2em), monogram (62px italic), tagline (18px italic) |
| Barlow Condensed 600 | — | "Est. MMXXVI", "Skip intro" (11px, tracking .26–.42em, uppercase) |

`intro.css` uses literal hex values rather than custom properties, so it works on its own. If you're also using the main Sugar Daddy package, you can swap them for the tokens one for one.

---

## 4. Behavior rules

| Rule | Why |
|---|---|
| Plays **once per browser session** (`sessionStorage` key `sd_intro_seen`). | A reader clicking back to the homepage shouldn't sit through it again. |
| The `<head>` snippet decides **before first paint** and adds `.sd-intro-playing` or `.sd-intro-off` to `<html>`. | No flash of the intro for people who shouldn't see it, and no flash of the page for people who should. |
| **Never plays with `prefers-reduced-motion: reduce`.** `intro.css` also hides it there, as a second guard. | Vestibular safety (WCAG 2.3.3). |
| **Skip intro** fades in at 0.6s, bottom-right. It's the **first Tab stop**, and **Esc** also skips. Skipping fades the overlay out in 300ms, then removes it. | Anyone in a hurry can leave immediately; keyboard users are never trapped. |
| Page scroll is locked while the intro plays. | Stops the page moving behind the doors. |
| **Anything else that interrupts** (newsletter pop-up, cookie banner, chat widget) waits for `SDIntro.done`. | Interruptions stacked back to back feel like an ambush. |
| The overlay is `aria-hidden` except for the Skip button. | It's decorative; screen readers go straight to the page. |
| Safety net: `intro.js` removes the overlay at **4.6s** even if `animationend` never fires (backgrounded tab, throttled timers). | The page can never get stuck behind the intro. |
| QA: `?sd_intro=1` forces it, `?sd_intro=0` disables it. | — |
| **Homepage only** (recommended). | Readers arriving on an article from search came to read; 4 seconds is a cost there. |

---

## 5. Integration

**1. In `<head>`**, after your stylesheets, paste `src/intro-head.html` and fix the `intro.css` path.

**2. First child of `<body>`:** paste `src/intro-markup.html`.

**3. Wrap the rest of the page** in `<div class="sdi-page">…</div>` so it gets the reveal motion. Keep any `position: fixed` UI (modals, cookie banners) **outside** this wrapper, because its temporary `transform` would otherwise trap fixed positioning.

**4. Before `</body>`:** `<script src="intro.js"></script>`, then gate anything that shouldn't overlap:

```html
<script>
  SDIntro.done.then(function () {
    // start newsletter pop-up timers, chat widgets, etc.
  });
</script>
```

### JS API

```ts
window.SDIntro: {
  playing: boolean;        // true if the intro is running on this page load
  done: Promise<void>;     // resolves when it ends, is skipped, or immediately if it never played
  skip(): void;            // programmatic skip
}
document.addEventListener('sd:intro-done', handler); // same moment as `done`
```

### Frameworks

- **React / Next.js:** render the overlay in the root layout. Put the head snippet in `<Head>` (Pages Router) or as an inline `<script>` in `app/layout.tsx` with `dangerouslySetInnerHTML`; it **must** run before hydration. Mount `intro.js` logic in a `useEffect`, and unmount on `sd:intro-done`. Render the page normally on the server; the overlay just covers it.
- **WordPress:** enqueue `intro.css` and `intro.js`, print the head snippet with `wp_head` (priority 1), and print the markup with `wp_body_open`. Wrap the theme's content in `.sdi-page`, or drop that class; the reveal motion is optional.

---

## 6. Accessibility

| Check | Detail |
|---|---|
| Reduced motion | Intro never mounts. Verified. |
| Keyboard | "Skip intro" is the first Tab stop (verified); Enter or Space skips; Esc skips from anywhere. Focus ring: 2px `#f3dcae`, 3px offset (see `10-skip-focused`). |
| Screen readers | Stage and doors are `aria-hidden`; only the Skip button is exposed. No live announcements. |
| Flashing | No flashes. The brightest change is the seam glow, well under the WCAG 2.3.1 three-flashes threshold. |
| Contrast | Skip label `#f3dcae` on `#0e0406` is 15.1:1. |
| Duration | 4.3s, under the 5s that WCAG 2.2.2 lets motion run without a pause control, and skippable anyway. |
| Tap target | Skip button is at least 44px tall. |

---

## 7. Responsive behavior

| Viewport | Behavior |
|---|---|
| Desktop | As storyboarded. The pulse SVG stretches to the full width (`preserveAspectRatio="none"` + `vector-effect: non-scaling-stroke`, so the line weight stays 2.5px). |
| Tablet | Same; the wordmark scales with `clamp(30px, 5vw, 60px)`. |
| Mobile | Same timing. The spike narrows horizontally (intended: it reads as a sharper beat). The wordmark drops to 30px and the crest stays 150px. See `00-storyboard-mobile.png`. |
| Very short screens (landscape phone, < 420px tall) | The crest rise (−122px) can approach the top edge. Optional: add `@media (max-height: 420px) { .sdi-crest { display:none } }` for a name-only version. |

---

## 8. Performance

- Animates only `transform`, `opacity`, `filter`, `clip-path` and `stroke-dashoffset`, so there's no layout or paint thrash. It holds 60fps on mid-range Android in practice; test on your lowest target device.
- **Zero network requests**: the artwork is inline SVG.
- **Fonts:** the wordmark beat starts at 2.1s. If Playfair Display hasn't loaded by then, it renders in Georgia. Preload the Playfair Display 500 WOFF2 (`<link rel="preload" as="font" crossorigin>`).
- **LCP:** the page renders underneath from the first frame, so the hero image is already loaded when the doors open. Lighthouse may still count the overlay as the LCP element on cold loads. If that matters, measure with real-user monitoring rather than lab numbers.
- Removed from the DOM when done, so nothing is left running afterwards.

---

## 9. Edge cases

| Case | Behavior |
|---|---|
| Tab opened in the background | Animations may pause; the 4.6s safety timer removes the overlay when timers run. |
| `sessionStorage` blocked (private mode, strict settings) | Plays on every homepage load. Acceptable; it never throws. |
| JS disabled | The head snippet doesn't run, so `<html>` gets neither class. The CSS animation still plays and hides itself at 4.3s via `sdi-done`, but scroll isn't locked and Skip does nothing. Acceptable degradation. |
| Back/forward cache restore | The overlay is already removed; it doesn't replay. |
| Deep link to `/#section` | Plays, then the page is at the anchor when the doors open. If that feels wrong, skip the intro when `location.hash` is set (one line in the head snippet). |
| Bots / crawlers | They see the page content in the DOM; the overlay is `aria-hidden`. |

---

## 10. QA checklist

- [ ] First visit in a fresh tab: plays fully; page usable at about 4.3s.
- [ ] Reload in the same tab: does **not** play.
- [ ] `?sd_intro=1`: plays every time.
- [ ] Tab once, then Enter: skips; focus lands on the page.
- [ ] Esc at any point: skips.
- [ ] OS "Reduce motion" on: never plays, no flash.
- [ ] Newsletter pop-up (if present) appears about 1.5s **after** the intro ends, never during it.
- [ ] iPhone SE (375×667) and a landscape phone: the lockup fits and Skip is reachable.
- [ ] Throttled "Slow 4G": no light flash between the doors; the wordmark is in Playfair, not Georgia (if preloaded).
