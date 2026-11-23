# Supplied visual references

The PNG files are the original handoff renders: desktop, tablet and mobile homepages,
desktop modal default/error/success, and the mobile bottom sheet. They are design
references, not generated application snapshots, and are excluded from `dist/`.

Compare the runnable app at 1440px, 900px and 390px wide. Use `?sd_popup=0` for the
homepage and `?sd_popup=1` for the popup. Enable explicit demo mode (`VITE_SIGNUP_DEMO=true`) before reviewing form states.
Submit an empty form for an error or an example email for demo completion. Browser-test failure screenshots and traces are
written to the separate ignored `test-results/` folder.
