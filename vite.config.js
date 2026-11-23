import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

// Run after Vite's file handlers: missing assets and API requests stay real 404s.
function recoveryPage() {
  let config;
  const install = (server, preview) => () => {
    server.middlewares.use(async (req, res, next) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const extension = extname(pathname);
      const accept = req.headers.accept || '*/*';
      if (!['GET', 'HEAD'].includes(req.method) || (extension && extension !== '.html') ||
          (!accept.includes('text/html') && !accept.includes('*/*')) || pathname.startsWith('/api/')) return next();
      try {
        const directory = resolve(config.root, preview ? config.build.outDir : '.');
        // Vite resolves directory indexes before its final HTML-serving middleware.
        let decoded = null;
        try { decoded = decodeURIComponent(pathname); } catch { /* A malformed escape cannot name a file. */ }
        const candidate = decoded === null ? null : resolve(directory, `.${decoded}`);
        const found = candidate?.startsWith(`${directory}/`) ? await stat(candidate).catch(() => null) : null;
        if (found?.isFile()) return next();
        // Match static hosts: a directory with an index gets its canonical trailing slash.
        if (found?.isDirectory() && !pathname.endsWith('/') &&
            await stat(resolve(candidate, 'index.html')).then(value => value.isFile(), () => false)) {
          // Collapse leading slashes so the Location can never be protocol-relative.
          res.statusCode = 301;
          res.setHeader('Location', `/${pathname.replace(/^\/+/, '')}/${new URL(req.url, 'http://localhost').search}`);
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
      } catch (error) { next(error); }
    });
  };
  return {
    name: 'sugar-daddy-recovery-page',
    configResolved(value) { config = value; },
    configureServer(server) { return install(server, false); },
    configurePreviewServer(server) { return install(server, true); },
  };
}

export default defineConfig({
  appType: 'mpa',
  plugins: [recoveryPage()],
  build: {
    rolldownOptions: {
      input: {
        home: fileURLToPath(new URL('./index.html', import.meta.url)),
        signup: fileURLToPath(new URL('./inner-circle/index.html', import.meta.url)),
        notFound: fileURLToPath(new URL('./404.html', import.meta.url)),
      },
    },
  },
});
