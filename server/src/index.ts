import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { initData } from './clients.js';
import { api } from './routes.js';
import { startScheduler } from './finders.js';

/**
 * ProspectIQ server: the JSON API under /api, the built React app for
 * everything else, and the finder scheduler in-process (no cron needed).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');

initData();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// The app is framed inside Launchpad: allow those parents, nothing else.
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://app.gohighlevel.com https://*.gohighlevel.com https://*.leadconnectorhq.com https://*.msgsndr.com https://app.launchpadinnovations.ai https://*.launchpadinnovations.ai");
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'ProspectIQ', time: Date.now() }));
app.use('/api', api);

app.use('/api', (err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({ error: err.message || 'Something went wrong.' });
});

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('*', (_req, res) => res.status(503).send('ProspectIQ: the client is not built yet. Run "npm run build".'));
}

startScheduler((s) => console.log(new Date().toISOString(), s));

app.listen(config.port, () => {
  console.log(`ProspectIQ listening on http://localhost:${config.port} (data: ${config.dataDir})`);
  if (!config.adminKey) console.warn('ADMIN_KEY is not set: the admin panel is locked until it is.');
});
