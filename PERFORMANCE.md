# Mobile performance baseline

Measured November 21, 2026 with `npm run perf`, using the production sources in an
isolated build. The measurement endpoint is configured to make the form available;
no address is submitted and no email-provider latency is included.

Profile: headless Chromium 159, 390×844 viewport, cold cache, 4× CPU slowdown,
150ms emulated network latency, 1.6Mbit/s download and 750Kbit/s upload. Each page
uses a new context. Measurements settle for 2.5 seconds after fonts are ready and
before interaction. These are single-run local laboratory results, not field percentiles.

| Measurement | Homepage | Standalone signup |
| --- | ---: | ---: |
| First contentful paint | 664 ms | 588 ms |
| Largest contentful paint | 664 ms | 588 ms |
| Cumulative layout shift | 0.0108 | 0 |
| Signup controller ready, controls enabled | 487 ms | 449 ms |
| Font requests | 8 | 5 |
| Encoded font payload | 173.7 KiB | 107.7 KiB |
| Font transfer including response overhead | 176.0 KiB | 109.2 KiB |
| Open click to email focus | 16 ms | Already on page |
| JavaScript errors | 0 | 0 |

The local traces do not identify a loading bottleneck that warrants further payload
changes in this pass. Fonts remain the main transferred assets; all are local WOFF2
and the two hero faces are preloaded. The low layout shift includes font swapping.
No additional font or artwork changes were made solely to reduce these measurements.

## November 22 signup and navigation update

Both columns use the same throttled mobile profile and configured measurement
endpoint. The “Before” values are from the four-hour plan review.

| Page | Measurement | Before | After |
| --- | --- | ---: | ---: |
| Homepage | Largest contentful paint | 748 ms | 708 ms |
| Homepage | Cumulative layout shift | 0.0091 | 0.0100 |
| Homepage | Signup controls ready | 575 ms | 548 ms |
| Standalone signup | Largest contentful paint | 596 ms | 584 ms |
| Standalone signup | Cumulative layout shift | 0 | 0 |
| Standalone signup | Signup controls ready | 449 ms | 442 ms |

No result crossed the plan's regression threshold of 20% slower timing or 0.02
higher layout shift. Both pages recorded zero JavaScript errors. Each column is a
single local run, so small differences can reflect run-to-run variation.

## Responsive verification

Separately, WebKit's 320px smoke test exposed a hero grid that expanded to 410px.
Setting explicit zero minimum widths on its grid children fixed the overflow; the
browser test verifies that the document remains 320px wide through signup success.

Run the benchmark again with:

```sh
npm run perf
```

Results, screenshots and Chrome Performance traces are written to the ignored
`performance-artifacts/` folder. Open `home-trace.json` or `signup-trace.json` in
Chrome's Performance panel to inspect timing and network work. The benchmark uses
port 4180, closes its own server, and leaves deployment `dist/` unchanged.

Production hosting, network geography, physical iOS keyboards, screen-reader behavior
and actual email delivery were not measured. Recheck performance on the chosen host
and a physical device before treating this as a production baseline.
