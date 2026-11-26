# Sugar Daddy development

The application follows layout 1a in [the original handoff](README.md). It uses
vanilla HTML, CSS and JavaScript with Vite for development and static builds.
The original `reference/`, artwork, tokens and supplied screenshots are retained.

## Run and verify

Use Node 24 (`nvm use`), then:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Without an email backend, homepage newsletter links show
“Sign-up coming soon.” Ordinary clicks open the dialog. Opening the link in a new tab
or following it with JavaScript disabled reaches the dedicated `/inner-circle/` page.

For a design demo, copy `.env.example` to `.env.local`, set `VITE_SIGNUP_DEMO=true`,
and restart Vite. The page identifies demo mode; its completion screen confirms
that no email was sent and no subscription was created. To use a real integration,
set `VITE_SIGNUP_ENDPOINT` instead. A configured endpoint takes precedence over demo.
For builds, export the signup settings explicitly in the shell. Local Vite env
files can configure the dev server. Builds default to signup unavailable.

```sh
npx playwright install chromium webkit  # once per environment
npm run lint                           # Biome lint + format check (no writes)
npm run format                         # apply Biome formatting and safe lint fixes
npm run check                          # lint, then fresh build + Chromium suite + WebKit smoke flows
npm test -- --project=chromium          # Chromium only; still builds fresh output
npm run test:ui                         # interactive runner; also uses a fresh build
npm run build                          # deployment output in dist/
npm run preview                        # inspect deployment output locally
npm run smoke:routes -- http://127.0.0.1:4173  # checks a running preview or staging host
npm run perf                           # isolated mobile benchmark, traces and screenshots
```

Tests build the editorial preview in a separate directory from `dist/` with an empty
endpoint and demo disabled. Tests that need demo explicitly call `SDSignup.init({ demo: true })`;
API tests mock the endpoint. The runner starts its own server on port 4173 and fails
if it is occupied instead of reusing an unrelated or stale process. Traces and failure
screenshots are in ignored `test-results/`; the HTML report is in `playwright-report/`.

For a Linux CI machine, install browser system dependencies as part of setup:

```sh
npm ci
npx playwright install --with-deps chromium webkit
CI=1 npm run check
```

Upload `test-results/` and `playwright-report/` as CI artifacts even on failure.
Installing system dependencies may require administrator access; they are not app
runtime requirements. Use the browser versions installed by the pinned Playwright
package.

On a local Linux machine, WebKit also needs system libraries. If it fails with "Host
system is missing dependencies", run `sudo npx playwright install-deps webkit`. On
Ubuntu 24.04 this installs:

```sh
sudo apt-get install libevent-2.1-7t64 libgstreamer-plugins-bad1.0-0 libavif16
```

Package names vary by distribution; Playwright's error lists the ones it needs. Without
administrator access, run `npm test -- --project=chromium` locally and leave WebKit to CI.

## Source ownership

| Path | Purpose |
| --- | --- |
| `index.html` / `src/intro.css` | Homepage, intro controller and animation, section catalog, modal and footer |
| `inner-circle/index.html` | Standalone signup with a persistent skip-link target |
| `404.html` | Recovery page built for static hosting |
| `src/main.js` | Build-time settings, public QA API and analytics adapter |
| `src/signup-modal.js` | Submission, validation, modal lifecycle and suppression |
| `src/styles.css` / `src/fonts.css` | Application layout and local font faces |
| `tokens/` | Source CSS design values and matching token JSON |
| `assets/` | Original SVG placeholders, packaged by Vite from HTML references |
| `public/licenses/` | Font copyright notices included in deployments |
| `reference/` / `screenshots/` | Original design resources, excluded from production |
| `tests/` | Full Chromium regression suite and shared WebKit flow checks |
| `scripts/performance.mjs` | Repeatable mobile benchmark and Chrome traces |

Stylesheets are linked directly in HTML, so reading and recovery layouts still work
when the application script fails. Forms start with a disabled fieldset, a POST
method, and visible reload instructions. Handlers are installed before controls are
enabled. An unavailable or failed initialization cannot submit an email in a GET URL.
Change the application sources while retaining the original reference for comparison.
Update both token formats when changing shared design values.

## Signup API contract

```dotenv
VITE_SIGNUP_ENDPOINT=/api/newsletter/subscribe
VITE_SIGNUP_DEMO=false
```

These are public, build-time values; restart or rebuild after changing them. Keep ESP
credentials on the server. The Cloudflare Worker implements this endpoint on the website
origin. Use the Cloudflare preview to exercise the Worker and Vite's standalone preview
to inspect the static site.

The client sends:

```http
POST /api/newsletter/subscribe
Content-Type: application/json
Accept: application/json

{"email":"reader@example.com","source":"homepage-popup","page":"/"}
```

The source and page pairs are `homepage-popup` with `/` and `inner-circle-page`
with `/inner-circle/`. The standalone HTML alias uses the same canonical page value.
A filled `website` honeypot is rejected before Mailchimp is contacted.

| Response | Client behavior |
| --- | --- |
| Nonredirected 2xx or 409, `Content-Type: application/json`, JSON object with `ok: true` | Confirmation view, popup suppression timestamp and success event |
| 422 | Address rejection message; field marked invalid |
| 429 | Wait-and-retry message with the delay when `Retry-After` provides seconds. The address is preserved. |
| Redirect, HTML, empty/malformed JSON, missing or false acknowledgement, other failures | Generic retry message. The address is preserved. |
| No response within 15 seconds, including a stalled response body | Timeout message; form enabled for retry |

An empty 204 response is not an acknowledgement under this contract. Align the eventual
backend with this contract before enabling it. API/network errors do not incorrectly mark
the address as invalid. Validation occurs on submit and clears as the reader types.
The input becomes read-only during submission to keep the visible address consistent
with the request being sent. Reinitialization cancels outstanding API or demo work.

A successful backend response must mean that the double-opt-in confirmation was accepted
for delivery. Acknowledgements and duplicate responses show the same conditional inbox
instructions. “Use a different email” opens a blank form while preserving popup
suppression for the current browser.

### Live signup launch gate

1. Approve the newsletter provider and the consent copy.
2. Configure staging with server validation, IP/email rate limits, bot protection,
   consent recording and the provider integration.
3. Submit a staging request through the signup form to a test inbox. Verify the
   email arrives, follow its link, and confirm the provider marks the address opted in.
4. After those checks pass, rebuild with the production `VITE_SIGNUP_ENDPOINT`.

## Homepage intro

The Pulse plays on the first eligible homepage load per tab session. Use
`?sd_intro=1` to replay it or `?sd_intro=0` to bypass it. Reduced motion bypasses
both modes, and normal links to a section open directly at the anchor. The
homepage is immediately usable without JavaScript. The inline controller keeps
the skip controls and 4.6-second fallback available independently of the app
bundle. [Intro handoff and storyboards](sugar-daddy-intro-handoff/README.md)

Homepage integrations can await `window.SDIntro.done` before opening UI that
would interrupt playback. `window.SDIntro.playing` reads the current state,
`window.SDIntro.skip()` skips during playback, and `sd:intro-done` is dispatched
once on `document` when the intro finishes or is bypassed. The signup controller
waits for completion before honoring popup triggers.

## Popup rules and integration

Configured or explicit-demo pages open automatically once the reader scrolls 40% of the
scrollable page height, on every viewport. This replaces the handoff's 1.5-second desktop
delay (README §6) so desktop and mobile share one engagement rule; mobile still presents a
bottom sheet. Subscription and 14-day dismissal suppression are rechecked immediately
before automatic opening; another tab's storage changes reschedule or cancel pending
triggers. Automatic opening occurs at most once per visit: a `sessionStorage` marker
(`sd_signup_session_v1`) keeps a reload in the same tab from showing it again, even if the
reader left without closing it. A new tab or browser session counts as a new visit. Explicit
clicks always open the dialog, including when unavailable.

`?sd_popup=0` disables automatic opening. `?sd_popup=1` forces it on load on any viewport,
ignoring suppression, the visit marker and availability so QA can inspect unavailable UI.

```js
window.SDSignup.open();
window.SDSignup.close();
window.SDSignup.reset(); // clears timestamps, the visit marker and form, unless submitting
window.SDSignup.init({ demo: true }); // explicit demo; no real conversion
window.SDSignup.init({
  endpoint: '/api/newsletter/subscribe',
  scrollRatio: 0.4,
  suppressDays: 14,
  source: 'homepage-popup',
  onEvent(name, props) { /* forward to analytics */ },
});
```

`init` replaces the controller and listeners, resets the form view and ignores old results.
The default adapter dispatches `sd:analytics` events on `window` with `{ name, props }`
in `event.detail`. Events are `signup_modal_open`, `signup_modal_close`,
`signup_submit_success`, `signup_submit_error`, and the separate `signup_demo_complete`.
No email is included in event props or localStorage. Only suppression timestamps are
persisted under `sd_signup_v1`; demo completion does not set `subscribedAt`.

Automatic opening focuses Close. A click focuses the input if available, otherwise Close.
The dialog traps focus, restores it on dismissal, and respects reduced motion. Success
focuses its heading. Changing addresses focuses the empty email field. The standalone
skip link targets the main landmark in both views.

## Hosting and remaining content

Serve `dist/` at the domain root with directory indexes for `/inner-circle/`, and redirect
`/inner-circle` to `/inner-circle/` (most static hosts do this by default). Configure
unknown page requests to return `dist/404.html` with HTTP 404 while keeping the original
URL. Do not rewrite missing assets or API requests to successful HTML responses. Local
Vite development and preview already provide these recovery semantics. Run
`npm run smoke:routes -- <base-url>` against local preview or the staging origin.
It checks both pages, the redirect and query string, the recovery page and stylesheet,
and missing asset and API routes. The command exits nonzero if a check fails.

The section menu links to the five catalog cards. Local development includes the Issue No. 01
drafts. Builds default to `SD_EDITORIAL_MODE=hidden`, which omits the issue, the three articles,
and their entry links. Export `SD_EDITORIAL_MODE=preview` for a staging build with draft notices
and `noindex`. Pass `--editorial=preview` to its route smoke command. A `published` build
requires approved source pages with the draft markers and `noindex` removed. Pass
`--editorial=published` to smoke-test that artifact.

The nine specified Latin font faces are self-hosted from pinned Fontsource packages with
`font-display: swap`. Both main pages preload Playfair 400 and Barlow 300; Vite rewrites
font URLs to hashed assets. Keep `licenses/` in deployed output. See the
[Fontsource guide](https://fontsource.org/docs/getting-started/install) for package usage;
add appropriate subsets when supporting characters beyond Latin.

## Mobile performance

`npm run perf` builds into ignored `performance-artifacts/site/`, starts a private preview
on port 4180, and closes it afterward. It configures a measurement-only endpoint to observe
form readiness but never submits an address. It leaves deployment `dist/` unchanged.

The custom profile uses a 390×844 viewport, cold cache, 150ms network latency, 1.6Mbit/s
download, 750Kbit/s upload and 4× CPU slowdown. `report.json` contains LCP, FCP, CLS,
font bytes and controller readiness; `*-trace.json` can be opened in Chrome's Performance
panel. Screenshots capture home, standalone signup and the mobile modal. The
home baseline bypasses the intro. A separate first-visit run records
`introReadyMs` from navigation to overlay removal and scroll unlock. Two more runs record
`introSkipToUnlockMs` and `introSkipFocusedMain` for a tap and Escape.

These are local laboratory measurements, not production field metrics or physical-device
validation. See `PERFORMANCE.md` for the recorded baseline and limitations.

## Cloudflare Worker release

Use Node 24.22 or newer within the Node 24 line. The Cloudflare CLI and Cloudflare Vite
plugin are pinned to release candidates that support `cloudflare.config.ts`. The regular
Vite build and preview still serve the static site from `dist/`. The Cloudflare build
produces a Worker and static assets under `.cloudflare/output/v1/`.

Verify the deployment artifact locally with signup disabled:

```sh
SD_EDITORIAL_MODE=preview npm run cloudflare:build -- --mode staging
npm run cloudflare:preview -- --mode staging --port 4182 --strictPort
npm run smoke:routes -- http://127.0.0.1:4182 --cloudflare --editorial=preview
npm run test:newsletter
```

The Worker tests use isolated local D1 and mock provider requests. The local Cloudflare
build uses a placeholder D1 ID when none is configured and signup is disabled.
Enabling signup requires a target D1 UUID, the same-origin newsletter endpoint,
and demo mode off. Disabling signup requires an empty endpoint and demo mode off.

### Staging and production

1. Select the Sugar Daddy Cloudflare account. Create distinct D1 databases for
   `sugar-daddy-staging` and `sugar-daddy`. Apply the committed schema to the intended
   database with `npx cf d1 migrations apply "$SD_D1_DATABASE_ID"`. The Worker removes
   expired counters daily at 04:00 UTC.
2. Create separate Mailchimp audiences for staging and production. In each, configure
   text fields with merge tags `SDSOURCE` and `SDCONSENT`, with no other required merge
   fields. Set the audience sender and confirmation message, enable the final welcome
   email, and test whether API-created pending contacts receive both messages at the
   appropriate point. Use the real provider's unsubscribe link in the welcome email
   and campaign. Use a reply inbox the editorial team monitors.
3. For the target environment, export `SD_D1_DATABASE_ID`, `SD_MAILCHIMP_SERVER`
   (data center prefix), `SD_MAILCHIMP_AUDIENCE_ID`, and `SD_SIGNUP_ENABLED=true`.
   Set `SD_PRODUCTION_DOMAIN` only for production. Build with
   `SD_EDITORIAL_MODE=preview VITE_SIGNUP_ENDPOINT=/api/newsletter/subscribe npm run cloudflare:build -- --mode staging`.
   For production use `--mode production` and the approved `SD_EDITORIAL_MODE`. Build and deploy each mode
   together because they share a local output directory.
4. Provide `MAILCHIMP_API_KEY` and a randomly generated `SIGNUP_LIMIT_KEY` as Worker
   secrets. Deploy the matching prebuilt version with
   `npx cf deploy --prebuilt --mode staging --secrets-file /absolute/path/to/secrets.env`.
   Use a separate gitignored or external secrets file for each environment. Leave the
   production custom domain unattached until staging passes and the issue is approved.
5. Run `npm run smoke:routes -- <staging-origin> --cloudflare --signup-enabled --editorial=preview`.
   Test one fresh inbox through the homepage popup and another through the standalone
   form. Verify confirmation, the pending-to-subscribed transition, welcome delivery,
   issue links, first-source attribution across a duplicate, and unsubscribe.
6. After issue approval, replace the draft notices with actual publication dates,
   add the qualified reviewer's credentials and review date wherever needed, and
   remove the issue and article `data-editorial-draft` markers and `noindex` tags before
   building with `SD_EDITORIAL_MODE=published`. Verify the approved byline and editor
   bio. Add the final domain to links in the welcome email and confirm its sender and
   reply address. Repeat the route smoke on the production origin before scheduling
   the first Sunday letter.

To disable live signup, rebuild and deploy with `SD_SIGNUP_ENABLED=false`,
`VITE_SIGNUP_ENDPOINT=`, and `VITE_SIGNUP_DEMO=false`. Use the current editorial mode
to keep published pages reachable. Review Worker outcomes
and confirmed Mailchimp subscriptions by first source weekly for the first month.

### Welcome email draft

**Subject** Welcome to the Inner Circle

You’re confirmed. Every Sunday we’ll send the training, sleep, and health stories
we think are worth your time. Get started with Issue No. 01. Open with
*The Sunday wind-down* if you have ten minutes tonight.

See you Sunday,

Sugar Daddy Editorial

Link *Issue No. 01* to `/issues/01/` on the production domain and *The Sunday
wind-down* to `/articles/sunday-wind-down/`. Add the Mailchimp unsubscribe link.

### After launch

Invite Ask Daddy questions by newsletter reply once the inbox is staffed. Get
permission for the edited question before publishing, remove identifying details,
and apply the same review standards as articles. Add the public archive after three
issues and add client-side search at 15 published articles.
