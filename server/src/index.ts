import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { initData } from './clients.js';
import { api } from './routes.js';
import { startScheduler } from './finders.js';
import { docsRouter } from './docs.js';

/**
 * ProspectIQ server: the JSON API under /api, the documentation under
 * /docs (Markdown in docs/, rendered on request), the built React app for
 * everything else, and the finder scheduler in-process (no cron needed).
 * With BASE_PATH set (e.g. /prospectiq) the whole app lives under that
 * prefix, so it can share a domain with other apps behind nginx.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');

initData();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// The app is framed inside Launchpad: allow those parents, nothing else.
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://app.gohighlevel.com https://*.gohighlevel.com https://*.leadconnectorhq.com https://*.msgsndr.com https://app.launchpadinnovations.ai https://*.launchpadinnovations.ai");
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

const site = express.Router();
site.use(express.json({ limit: '2mb' }));
site.use(cookieParser());

site.get('/api/health', (_req, res) => res.json({ ok: true, name: 'ProspectIQ', base: config.basePath || '/', time: Date.now() }));
site.use('/api', api);
site.use('/docs', docsRouter());
site.use('/api', (err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({ error: err.message || 'Something went wrong.' });
});

if (fs.existsSync(clientDist)) {
  site.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  site.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  site.get('*', (_req, res) => res.status(503).send('ProspectIQ: the client is not built yet. Run "npm run build".'));
}

app.use(config.basePath || '/', site);
if (config.basePath) app.get('*', (_req, res) => res.status(404).send(`ProspectIQ lives at ${config.basePath}/`));

startScheduler((s) => console.log(new Date().toISOString(), s));

app.listen(config.port, () => {
  console.log(`ProspectIQ listening on http://localhost:${config.port}${config.basePath}/ (data: ${config.dataDir})`);
  if (!config.adminKey) console.warn('ADMIN_KEY is not set: the admin panel is locked until it is.');
});
