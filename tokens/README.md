# Design tokens

`tokens.css` is the design source of truth, linked by the application HTML entry points. `tokens.json`
contains the matching values for design-tool and token-pipeline imports. Keep both in
sync when making design changes; no generated Tailwind or framework theme is needed.

Preserve the `--sd-*` names. In particular, use copper-700 for accent text on bone,
keep corners square, and retain the reduced-motion and forced-colors fallbacks.
See the root README §3 for usage and contrast rules.
