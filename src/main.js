import { initSignup } from './signup-modal.js';

document.querySelector('.sd-sectionnav')?.addEventListener('focusin', (event) => {
  if (event.target.matches('a[href]'))
    event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});

const defaults = {
  endpoint: import.meta.env.VITE_SIGNUP_ENDPOINT?.trim() || null,
  demo: import.meta.env.VITE_SIGNUP_DEMO === 'true',
  standalone: document.body.dataset.page === 'signup',
  source: document.body.dataset.page === 'signup' ? 'inner-circle-page' : 'homepage-popup',
  onEvent(name, props) {
    // Subscribe here to forward events to an analytics provider. No email in props.
    window.dispatchEvent(new CustomEvent('sd:analytics', { detail: { name, props } }));
  },
};
const intro = window.SDIntro;
let signup = initSignup(defaults, intro);

// Keep the handoff's public API available for QA and future integrations.
window.SDSignup = {
  init(options = {}) {
    signup.destroy();
    signup = initSignup({ ...defaults, ...options }, intro);
  },
  open(trigger) {
    signup.open(trigger);
  },
  close(reason) {
    signup.close(reason);
  },
  reset() {
    signup.reset();
  },
};
if (import.meta.hot) import.meta.hot.dispose(() => signup.destroy());
