import { bindings, defineConfig, triggers } from 'cf/config';

export default defineConfig(({ mode }) => {
  const staging = mode === 'staging';
  const databaseId = process.env.SD_D1_DATABASE_ID;
  const domain = process.env.SD_PRODUCTION_DOMAIN;
  return {
    worker: {
      name: staging ? 'sugar-daddy-staging' : 'sugar-daddy',
      compatibilityDate: '2026-11-22',
      entrypoint: './worker/index.js',
      domains: !staging && domain ? [domain] : [],
      workersDev: staging,
      previewUrls: false,
      observability: { enabled: true, redactQueryString: true },
      assets: {
        htmlHandling: 'auto-trailing-slash',
        notFoundHandling: '404-page',
        runWorkerFirst: ['/api/*', '/inner-circle'],
      },
      env: {
        ASSETS: bindings.assets(),
        SIGNUP_LIMITS: bindings.d1({ id: databaseId || '00000000-0000-4000-8000-000000000001' }),
        SIGNUP_ENABLED: bindings.text(process.env.SD_SIGNUP_ENABLED ?? 'false'),
        CONSENT_VERSION: bindings.text('inner-circle-v1'),
        MAILCHIMP_SERVER: bindings.text(process.env.SD_MAILCHIMP_SERVER ?? ''),
        MAILCHIMP_AUDIENCE_ID: bindings.text(process.env.SD_MAILCHIMP_AUDIENCE_ID ?? ''),
      },
      triggers: [triggers.scheduled({ schedule: '0 4 * * *' })],
    },
  };
});
