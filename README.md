# Handoff Spec: Sugar Daddy — Homepage + Inner Circle Sign-up

> **Runnable project:** This package now includes a vanilla JavaScript app based on layout 1a.
> Run `npm ci` and `npm run dev` (Node 24 recommended). Run `npm run check` to build and
> test it; install Chromium once with `npx playwright install chromium`.
> See [DEVELOPMENT.md](DEVELOPMENT.md) for folder ownership, signup configuration and remaining integrations.
> The original handoff files below are preserved. Signup is unavailable until an endpoint or explicit demo mode is configured.

**Version:** 1.0 · **Date:** 2026-11-19 · **Primary layout:** 1a "Clean cut" · **Source:** Sugar Daddy design canvas (layouts 1a / 1b / 1c)

## What's in this package

| Path | What it is |
|---|---|
| `README.md` | This spec. Start here. |
| `tokens/tokens.css` | Design tokens as CSS custom properties. Source of truth. |
| `tokens/tokens.json` | The same tokens in W3C design-token format (Style Dictionary / Tailwind / Figma import). |
| `assets/*.svg` | Hero artwork (`sd-hero.svg`) and the five section illustrations (`sd-c1…c5.svg`). Placeholders until photography exists (§11). |
| `reference/index.html` | Production-quality reference build of layout 1a: semantic HTML, responsive, accessible. |
| `reference/styles.css` | Styles for the reference build. Uses tokens only, except where a value appears once. |
| `reference/signup-modal.js` | Framework-free sign-up modal (8 KB unminified, no dependencies). Triggering, suppression, focus trap, validation, submit states. |
| `screenshots/` | Renders of the reference build: desktop 1440, tablet 900, mobile 390, and the modal's default, error and success states. |

**How to use the reference build:** open `reference/index.html` directly in a browser. Add `?sd_popup=1` to force the modal and `?sd_popup=0` to suppress it. The modal is in demo mode (`endpoint: null`), so submissions succeed after 700 ms without a network call. It's plain HTML/CSS/JS so it ports to any stack (React, Next.js, a WordPress theme). Keep the class names and token names when you port it, so later design changes map straight across.

---

## 1. Overview

Sugar Daddy is an editorial men's health and wellness publication. It covers training, bloodwork and nutrition, mental health, sleep, grooming, sex and longevity. The homepage has three jobs:

1. **Establish the brand.** It should feel premium and grown-up: a gentleman's club, not a gym flyer. That's the reason for the gold foil, pinstripe, crest and serif type.
2. **Route readers into a section.** There are ten sections. The section nav lists all ten; the homepage catalog features five.
3. **Capture email.** The Inner Circle newsletter is the primary conversion. The modal and the announcement bar both drive to it.

**Audience:** men roughly 30–60 who are busy and somewhat skeptical. Copy is direct, a little wry and never preachy. Treat the voice as part of the design.

---

## 2. Layout

### Page structure (top to bottom)

| # | Block | Ground | Notes |
|---|---|---|---|
| 1 | Announcement bar | `ink-900` | One line. "Request entry" opens the modal. |
| 2 | Header | `wine-800` + pinstripe | 3-column grid: utility nav · centered brand lockup · Subscribe. |
| 3 | Section nav | `wine-800` + pinstripe | 10 links. Hairline gold rules above and below. |
| 4 | Hero | `wine-800` + pinstripe | 2 columns, 1fr / 1fr, min-height 620px. Copy left, framed artwork + crest right. |
| 5 | Creed band | `ink-900` + pinstripe | Centered pull quote with an ornament. |
| 6 | Section catalog | `bone-100` | Heading row with a double rule, then a 5-column card grid. |
| — | Footer | — | **Not designed** (§12). |

### Grid & spacing

- **Max content width:** 1280px design canvas. The layout is fluid, with side gutters of `--sd-gutter` (`clamp(20px, 7.5vw, 96px)`). On ultra-wide screens, wrap the page in `max-width: 1440px; margin-inline: auto` and keep the dark grounds full-bleed.
- **Vertical rhythm:** sections use `--sd-section-y` (`clamp(64px, 8vw, 104px)`).
- **Catalog grid:** `repeat(5, minmax(0, 1fr))` with a 30px gap.
- **Corners:** square everywhere (`--sd-radius: 0`). The crest is the only round element. Keep it that way; it's part of the brand.

---

## 3. Design tokens used

Full list in `tokens/tokens.css` (75 tokens). The ones that carry the look:

### Color

| Token | Value | Usage |
|---|---|---|
| `--sd-color-ink-900` | `#0e0406` | Announcement bar, creed band |
| `--sd-color-ink-800` | `#140709` | Modal panel; text on gold buttons |
| `--sd-color-wine-800` | `#1c070b` | Header, nav, hero ground |
| `--sd-color-bone-100` | `#f3ede3` | Light sections |
| `--sd-color-bone-200` | `#ebe2d6` | Row hover on bone (layout 1b) |
| `--sd-color-copper-500` | `#c9844b` | Accents on dark |
| `--sd-color-copper-700` | `#8e4a1f` | **Accent text on bone.** Never use copper-500 for text on bone; it fails contrast. |
| `--sd-color-brass-300` | `#e2b582` | Eyebrows, labels, ornaments on dark |
| `--sd-color-champagne-200` | `#f3dcae` | Links, hover and focus ring on dark |
| `--sd-color-text-on-dark` | `#f2ece4` | Primary text on dark |
| `--sd-color-text-on-dark-muted` | `rgba(242,236,228,.78)` | Body copy on dark |
| `--sd-color-text-on-light` | `#1e0c10` | Primary text on bone |
| `--sd-color-error-on-dark` | `#f0a37a` | Form errors in the modal |

### Signature treatments

| Token / class | Value | Usage | Rule |
|---|---|---|---|
| `--sd-gradient-foil` / `.sd-btn--foil` | 5-stop gold gradient, 135° | Primary buttons, active pager bar, short accent bars | Fills only. Text on it is always `ink-800`. |
| `--sd-gradient-foil-text` / `.sd-foil-text` | 4-stop gold, clipped to text | Italic headline phrases, the wordmark dot, the crest monogram | **Only at 16px and up**, and only for decoration or headings. Its darkest stop is 5.5:1 on ink, so it is never used for body text. |
| `--sd-texture-pinstripe` / `.sd-pin` | 1px gold line every 18px at 4.5% opacity | Every dark ground | It should be barely visible. If you can see it at a glance, the opacity is too high. |
| Image frame | `outline: 1px solid var(--sd-line-gold-strong); outline-offset: -10px` (−14px in the hero) | Every image | Uses `outline`, not `border`, so it doesn't change layout. |
| Double rule | `border-bottom: 3px double var(--sd-line-double-on-light)` | Section heading rows on bone | — |

### Typography

| Role | Family | Size (desktop → mobile) | Weight / style | Tracking | Case |
|---|---|---|---|---|---|
| Wordmark | Playfair Display | `clamp(24px, 3.3vw, 42px)` | 500 | .2em (.14em mobile) | Upper |
| Hero H1 | Playfair Display | `--sd-text-h1` 64 → 40 | 400; italic phrase in foil | −.01em | Sentence |
| Section H2 | Playfair Display | `--sd-text-h2` 44 → 32 | 400; italic word in `copper-700` | 0 | Sentence |
| Pull quote | Playfair Display | `--sd-text-quote` 38 → 26 | 400 italic | 0 | Sentence |
| Card title | Playfair Display | 25 → 21 | 500 | 0 | Title |
| Card / section number | Playfair Display | 15 | 500 italic | 0 | "No. I" |
| Body large | Barlow | 18 (16 mobile) | 300 | 0 | Sentence |
| Body small | Barlow | 14 | 400 | 0 | Sentence |
| Label / nav / button | Barlow Condensed | 12 (buttons 13) | 600 | .24em (eyebrows .34em) | Upper |
| Small label / tags | Barlow Condensed | 11 | 600 | .18–.26em | Upper |

Fonts load from Google Fonts with `display=swap`. Load these weights only: Playfair 400/500 plus italic 400/500; Barlow 300/400/500; Barlow Condensed 500/600. For production, self-host them as WOFF2 and preload the Playfair 400 and Barlow 300 files that the hero uses.

---

## 4. Components

| Component | Variants | Props / content | Notes |
|---|---|---|---|
| **Button** `.sd-btn` | `--foil` (primary), `--ghost` (secondary on dark) | label | Min height 48px (44px for ghost in the header). Uppercase condensed label. One foil button per view. |
| **Text link** `.sd-link` | — | label, href | Uppercase condensed, with a hairline underline 7px below. |
| **Eyebrow** `.sd-eyebrow` | — | text | ◆ glyph (decorative, `aria-hidden`) followed by uppercase brass text. Sits above every headline. |
| **Brand lockup** `.sd-brand` | full (header), compact (layout 1c: crest + wordmark inline) | — | "Est. MMXXVI" above, wordmark, then the foil tagline between two 36px rules. The whole lockup is one link with `aria-label="Sugar Daddy, home"`. |
| **Crest** `.sd-crest` | 112px (hero), 136px (`--lg`, modal), 84px (mobile), 46px (layout 1c header) | monogram "SD", year | Circle with a 1px gold border and an inner ring drawn with two inset box-shadows. Decorative: `aria-hidden`. |
| **Section nav** `.sd-sectionnav` | — | 10 items; `aria-current="page"` marks the active item | Centered on desktop; scrolls horizontally from 1199px down. |
| **Pager** `.sd-pager` | — | count, active index | Static in v1 (§12). Active bar is foil, 2px; inactive bars are 1px. |
| **Section card** `.sd-card` | 4:5 (1a), 3:4 centered (1c), index row (1b) | number (Roman), title, tags, description, image, href | The whole card is one link. Description clamps at 3 lines. |
| **Creed band** `.sd-creed` | — | quote, attribution | Uses `<blockquote>` + `<footer>`. |
| **Sign-up modal** `#sd-signup` | views: `form`, `success` | endpoint, delays, source | See §6. |

---

## 5. States & interactions

| Element | State | Behavior |
|---|---|---|
| Foil button | Hover | `filter: brightness(1.08)` and a deeper glow shadow, 160ms. |
| Foil button | Active | `brightness(.96)`, shadow removed. |
| Foil button | Disabled / loading | Desaturated, `cursor: progress`, label "Sending…". |
| Ghost button | Hover | Border goes from `gold-strong` to `champagne-200`. |
| Nav and utility links | Hover | Text color goes to `champagne-200`, 160ms. |
| Nav link | Current | `champagne-200` text plus a 1px underline (`aria-current="page"`). |
| Section card | Hover | Image lifts 4px with a deeper shadow (320ms, `--sd-ease-out`); title turns `copper-700`. |
| Index row (1b) | Hover | Background `bone-200`. |
| Any focusable element | Focus-visible | 2px `champagne-200` outline, 3px offset. On bone the outline is `copper-700`. **Never remove focus outlines.** |
| Email input | Focus | 2px `champagne-200` outline. |
| Email input | Invalid | Border `error-on-dark`, `aria-invalid="true"`, message below. The error clears as soon as the user types. |

---

## 6. Inner Circle sign-up modal

### Trigger rules

**Why these rules:** the brief asks for the pop-up "when the user reaches the page". On desktop that's a short delay. On mobile, a modal that covers content on arrival can [hurt Google rankings](https://developers.google.com/search/docs/appearance/avoid-intrusive-interstitials) and annoys readers, so mobile waits for a sign of engagement instead.

| Condition | Behavior |
|---|---|
| Desktop (≥768px) | Auto-opens **1.5s** after load (`desktopDelayMs`). |
| Mobile (<768px) | Auto-opens once the reader scrolls **40%** of the page (`mobileScrollRatio`), as a **bottom sheet**. |
| Already subscribed (`subscribedAt` stored) | Never auto-opens. |
| Dismissed in the last **14 days** (`suppressDays`) | Never auto-opens. |
| Opened by clicking "Request entry" or "Subscribe" (`[data-sd-signup-open]`) | Always opens, ignoring suppression. |
| URL `?sd_popup=1` / `?sd_popup=0` | Force on / force off (QA). |
| Recommended, not built | Suppress for traffic arriving from the newsletter (`utm_medium=email`) and for logged-in subscribers (server flag). |

State lives in `localStorage` under `sd_signup_v1` as `{ dismissedAt, subscribedAt }` timestamps. **No email address is stored client-side.** If storage is blocked (private mode), the modal behaves as if it's a first visit.

### Content

| Slot | Copy | Limit |
|---|---|---|
| Eyebrow | ◆ Members only | 20 chars |
| Title | Join the *Inner Circle* | 30 chars (2 lines at desktop) |
| Lede | One private letter every Sunday: the training, bloodwork, sleep and grooming notes actually worth your time. | 140 chars |
| Perks (3) | Members-only issues and long reads · First look at the Ask Daddy desk · No spam. Leave in one click. | 40 chars each. Hidden on mobile. |
| Label | Email address | — |
| Placeholder | you@example.com | — |
| Button | Request entry → "Sending…" while loading | 16 chars |
| Footnote | Unsubscribe anytime. | — |
| Dismiss | Not now | — |
| Success eyebrow | ◆ You're on the list | — |
| Success title | Welcome to the *Inner Circle.* | — |
| Success body | A confirmation link is on its way to **{email}**. Your first letter arrives Sunday. | Long emails wrap (`word-break: break-all`). |
| Success button | Back to the issue | — |

### Form states

| State | Trigger | UI |
|---|---|---|
| Default | — | Empty input, button enabled. |
| Empty submit | Submit with an empty field | "Enter your email address to join." Focus returns to the input. |
| Invalid | Fails `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$` | "That email doesn't look right. Check it and try again." |
| Offline | `navigator.onLine === false` | "You appear to be offline. Check your connection and try again." |
| Loading | Request in flight | Button disabled, label "Sending…", form `aria-busy="true"`. |
| Server error | Non-2xx response (except 409) or network failure | "Something went wrong on our end. Try again in a moment." The input keeps its value. |
| Already subscribed | HTTP **409** | Treated as success, so the modal never reveals whether an address is already on the list. |
| Success | 2xx response | Swap to the success view, focus the success title, store `subscribedAt`. |

Validation runs on the client only on submit, never on blur. That keeps errors out of the reader's way while they type. **The server must validate again.**

### API contract (backend)

```
POST {endpoint}
Content-Type: application/json
{ "email": "reader@example.com", "source": "homepage-popup", "page": "/" }

201 Created      → success (double opt-in email sent)
409 Conflict     → already subscribed (client shows success)
422 Unprocessable→ invalid email (client shows the server-error message; message copy TBD)
429 Too Many     → rate-limited
5xx              → client shows the server-error message
```

Backend requirements: **double opt-in** (the success copy promises a confirmation email), rate-limit by IP and by email, honeypot or Turnstile against bots, and record a consent timestamp and source. Connect it to the ESP (Klaviyo, Beehiiv, ConvertKit, etc.; to be decided).

### Analytics events

Pass `onEvent(name, props)` to `SDSignup.init` and forward to your analytics tool:

`signup_modal_open {trigger: auto|click}` · `signup_modal_close {reason: escape|scrim|button}` · `signup_submit_success` · `signup_submit_error {message}`

---

## 7. Responsive behavior

| Breakpoint | Changes |
|---|---|
| **≥1200px** (desktop) | As designed. Section nav centered; catalog has 5 columns. |
| **960–1199px** | Section nav left-aligned and scrolls horizontally with snapping. Catalog has 3 columns (rows of 3 + 2). |
| **768–959px** (tablet) | Hero stacks: copy first, then the artwork at 16:10. Modal drops its art panel and becomes a single 560px column. |
| **<768px** (mobile) | Announcement bar shows only "◆ Request entry". Header shows only the centered brand lockup; the utility links and Subscribe are hidden (the announcement bar covers sign-up; Search and Ask Daddy move to the footer or menu, §12). Wordmark tracking tightens to .14em. Hero CTA becomes full width. Crest shrinks to 84px. Catalog has 2 columns. **Modal is a bottom sheet**: full width, max 88dvh, no perks list, input and button stacked, safe-area padding at the bottom. |
| **<420px** | Catalog has 1 column with images at 16:10. |

Mobile type sizes come from the `clamp()` tokens, so nothing needs separate size overrides beyond the ones listed above.

---

## 8. Motion

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Modal scrim | Open / close | Opacity 0 → 1; 4px backdrop blur | 240ms | `--sd-ease-out` `cubic-bezier(.2,.7,.2,1)` |
| Modal panel (desktop) | Open / close | Opacity 0 → 1, translateY 16px → 0 | 320ms | `--sd-ease-out` |
| Modal panel (mobile) | Open / close | Slides up from translateY 100% | 320ms | `--sd-ease-out` |
| Card image | Hover | translateY −4px, shadow deepens | 320ms | `--sd-ease-out` |
| Links, buttons | Hover | Color, border, filter | 160ms | linear |

With `prefers-reduced-motion: reduce`, transitions drop to 1ms and transforms are removed. Unmounting waits 320ms for the exit animation, or 0ms when motion is reduced.

---

## 9. Accessibility

**Contrast** (all measured and all pass WCAG 2.1 AA; most pass AAA):

| Pair | Ratio |
|---|---|
| text-on-dark on wine-800 | 16.5 : 1 |
| body copy (78%) on wine-800 | 10.1 : 1 |
| subtle text (62%) on wine-800 | 6.7 : 1 |
| brass-300 labels on wine-800 | 10.3 : 1 |
| ink-800 on foil, darkest stop | 5.5 : 1 |
| copper-700 on bone-100 | 5.7 : 1 |
| subtle text (62%) on bone-100 | 5.0 : 1 |
| error-on-dark on ink-800 | 9.6 : 1 |

**Structure:** skip link → announcement → `header` → `nav[aria-label="Sections"]` → `main` (`h1` hero, `h2` catalog, `h3` per card) → modal. Decorative glyphs (◆), the crest and all illustrations use `alt=""` or `aria-hidden`. When real photos replace the art, decide alt text per image: cards repeat the title, so keep `alt=""` there.

**Modal:**
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the title and `aria-describedby` pointing to the lede.
- While open, every other top-level element gets `inert` and the body scroll is locked.
- **Focus on open:** an auto-open focuses the close button, so the iOS keyboard doesn't pop up unasked. An open from a click focuses the email input.
- Tab and Shift+Tab are trapped inside the dialog. **Esc** closes it.
- On close, focus returns to the element that opened it.
- Errors render in `role="alert"` (announced immediately) and are linked to the input with `aria-describedby`.
- On success, focus moves to the success title (`tabindex="-1"`), so screen readers announce the confirmation.
- Close button is 44×44px with `aria-label="Close sign-up"`.

**Other:** every tap target is at least 44px. The email input is 16px to stop iOS from zooming. In Windows High Contrast mode, foil text falls back to `CanvasText` so it doesn't disappear.

---

## 10. Edge cases

- **Long section names or other languages:** card titles wrap and descriptions clamp at 3 lines. The section nav scrolls instead of wrapping. Test with German, where strings run about 30% longer.
- **Long headlines:** the hero H1 has `max-width: 14ch` and `text-wrap: balance`. Keep cover lines under about 60 characters.
- **Fewer than 5 featured sections:** the grid keeps fixed column widths, so 3 or 4 cards left-align. Don't stretch them to fill the row.
- **Slow fonts:** `display=swap` falls back to Georgia and system sans. Foil text still renders because the gradient is on the element, not the font.
- **Slow or missing images:** every image has `width` and `height` to prevent layout shift, and the hero has `fetchpriority="high"`. If an image fails, the dark ground behind it keeps the layout intact.
- **JS disabled:** the modal stays `hidden`, and the "Request entry" and "Subscribe" buttons do nothing. In production, make them real links to a `/inner-circle` sign-up page and let JS intercept the click.
- **Storage blocked:** the modal may show on every visit. That's acceptable, but don't let it throw an error.
- **Very short pages on mobile:** if the page can't scroll to 40%, the modal never auto-opens. That's intended.

---

## 11. Variants 1b and 1c (alternates — implement only if chosen)

These share every token and component above. Only the differences are listed.

**1b — Magazine cover**
- Hero is a full-bleed 800px cover with the artwork behind a vertical scrim (`rgba(20,7,9,.84) → .15 → .3 → .95`).
- Double gold frame inset 22px and 28px (1px each, at 35% and 15% opacity).
- Masthead is the wordmark in foil at `--sd-text-masthead` (120px), with the strapline "Health · Strength · Style for men" between rules. Issue line reads "Issue Nº V — November MMXXVI".
- Catalog becomes an editorial index: a 250px intro column, then rows of [Roman numeral 64px · title 36px · tags + description · 136×90 thumbnail], with a 3px double rule on top and `bone-200` row hover.

**1c — After hours**
- The whole page is dark (`ink-800` + pinstripe).
- Header has a compact lockup: 46px crest, inline wordmark, tagline.
- Hero image has an offset 1px foil frame (20px down and right) and a 104px crest seal overlapping its top-right corner. A bone "story card" (Sweet Dreams · *The 10 p.m. shutdown ritual*) overlaps the bottom-left, with a 3px foil left edge.
- Catalog cards are 3:4 and centered, with the Roman numeral between short rules. No descriptions.

---

## 12. Open questions / not yet designed

1. **Photography.** The SVG artwork is placeholder. The brief for real photos: dark, low-key still lifes and portraits in oxblood and brass light (a barbell on a leather bench, a whiskey-colored glass, a straight razor). Keep the inset gold frame on every image.
2. **Footer.** Not designed. It needs: the five remaining sections, About, Contact, Privacy, Terms, social links, a newsletter link, and **a medical disclaimer** ("Content is for information only and is not medical advice. Talk to your doctor."). The disclaimer is strongly recommended for a health publication.
3. **Mobile menu.** On mobile the header hides Search and Ask Daddy. Decide between a hamburger menu and moving them to the footer.
4. **Hero pager.** It's static. Is the hero a rotating carousel of 5 cover stories, or a single story? If it rotates, it needs pause controls (WCAG 2.2.2) and must not auto-advance while the modal is open.
5. **Email service and consent.** Which provider will send the newsletter? Is GDPR or CASL consent wording needed for non-US traffic? Legal should approve the footnote copy.
6. **Brand-name risk.** "Sugar Daddy" has a strong existing association. Check search and ad-platform policies (Google Ads and Meta may restrict it), app store naming, and trademark availability before launch.
7. **Articles, section pages and search.** Out of scope for this handoff.
