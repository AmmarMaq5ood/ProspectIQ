import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { config } from './config.js';
import { agencySettings } from './clients.js';
import type express_ from 'express';
import { DEFAULT_AUTO_PUSH_DAILY, DEFAULT_MAX_FINDERS } from './autopush.js';
import { DEFAULT_MONTHLY } from './credits.js';

/**
 * The documentation, served at /docs from the Markdown files in the repo's
 * docs/ folder. No sign-in: the pages are written for clients, the sales team
 * and the agency, and never contain a key. Numbers the app enforces (credits,
 * the daily cap, finders at a time) are filled in at render time, so the docs
 * cannot drift from the settings. Edit docs/*.md in the same commit as the
 * feature; the deploy ships both.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
export const DOCS_DIR = path.resolve(here, '../../docs');

/** 'client' pages are public and shown to clients; 'team' pages need the admin sign-in or the team docs link. */
export interface DocPage { slug: string; file: string; title: string; blurb: string; audience: 'client' | 'team' }

export const DOC_PAGES: DocPage[] = [
  { slug: 'overview', file: 'overview.md', title: 'Product overview', blurb: 'What it is, who it is for, what a client gets', audience: 'team' },
  { slug: 'client-guide', file: 'client-guide.md', title: 'Client guide', blurb: 'Every tab, step by step', audience: 'client' },
  { slug: 'admin-guide', file: 'admin-guide.md', title: 'Admin guide', blurb: 'Onboarding, credits, keys, costs', audience: 'team' },
  { slug: 'changelog', file: 'changelog.md', title: "What's new", blurb: 'Changes, newest first', audience: 'team' },
];

/** The {{placeholders}} the Markdown may use. */
export function docValues(): Record<string, string> {
  const s = agencySettings();
  const base = config.basePath || '';
  let updated = '';
  try {
    const m = fs.readFileSync(path.join(DOCS_DIR, 'changelog.md'), 'utf8').match(/^## (.+)$/m);
    updated = m ? m[1].trim() : '';
  } catch { /* no changelog: leave blank */ }
  return {
    monthly_credits: DEFAULT_MONTHLY.toLocaleString('en-US'),
    daily_cap: String(DEFAULT_AUTO_PUSH_DAILY),
    max_finders: String(DEFAULT_MAX_FINDERS),
    support_email: s.support_email || 'your Launchpad team',
    app_url: config.publicUrl,
    docs_url: `${config.publicUrl}/docs`,
    team_docs_url: `${config.publicUrl}/docs?k=${s.docs_secret}`,
    base,
    updated,
  };
}

export function fillPlaceholders(md: string, values: Record<string, string>): string {
  return md.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => (k in values ? values[k] : m));
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s: string) => s.replace(/<[^>]+>/g, '').toLowerCase().replace(/&#?[a-z0-9]+;|[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');

export interface RenderedDoc { page: DocPage; title: string; body: string; toc: { id: string; text: string }[]; html: string }

/** Markdown → the full HTML page, or null for an unknown slug. `team` decides which pages the sidebar lists and whether the app link shows. */
export function renderDoc(slug: string, team = true): RenderedDoc | null {
  const page = DOC_PAGES.find((p) => p.slug === slug);
  if (!page) return null;
  const raw = fs.readFileSync(path.join(DOCS_DIR, page.file), 'utf8');
  const values = docValues();
  let body = marked.parse(fillPlaceholders(raw, values), { async: false, gfm: true }) as string;

  // Heading ids for the "On this page" list and deep links from the app.
  const toc: { id: string; text: string }[] = [];
  const seen = new Set<string>();
  body = body.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_m, level: string, inner: string) => {
    let id = slugify(inner) || 'section';
    while (seen.has(id)) id += '-2';
    seen.add(id);
    if (level === '2') toc.push({ id, text: inner.replace(/<[^>]+>/g, '') });
    return `<h${level} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`;
  });
  // Tables scroll sideways on narrow screens instead of widening the page.
  body = body.replace(/<table>([\s\S]*?)<\/table>/g, '<div class="tbl"><table>$1</table></div>');
  // Screenshots live in docs/img; the line in italics right after one is its caption.
  body = body
    .replace(/src="img\//g, `src="${values.base}/docs/img/`)
    .replace(/<p>(<img [^>]*>)\s*<em>([\s\S]*?)<\/em><\/p>/g, '<p>$1</p><p class="cap">$2</p>')
    .replace(/(<p><img [^>]*><\/p>)\s*<p><em>([\s\S]*?)<\/em><\/p>/g, '$1<p class="cap">$2</p>');
  // Relative links between pages ("client-guide", "admin-guide#credits") resolve under /docs/.
  body = body.replace(/href="(overview|client-guide|admin-guide|changelog)(#[^"]*)?"/g, (_m, s: string, h = '') => `href="${values.base}/docs/${s}${h}"`);

  const title = `${page.title} · ProspectIQ`;
  return { page, title, body, toc, html: layout(page, body, toc, values, team) };
}

export function notFoundPage(team = false): string {
  const values = docValues();
  const pages = DOC_PAGES.filter((p) => team || p.audience === 'client');
  const body = `<h1>Not found</h1><p>There is no page by that name. Pick one:</p><ul>${pages.map((p) => `<li><a href="${values.base}/docs/${p.slug}">${esc(p.title)}</a>: ${esc(p.blurb)}</li>`).join('')}</ul>`;
  return layout({ slug: '', file: '', title: 'Not found', blurb: '', audience: 'client' }, body, [], values, team);
}

function layout(page: DocPage, body: string, toc: { id: string; text: string }[], v: Record<string, string>, team: boolean): string {
  const nav = DOC_PAGES.filter((p) => team || p.audience === 'client').map((p) => `<a class="${p.slug === page.slug ? 'on' : ''}" href="${v.base}/docs/${p.slug}"><strong>${esc(p.title)}</strong><span>${esc(p.blurb)}</span></a>`).join('');
  // toc text comes out of marked already escaped, so it is used as is
  const onPage = toc.length ? `<div class="toc"><h4>On this page</h4>${toc.map((t) => `<a href="#${t.id}">${t.text}</a>`).join('')}</div>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" type="image/svg+xml" href="${v.base}/favicon.svg">
<link rel="apple-touch-icon" href="${v.base}/apple-touch-icon.png">
<meta name="theme-color" content="#155eef">
<title>${esc(page.title)} · ProspectIQ</title>
<style>
:root { color-scheme: light; --bg: #ffffff; --page: #f3f4f6; --surface: #ffffff; --border: #e5e7eb; --border-2: #d1d5db; --text: #111827; --text-2: #374151; --muted: #6b7280; --primary: #155eef; --primary-soft: #eff4ff; --primary-line: #b2ccff; --accent: #f26a2a; --code: #f3f4f6; }
@media (prefers-color-scheme: dark) { :root { color-scheme: dark; --bg: #0b1220; --page: #0b1220; --surface: #111a2b; --border: #243049; --border-2: #324060; --text: #e5e7eb; --text-2: #cbd5e1; --muted: #94a3b8; --primary: #6ea0ff; --primary-soft: #16233d; --primary-line: #2f4a7a; --code: #16213a; } }
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--page); color: var(--text); font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Helvetica, Arial, sans-serif; }
a { color: var(--primary); text-decoration: none; }
a:hover { text-decoration: underline; }
.wrap { display: grid; grid-template-columns: 280px minmax(0, 1fr); min-height: 100vh; }
.side { position: sticky; top: 0; height: 100vh; overflow: auto; padding: 24px 20px; background: var(--surface); border-right: 1px solid var(--border); }
.brand { display: flex; align-items: center; gap: 8px; margin: 0 0 20px; font-weight: 600; font-size: 16px; color: var(--text); }
.brand span { color: var(--muted); font-weight: 500; }
.brand svg { width: 20px; height: 20px; color: var(--primary); }
.pages { display: flex; flex-direction: column; gap: 4px; }
.pages a { display: block; padding: 8px 10px; border-radius: 6px; color: var(--text-2); }
.pages a:hover { background: var(--page); text-decoration: none; }
.pages a.on { background: var(--primary-soft); color: var(--primary); box-shadow: inset 3px 0 0 var(--accent); }
.pages a strong { display: block; font-weight: 600; font-size: 14px; }
.pages a span { display: block; font-size: 12.5px; color: var(--muted); }
.toc { margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--border); }
.toc h4 { margin: 0 0 6px; font-size: 11.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.toc a { display: block; padding: 3px 0; font-size: 13.5px; color: var(--text-2); }
.side-foot { margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; }
.side-foot button { all: unset; cursor: pointer; color: var(--primary); }
.side-foot button:hover { text-decoration: underline; }
.team-note { font-size: 12px; color: var(--muted); line-height: 1.45; }
.main { padding: 40px 48px 80px; }
article { max-width: 760px; }
article h1 { margin: 0 0 6px; font-size: 30px; line-height: 1.2; font-weight: 600; letter-spacing: -0.01em; }
article h1 + p em { color: var(--muted); font-style: normal; }
article h2 { margin: 36px 0 10px; padding-top: 14px; border-top: 1px solid var(--border); font-size: 21px; font-weight: 600; line-height: 1.3; }
article h3 { margin: 24px 0 8px; font-size: 16.5px; font-weight: 600; }
article h2 .anchor, article h3 .anchor { margin-left: 8px; color: var(--border-2); font-weight: 400; opacity: 0; }
article h2:hover .anchor, article h3:hover .anchor { opacity: 1; }
article p, article ul, article ol { margin: 0 0 14px; overflow-wrap: anywhere; }
article .tbl { overflow-x: auto; margin: 0 0 18px; }
article li { margin: 4px 0; }
article li > ul, article li > ol { margin: 4px 0 0; }
article code { padding: 1px 5px; border-radius: 4px; background: var(--code); font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
article pre { padding: 12px 14px; border-radius: 6px; background: var(--code); overflow: auto; }
article pre code { padding: 0; background: none; }
article table { width: 100%; min-width: 420px; border-collapse: collapse; margin: 0; font-size: 14px; }
article th, article td { padding: 8px 10px; border: 1px solid var(--border); vertical-align: top; text-align: left; }
article th { background: var(--surface); font-weight: 600; }
article tr:nth-child(even) td { background: var(--surface); }
article blockquote { margin: 0 0 14px; padding: 8px 14px; border-left: 3px solid var(--primary-line); background: var(--primary-soft); color: var(--text-2); }
article hr { border: 0; border-top: 1px solid var(--border); margin: 24px 0; }
article img { display: block; max-width: 100%; height: auto; margin: 6px 0 4px; border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06); }
article p.cap { margin: 0 0 18px; font-size: 13px; color: var(--muted); }
.topbar { display: none; }
@media (max-width: 900px) {
  .wrap { grid-template-columns: minmax(0, 1fr); }
  .side { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--border); padding: 16px; }
  article table { min-width: 0; }
  article th, article td { padding: 6px 8px; font-size: 13px; }
  .toc { display: none; }
  .main { padding: 24px 16px 60px; }
  article h1 { font-size: 25px; }
}
@media print {
  html, body { background: #fff; color: #000; font-size: 11.5pt; }
  .wrap { display: block; }
  .side { display: none; }
  .main { padding: 0; }
  article { max-width: none; }
  article h2 { break-after: avoid; }
  article tr, article li { break-inside: avoid; }
  article .anchor { display: none; }
  a { color: #000; }
}
</style>
</head>
<body>
<div class="wrap">
  <aside class="side">
    <div class="brand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>ProspectIQ <span>Docs</span></div>
    <nav class="pages" aria-label="Documentation">${nav}</nav>
    ${onPage}
    <div class="side-foot">
      ${team ? `<a href="${v.app_url}/admin">Open the admin panel</a><span class="team-note">Team pages. Clients only ever see the Client guide, and only inside Launchpad.</span>` : ''}
      <button type="button" onclick="window.print()">Print or save as PDF</button>
    </div>
  </aside>
  <main class="main"><article>${body}</article></main>
</div>
</body>
</html>`;
}

/**
 * Who may see the team pages: an admin (the admin cookie), or anyone who
 * opened the team docs link once (?k=<docs secret>, kept in a cookie for 30
 * days so the pages link to each other without the token).
 */
export function isTeam(req: express_.Request, res?: express_.Response): boolean {
  const s = agencySettings();
  const admin = !!config.adminKey && String(req.cookies?.piq_admin || '') === config.adminKey;
  if (admin) return true;
  const k = String(req.query?.k || '');
  if (k && k === s.docs_secret) {
    if (res) {
      const https = req.secure || config.publicUrl.startsWith('https://');
      res.cookie('piq_docs', k, { httpOnly: true, sameSite: 'lax', secure: https, path: '/', maxAge: 30 * 86400000 });
    }
    return true;
  }
  return String(req.cookies?.piq_docs || '') === s.docs_secret;
}

/** GET /docs, /docs/:slug. Mounted before the app's static files and SPA fallback. */
export function docsRouter(): express.Router {
  const r = express.Router();
  const send = (req: express.Request, res: express.Response, slug: string, team = isTeam(req, res)) => {
    const d = renderDoc(slug, team);
    res.setHeader('Cache-Control', 'no-store');
    res.type('html');
    if (!d || (d.page.audience === 'team' && !team)) return res.status(404).send(notFoundPage(team));
    return res.send(d.html);
  };
  r.use('/img', express.static(path.join(DOCS_DIR, 'img'), { maxAge: '1d', index: false }));
  r.get('/', (req, res) => { const team = isTeam(req, res); send(req, res, team ? 'overview' : 'client-guide', team); });
  r.get('/:slug', (req, res) => send(req, res, String(req.params.slug).toLowerCase()));
  return r;
}
