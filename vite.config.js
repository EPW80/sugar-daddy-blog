import { readFile, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

// Run after Vite's file handlers: missing assets and API requests stay real 404s.
function recoveryPage() {
  let config;
  const install = (server, preview) => () => {
    server.middlewares.use(async (req, res, next) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const extension = extname(pathname);
      const accept = req.headers.accept || '*/*';
      if (
        !['GET', 'HEAD'].includes(req.method) ||
        (extension && extension !== '.html') ||
        (!accept.includes('text/html') && !accept.includes('*/*')) ||
        pathname.startsWith('/api/')
      )
        return next();
      try {
        const directory = resolve(config.root, preview ? config.build.outDir : '.');
        // Vite resolves directory indexes before its final HTML-serving middleware.
        let decoded = null;
        try {
          decoded = decodeURIComponent(pathname);
        } catch {
          /* A malformed escape cannot name a file. */
        }
        const candidate = decoded === null ? null : resolve(directory, `.${decoded}`);
        const found = candidate?.startsWith(`${directory}/`)
          ? await stat(candidate).catch(() => null)
          : null;
        if (found?.isFile()) return next();
        // Match static hosts: a directory with an index gets its canonical trailing slash.
        if (
          found?.isDirectory() &&
          !pathname.endsWith('/') &&
          (await stat(resolve(candidate, 'index.html')).then(
            (value) => value.isFile(),
            () => false,
          ))
        ) {
          // Collapse leading slashes so the Location can never be protocol-relative.
          res.statusCode = 301;
          res.setHeader(
            'Location',
            `/${pathname.replace(/^\/+/, '')}/${new URL(req.url, 'http://localhost').search}`,
          );
          res.end();
          return;
        }
        const file = resolve(directory, '404.html');
        let html = await readFile(file, 'utf8');
        if (!preview) html = await server.transformIndexHtml('/404.html', html);
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(req.method === 'HEAD' ? undefined : html);
      } catch (error) {
        next(error);
      }
    });
  };
  return {
    name: 'sugar-daddy-recovery-page',
    configResolved(value) {
      config = value;
    },
    configureServer(server) {
      return install(server, false);
    },
    configurePreviewServer(server) {
      return install(server, true);
    },
  };
}

const issuePages = [
  'issues/01/index.html',
  'articles/sunday-wind-down/index.html',
  'articles/training-on-a-busy-week/index.html',
  'articles/questions-before-bloodwork/index.html',
];
const placeholderDatabaseId = '00000000-0000-4000-8000-000000000001';

function signupBuildDefines(cloudflareBuild) {
  const endpoint = process.env.VITE_SIGNUP_ENDPOINT?.trim() ?? '';
  const demo = process.env.VITE_SIGNUP_DEMO ?? 'false';
  if (cloudflareBuild) {
    const enabled = process.env.SD_SIGNUP_ENABLED ?? 'false';
    const databaseId = process.env.SD_D1_DATABASE_ID ?? '';
    if (enabled !== 'true' && enabled !== 'false')
      throw new Error('Set SD_SIGNUP_ENABLED to true or false for a Cloudflare build.');
    if (demo !== 'false') throw new Error('Set VITE_SIGNUP_DEMO=false for a Cloudflare build.');
    const expectedEndpoint = enabled === 'true' ? '/api/newsletter/subscribe' : '';
    if (endpoint !== expectedEndpoint)
      throw new Error(
        enabled === 'true'
          ? 'Set VITE_SIGNUP_ENDPOINT=/api/newsletter/subscribe when SD_SIGNUP_ENABLED=true.'
          : 'Clear VITE_SIGNUP_ENDPOINT when SD_SIGNUP_ENABLED=false.',
      );
    if (
      enabled === 'true' &&
      (databaseId === placeholderDatabaseId ||
        !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(databaseId))
    )
      throw new Error(
        'Set SD_D1_DATABASE_ID to the target D1 database UUID before enabling signup.',
      );
  }
  return {
    'import.meta.env.VITE_SIGNUP_ENDPOINT': JSON.stringify(endpoint),
    'import.meta.env.VITE_SIGNUP_DEMO': JSON.stringify(demo),
  };
}

export default defineConfig(async ({ command, mode }) => {
  const building = command === 'build';
  const cloudflareBuild = process.env.SD_CLOUDFLARE_BUILD === '1';
  const editorialMode = building ? (process.env.SD_EDITORIAL_MODE ?? 'hidden') : 'preview';
  if (!['hidden', 'preview', 'published'].includes(editorialMode))
    throw new Error('Set SD_EDITORIAL_MODE to hidden, preview, or published.');
  if (cloudflareBuild && editorialMode === 'preview' && building && mode !== 'staging')
    throw new Error('Use --mode staging for a Cloudflare editorial preview build.');
  const pages = [
    'index.html',
    'inner-circle/index.html',
    'editorial-standards/index.html',
    '404.html',
  ];
  if (editorialMode !== 'hidden') pages.push(...issuePages);
  if (editorialMode === 'published') {
    for (const page of issuePages) {
      const html = await readFile(new URL(page, import.meta.url), 'utf8');
      if (/\bdata-editorial-draft\b|<meta\b[^>]*\bnoindex\b/i.test(html))
        throw new Error(
          `Approve and update ${page} before building with SD_EDITORIAL_MODE=published.`,
        );
    }
  }
  return {
    appType: 'mpa',
    define: building ? signupBuildDefines(cloudflareBuild) : undefined,
    plugins: [
      cloudflareBuild ? cloudflare() : recoveryPage(),
      {
        name: 'sugar-daddy-editorial',
        transformIndexHtml(html, { filename }) {
          if (editorialMode === 'hidden')
            return html.replace(
              /^[\t ]*<!-- issue-01:start -->[\s\S]*?<!-- issue-01:end -->\r?\n/gm,
              '',
            );
          if (
            editorialMode === 'preview' &&
            issuePages.some((page) => filename.endsWith(`/${page}`)) &&
            !/<meta\b[^>]*\bnoindex\b/i.test(html)
          )
            return [
              { tag: 'meta', attrs: { name: 'robots', content: 'noindex' }, injectTo: 'head' },
            ];
          return html;
        },
      },
    ],
    environments: {
      client: {
        build: {
          rolldownOptions: {
            input: pages.map((page) => fileURLToPath(new URL(page, import.meta.url))),
          },
        },
      },
    },
  };
});
