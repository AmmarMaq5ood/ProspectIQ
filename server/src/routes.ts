import { Router, type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import { config } from './config.js';
import { createClient, deleteClient, effectiveKeys, getClient, getClientByKey, getClientByLocation, listClients, newKey, publicClient, rotateLinkSecret, saveClient, saveAgencySettings, agencySettings, universalLink } from './clients.js';
import { addCredits, creditCheck, creditLedger, creditsLeft, creditsView, setMonthly, spendCredits } from './credits.js';
import { annotateInLaunchpad, markPushed } from './lpindex.js';
import { logActivity, readActivity } from './activity.js';
import { DEPARTMENTS, EMAIL_STATUS, EMPLOYEE_RANGES, FUNDING, PER_PAGE, SENIORITY, enrichPerson, orgByDomain, planLimits, searchCompanies, searchPeople, type ApolloCtx } from './apollo.js';
import { cleanFilters, cleanIntent, filtersActive, intentFilters, normDomain } from './rules.js';
import { askIntent, draftProfile, fitLines, siteText, type LlmCtx } from './llm.js';
import { sampleCompanies, sampleEnrich, sampleLookup, samplePeople } from './samples.js';
import { draftNote, lpOf, lpReady, lpUrl, pushProspect, roleFromTitle, sizeBucket, testConnection } from './launchpad.js';
import { countSpent, pushCompanies, pushPeople } from './push.js';
import { createFinder, describe, listFinders, nextRun, runAndSave, saveFinders } from './finders.js';
import { usageCompute, usageRead, type UsageSummary } from './usage.js';
import { clientDir, readJson, writeJson } from './store.js';
import type { Client, Finder, Org, Person, Profile, RecentSearch } from './types.js';

export const api = Router();

/* ---- auth: a client cookie (access key) and an admin cookie (ADMIN_KEY) ---- */

interface Ctx { client: Client; sample: boolean; live: boolean; apollo: ApolloCtx; llm: LlmCtx; useGpt: boolean }

declare module 'express-serve-static-core' {
  interface Request { piq?: Ctx; admin?: boolean }
}

/** Inside Launchpad's iframe the cookie must be SameSite=None + Secure; on plain http (local dev) that pair is refused, so fall back to Lax. */
function cookieOpts(req: Request) {
  const https = req.secure || config.publicUrl.startsWith('https://');
  return { httpOnly: true, sameSite: (https ? 'none' : 'lax') as 'none' | 'lax', secure: https, path: '/', maxAge: 365 * 86400000 };
}

api.post('/auth/key', (req, res) => {
  const key = String(req.body?.key || '');
  const client = getClientByKey(key);
  if (!client) return res.status(401).json({ error: 'That access key is not valid.' });
  res.cookie('piq_client', key, cookieOpts(req));
  res.json({ ok: true, client: publicClient(client), key });
});

api.post('/auth/location', (req, res) => {
  const loc = String(req.body?.loc || '').trim();
  const k = String(req.body?.k || '');
  if (!k || k !== agencySettings().link_secret) return res.status(401).json({ error: 'This link is not valid. Ask your Launchpad team for a new one.' });
  if (!loc || loc.includes('{{')) return res.status(400).json({ error: 'Launchpad did not pass the account id. Open ProspectIQ from the Launchpad menu.' });
  const client = getClientByLocation(loc);
  if (!client) return res.status(404).json({ error: 'not_setup', message: 'This Launchpad account is not set up for ProspectIQ yet.' });
  res.cookie('piq_client', client.access_key, cookieOpts(req));
  res.json({ ok: true, client: publicClient(client), key: client.access_key });
});

api.post('/auth/admin', (req, res) => {
  const key = String(req.body?.key || '');
  if (!config.adminKey || key !== config.adminKey) return res.status(401).json({ error: 'Wrong admin key.' });
  res.cookie('piq_admin', key, cookieOpts(req));
  res.json({ ok: true });
});

api.post('/auth/logout', (_req, res) => {
  res.clearCookie('piq_client', { path: '/' });
  res.clearCookie('piq_admin', { path: '/' });
  res.json({ ok: true });
});

function isAdmin(req: Request): boolean {
  const k = String(req.cookies?.piq_admin || '');
  return !!config.adminKey && k === config.adminKey;
}

/** The client cookie, or the same key in a header for browsers that drop cookies inside Launchpad's iframe. */
function clientFrom(req: Request): Client | null {
  const asSlug = String(req.query.as || req.body?.as || '');
  if (asSlug && isAdmin(req)) return getClient(asSlug);
  return getClientByKey(String(req.cookies?.piq_client || req.get('x-piq-key') || ''));
}

function ctxFor(req: Request, client: Client, ctx: string): Ctx {
  const keys = effectiveKeys(client);
  const sample = req.query.sample === '1' || req.body?.sample === true || !keys.apollo;
  const live = !sample;
  return { client, sample, live, apollo: { slug: client.slug, key: keys.apollo, ctx }, llm: { slug: client.slug, ctx, key: keys.openai, model: keys.openaiModel }, useGpt: live && !!keys.openai };
}

function requireClient(ctxName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const client = clientFrom(req);
    if (!client) return res.status(401).json({ error: 'Sign in with your access key.' });
    req.piq = ctxFor(req, client, ctxName);
    next();
  };
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Admin only.' });
  req.admin = true;
  next();
}

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

/* ---- who am I ---- */

api.get('/me', (req, res) => {
  const client = clientFrom(req);
  res.json({ client: client ? publicClient(client) : null, admin: isAdmin(req), sample: client ? ctxFor(req, client, 'me').sample : false });
});

api.get('/options', (_req, res) => {
  res.json({ seniority: SENIORITY, departments: DEPARTMENTS, employee_ranges: EMPLOYEE_RANGES, email_status: EMAIL_STATUS, funding: FUNDING, per_page: PER_PAGE });
});

/* ---- recent searches ---- */

const recentFile = (slug: string) => path.join(clientDir(slug), 'recent.json');
function recentAdd(slug: string, r: RecentSearch): void {
  const all = readJson<RecentSearch[]>(recentFile(slug), []).filter((x) => x.q.toLowerCase() !== r.q.toLowerCase());
  all.unshift(r);
  writeJson(recentFile(slug), all.slice(0, 30));
}

api.get('/recent', requireClient('recent'), (req, res) => {
  res.json({ recent: readJson<RecentSearch[]>(recentFile(req.piq!.client.slug), []).slice(0, 12) });
});

/* ---- Ask: plain words in, leads out ---- */

api.post('/ask', requireClient('research:ask'), wrap(async (req, res) => {
  const { client, sample, live, apollo, llm, useGpt } = req.piq!;
  const q = String(req.body?.q || '').trim().slice(0, 300);
  if (!q) return res.status(400).json({ error: 'Type what leads you are looking for.' });
  const page = Math.max(1, Number(req.body?.page) || 1);
  const pp = PER_PAGE.includes(Number(req.body?.pp)) ? Number(req.body.pp) : 10;
  const intent = await askIntent(llm, client.profile, q, useGpt);
  const filters = intentFilters(intent);
  const kind = intent.kind;
  const result = kind === 'people' ? (live ? await searchPeople(apollo, filters, page, pp) : samplePeople(filters, page, pp)) : (live ? await searchCompanies(apollo, filters, page, pp) : sampleCompanies(filters, page, pp));
  if (kind === 'people') await annotateInLaunchpad(client, result.rows as Person[], live);
  const fits = await fitLines(llm, client.profile, result.rows, intent, kind, useGpt);
  if (live && page === 1) {
    recentAdd(client.slug, { q, kind, total: result.total, t: Date.now() });
    logActivity(client.slug, { kind: 'search', title: q, detail: `${result.total.toLocaleString('en-US')} ${kind} found`, by: 'client', ok: true, n: result.total });
  }
  const warnings: string[] = [];
  if (intent.error) warnings.push(`GPT could not read the request (${intent.error}); the built-in parser was used.`);
  if (sample) warnings.push(!effectiveKeys(client).apollo ? 'No research key for this client yet: these are sample results.' : 'Sample mode: canned results, nothing is written.');
  res.json({ q, intent, filters, kind, result, fits, warnings, sample });
}));

/* ---- the filter tabs ---- */

api.post('/search', requireClient('research:people'), wrap(async (req, res) => {
  const { live, apollo, sample } = req.piq!;
  const kind = req.body?.kind === 'companies' ? 'companies' : 'people';
  req.piq!.apollo.ctx = `research:${req.body?.mode === 'industries' ? 'industries' : kind}`;
  const filters = cleanFilters(req.body?.filters || {});
  const page = Math.max(1, Number(req.body?.page) || 1);
  const pp = PER_PAGE.includes(Number(req.body?.pp)) ? Number(req.body.pp) : 25;
  if (!filtersActive(filters) && !sample) return res.json({ kind, filters, result: null, sample });
  const result = kind === 'people' ? (live ? await searchPeople(apollo, filters, page, pp) : samplePeople(filters, page, pp)) : (live ? await searchCompanies(apollo, filters, page, pp) : sampleCompanies(filters, page, pp));
  if (kind === 'people') await annotateInLaunchpad(req.piq!.client, result.rows as Person[], live);
  if (live && page === 1) logActivity(req.piq!.client.slug, { kind: 'search', title: filtersSummary(filters, kind), detail: `${result.total.toLocaleString('en-US')} ${kind} found (${req.body?.mode === 'industries' ? 'Industries' : kind === 'people' ? 'People' : 'Companies'} tab)`, by: 'client', ok: true, n: result.total });
  res.json({ kind, filters, result, sample });
}));

/* ---- one company by domain ---- */

api.post('/lookup', requireClient('research:lookup'), wrap(async (req, res) => {
  const { client, live, apollo, sample } = req.piq!;
  const domain = normDomain(String(req.body?.domain || ''));
  if (!domain) return res.status(400).json({ error: 'Enter the company domain, such as flowserve.com.' });
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return res.status(400).json({ error: `"${domain}" is not a domain.` });
  const titles = cleanFilters({ titles: req.body?.titles }).titles;
  const sen = cleanFilters({ sen: req.body?.sen }).sen;
  const pp = Math.max(1, Math.min(50, Number(req.body?.pp) || 10));
  const imports = String(req.body?.imports || '').slice(0, 1500);
  let org: Org, people: Person[];
  if (live) {
    org = await orgByDomain(apollo, domain);
    people = (await searchPeople(apollo, { ...cleanFilters({}), domains: [domain], titles: titles.length ? titles : client.profile.default_titles, similar: true, sen }, 1, pp)).rows;
    if (!org.name && !people.length) return res.status(404).json({ error: `Nothing found for ${domain}.` });
  } else {
    ({ org, people } = sampleLookup(domain));
  }
  for (const p of people) p.role = roleFromTitle(p.title, client.profile.roles);
  await annotateInLaunchpad(client, people, live);
  if (live) logActivity(client.slug, { kind: 'lookup', title: domain, detail: `${org.name || domain}: ${people.length} people found`, by: 'client', ok: true, n: people.length });
  const [note, message] = draftNote(client.profile, org, people, imports);
  res.json({ org, people, note, message, imports, sample });
}));

/* ---- pushes ---- */

api.post('/push/people', requireClient('research:ask'), wrap(async (req, res) => {
  const { client, live, apollo, sample } = req.piq!;
  if (sample) return res.status(400).json({ error: 'Sample mode does not push to Launchpad.' });
  const picks = new Set((req.body?.picks || []).map(String));
  const people = ((req.body?.people || []) as Person[]).filter((p) => picks.has(String(p.id)));
  if (!people.length) return res.status(400).json({ error: 'Tick at least one person.' });
  const roles = (req.body?.roles || {}) as Record<string, string>;
  const need = people.filter((p) => p.has_email || p.email).length;
  const blocked = creditCheck(client, need);
  if (blocked) return res.status(402).json({ error: blocked, credits_left: creditsLeft(client) });
  const r = await pushPeople(client, people, roles, { live, apollo });
  const credits_left = r.spent ? spendCredits(client, r.spent, 'push from the research tabs') : creditsLeft(client);
  if (live) {
    const contacts = r.results.flatMap((x) => x.contacts.map((c) => ({ name: c.name, company: x.company.name, id: c.id, email: c.email })));
    logActivity(client.slug, { kind: 'push', title: `Pushed ${contacts.length} lead${contacts.length === 1 ? '' : 's'} to Launchpad`, detail: [...new Set(r.results.map((x) => x.company.name))].join(', ') + (r.errors.length ? ` · ${r.errors.length} error${r.errors.length === 1 ? '' : 's'}` : ''), credits: r.spent, by: 'client', ok: r.errors.length === 0, n: contacts.length, items: contacts });
  }
  res.json({ ...r, credits_spent: r.spent, credits_left, links: r.results.map((x) => ({ company: lpUrl(client, 'business', x.company.id), opportunity: lpUrl(client, 'opportunity', x.opportunity.id), contacts: x.contacts.map((c) => lpUrl(client, 'contact', c.id)) })), bd: lpUrl(client, 'pipeline') });
}));

api.post('/push/companies', requireClient('research:companies'), wrap(async (req, res) => {
  const { client, live, sample } = req.piq!;
  if (sample) return res.status(400).json({ error: 'Sample mode does not push to Launchpad.' });
  const picks = new Set((req.body?.picks || []).map(String));
  const companies = ((req.body?.companies || []) as Org[]).filter((c) => picks.has(String(c.id)));
  if (!companies.length) return res.status(400).json({ error: 'Tick at least one company.' });
  const r = await pushCompanies(client, companies, live);
  if (live) logActivity(client.slug, { kind: 'push', title: `Pushed ${r.results.length} compan${r.results.length === 1 ? 'y' : 'ies'} to Launchpad`, detail: r.results.map((x) => x.name).join(', '), credits: 0, by: 'client', ok: r.errors.length === 0, n: r.results.length, items: r.results.map((x) => ({ name: x.name, company: x.domain, id: x.id })) });
  res.json({ ...r, links: r.results.map((x) => lpUrl(client, 'business', x.id)) });
}));

api.post('/push/lookup', requireClient('research:lookup'), wrap(async (req, res) => {
  const { client, live, apollo, sample } = req.piq!;
  if (sample) return res.status(400).json({ error: 'Sample mode does not push to Launchpad.' });
  const org = req.body?.org as Org;
  if (!org?.name) return res.status(400).json({ error: 'Nothing to push: look a company up first.' });
  const picks = new Set((req.body?.picks || []).map(String));
  const roles = (req.body?.roles || {}) as Record<string, string>;
  const ticked = ((req.body?.people || []) as Person[]).filter((p) => picks.has(String(p.id)));
  const blocked = creditCheck(client, ticked.filter((p) => p.has_email || p.email).length);
  if (blocked) return res.status(402).json({ error: blocked, credits_left: creditsLeft(client) });
  const contacts: Person[] = [];
  const renames: Record<string, string> = {};
  const errors: string[] = [];
  for (let p of (req.body?.people || []) as Person[]) {
    if (!picks.has(String(p.id))) continue;
    p.role = client.profile.roles.includes(roles[p.id] || '') ? roles[p.id] : roleFromTitle(p.title, client.profile.roles);
    const before = `${p.first} ${p.last}`.trim();
    if (p.last_obf || !p.linkedin) {
      try { p = live ? await enrichPerson(apollo, p, org.domain) : sampleEnrich(p); renames[before] = `${p.first} ${p.last}`.trim(); }
      catch (e) { errors.push(`Could not look up ${before}: ${(e as Error).message}`); }
    }
    if (p.last_obf) p.last = '';
    contacts.push(p);
  }
  if (!contacts.length) return res.status(400).json({ error: 'Tick at least one contact.' });
  const lp = lpOf(client);
  if (!lpReady(lp)) return res.status(400).json({ error: 'Launchpad is not connected for this client.' });
  const rename = (s: string) => Object.entries(renames).reduce((acc, [a, b]) => acc.split(a).join(b), s);
  const imports = String(req.body?.imports || '');
  const result = await pushProspect(lp, { company: { name: org.name, website: org.website, city: org.city, state: org.state, country: org.country, phone: org.phone, description: (org.description + (imports.trim() ? `\n\nImports (ImportGenius): ${imports.trim()}` : '')).trim(), industry: org.industry, size: sizeBucket(org.employees) }, contacts, note: rename(String(req.body?.note || '')), message: rename(String(req.body?.message || '')) });
  markPushed(client.slug, result.contacts.map((c, i) => ({ researchId: contacts[i]?.id || '', lpId: c.id, name: c.name })));
  const spent = countSpent(result);
  const credits_left = spent ? spendCredits(client, spent, `push from company lookup (${org.domain || org.name})`) : creditsLeft(client);
  logActivity(client.slug, { kind: 'push', title: `Pushed ${result.contacts.length} contact${result.contacts.length === 1 ? '' : 's'} at ${org.name} to Launchpad`, detail: `From company lookup (${org.domain || org.name})${errors.length ? ` · ${errors.length} lookup error${errors.length === 1 ? '' : 's'}` : ''}`, credits: spent, by: 'client', ok: errors.length === 0, n: result.contacts.length, items: result.contacts.map((c) => ({ name: c.name, company: org.name, id: c.id, email: c.email })) });
  res.json({ results: [result], errors, credits_spent: spent, credits_left, links: [{ company: lpUrl(client, 'business', result.company.id), opportunity: lpUrl(client, 'opportunity', result.opportunity.id), contacts: result.contacts.map((c) => lpUrl(client, 'contact', c.id)) }], bd: lpUrl(client, 'pipeline') });
}));

/* ---- finders ---- */

function finderView(f: Finder, tz: string) {
  return { ...f, seen: undefined, seen_count: f.seen?.length || 0, when: describe(f, tz), next: nextRun(f, tz) };
}

api.get('/finders', requireClient('finders'), (req, res) => {
  const { client } = req.piq!;
  res.json({ finders: listFinders(client.slug).map((f) => finderView(f, client.launchpad.timezone)) });
});

api.post('/finders', requireClient('finders'), wrap(async (req, res) => {
  const { client } = req.piq!;
  const f = createFinder(client, req.body || {});
  res.json({ finder: finderView(f, client.launchpad.timezone) });
}));

api.post('/finders/:id/run', requireClient('finders'), wrap(async (req, res) => {
  const { client, live, sample } = req.piq!;
  const r = await runAndSave(client, String(req.params.id), live && !sample, 'client');
  res.json({ ...r, seen: undefined, links: r.pushed.map((p) => lpUrl(client, 'contact', p.id)) });
}));

api.post('/finders/:id/toggle', requireClient('finders'), (req, res) => {
  const { client } = req.piq!;
  const all = listFinders(client.slug).map((f) => (f.id === req.params.id ? { ...f, enabled: !f.enabled } : f));
  saveFinders(client.slug, all);
  res.json({ ok: true });
});

api.delete('/finders/:id', requireClient('finders'), (req, res) => {
  const { client } = req.piq!;
  saveFinders(client.slug, listFinders(client.slug).filter((f) => f.id !== req.params.id));
  res.json({ ok: true });
});

/* ---- the activity log ---- */

api.get('/activity', requireClient('activity'), (req, res) => {
  const { client } = req.piq!;
  if (!isAdmin(req) && client.flags.show_activity === false) return res.status(403).json({ error: 'The activity log is not switched on for this account.' });
  res.json(readActivity(client.slug, { page: Number(req.query.page), per: Number(req.query.per), kind: String(req.query.kind || ''), ref: String(req.query.ref || '') }));
});

/** A short line for a filter search in the log. */
function filtersSummary(f: ReturnType<typeof cleanFilters>, kind: string): string {
  const bits = [f.titles.join('/'), f.sen.join('/'), f.okw.join('/'), f.oname, f.domains.join('/'), [...f.ploc, ...f.oloc].join('/'), f.size.length ? `${f.size.length} size band${f.size.length === 1 ? '' : 's'}` : '', f.rev_min || f.rev_max ? `revenue ${f.rev_min || '0'}–${f.rev_max || '∞'}` : '', f.tech.join('/'), f.kw, f.oids.length ? `${f.oids.length} picked companies` : ''].filter(Boolean);
  return bits.length ? bits.join(' · ').slice(0, 200) : `All ${kind}`;
}

/* ---- usage ---- */

api.get('/usage', requireClient('usage'), wrap(async (req, res) => {
  const { client, live, apollo, sample } = req.piq!;
  const admin = isAdmin(req);
  if (!admin && !client.flags.show_usage) return res.status(403).json({ error: 'Usage is not switched on for this account.' });
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const summary = usageCompute(usageRead(client.slug, days), days, client.launchpad.timezone);
  let plan: unknown[] = [];
  if (admin && live && !sample) { try { plan = await planLimits(apollo); } catch { plan = []; } }
  res.json({ summary: admin ? summary : stripCost(summary), plan, show_cost: admin, credits: creditsView(client), ledger: creditLedger(client.slug, 30) });
}));

/** What a client may see: counts and tokens, never money. */
function stripCost(s: UsageSummary): UsageSummary {
  const out = JSON.parse(JSON.stringify(s)) as UsageSummary;
  out.totals.cost = 0; out.totals.cost_known = false;
  for (const d of out.by_day) d.cost = 0;
  for (const v of Object.values(out.by_ctx)) v.cost = 0;
  for (const v of Object.values(out.by_model)) { v.cost = 0; v.known = false; }
  for (const r of out.recent) if ('cost' in r) r.cost = null;
  return out;
}

/* ---- admin ---- */

const admin = Router();
admin.use(requireAdmin);

admin.get('/clients', (_req, res) => {
  res.json({ clients: listClients().map((c) => ({ slug: c.slug, name: c.name, enabled: c.enabled, created: c.created, connected: lpReady(lpOf(c)), has_openai: !!effectiveKeys(c).openai, has_apollo: !!effectiveKeys(c).apollo, finders: listFinders(c.slug).length })) });
});

admin.post('/clients', (req, res) => {
  try {
    const c = createClient({ slug: String(req.body?.slug || req.body?.name || ''), name: String(req.body?.name || '') });
    res.json({ client: c });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

admin.get('/clients/:slug', (req, res) => {
  const c = getClient(String(req.params.slug));
  if (!c) return res.status(404).json({ error: 'No such client.' });
  res.json({ client: c, links: menuLinks(c), finders: listFinders(c.slug).map((f) => finderView(f, c.launchpad.timezone)) });
});

admin.put('/clients/:slug', (req, res) => {
  const c = getClient(String(req.params.slug));
  if (!c) return res.status(404).json({ error: 'No such client.' });
  const b = req.body || {};
  if (typeof b.name === 'string') c.name = b.name.trim().slice(0, 80) || c.name;
  if (typeof b.enabled === 'boolean') c.enabled = b.enabled;
  if (b.launchpad && typeof b.launchpad === 'object') for (const k of ['location_id', 'token', 'app_url', 'pipeline', 'quote_stage', 'owner', 'timezone'] as const) if (typeof b.launchpad[k] === 'string') c.launchpad[k] = b.launchpad[k].trim();
  if (b.keys && typeof b.keys === 'object') for (const k of ['openai', 'openai_model', 'apollo'] as const) if (typeof b.keys[k] === 'string') c.keys[k] = b.keys[k].trim();
  if (b.flags && typeof b.flags === 'object') {
    if (typeof b.flags.show_usage === 'boolean') c.flags.show_usage = b.flags.show_usage;
    if (typeof b.flags.show_activity === 'boolean') c.flags.show_activity = b.flags.show_activity;
  }
  if (b.profile && typeof b.profile === 'object') c.profile = cleanProfile({ ...c.profile, ...b.profile });
  saveClient(c);
  res.json({ client: c, links: menuLinks(c) });
});

admin.get('/clients/:slug/activity', (req, res) => {
  const c = getClient(String(req.params.slug));
  if (!c) return res.status(404).json({ error: 'No such client.' });
  res.json(readActivity(c.slug, { page: Number(req.query.page), per: Number(req.query.per), kind: String(req.query.kind || ''), ref: String(req.query.ref || '') }));
});

admin.get('/clients/:slug/credits', (req, res) => {
  const c = getClient(String(req.params.slug));
  if (!c) return res.status(404).json({ error: 'No such client.' });
  res.json({ credits: creditsView(c), ledger: creditLedger(c.slug, 100) });
});

admin.post('/clients/:slug/credits', (req, res) => {
  let c = getClient(String(req.params.slug));
  if (!c) return res.status(404).json({ error: 'No such client.' });
  const add = Number(req.body?.add);
  const monthly = Number(req.body?.monthly);
  if (Number.isFinite(add) && add !== 0) c = addCredits(c, add, String(req.body?.reason || (add > 0 ? 'bonus credits' : 'adjustment')).slice(0, 120));
  else if (Number.isFinite(monthly)) c = setMonthly(c, monthly);
  else return res.status(400).json({ error: 'Send add (bonus credits for this month) or monthly (the allowance).' });
  res.json({ credits: creditsView(c), ledger: creditLedger(c.slug, 100) });
});

admin.get('/overview', (_req, res) => {
  const clients = listClients();
  const now = Date.now();
  const dayStart = now - 86400000;
  const monthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
  const rows = clients.map((c) => {
    const acts = readActivity(c.slug, { per: 100 }).rows;
    return { slug: c.slug, name: c.name, enabled: c.enabled, connected: lpReady(lpOf(c)), credits: creditsView(c), finders: listFinders(c.slug).length, last: acts[0] || null, acts };
  });
  const recent = rows.flatMap((r) => r.acts.map((a) => ({ ...a, items: undefined, client: r.name, slug: r.slug }))).sort((a, b) => b.t - a.t).slice(0, 20);
  const all = rows.flatMap((r) => r.acts);
  const totals = {
    clients: rows.length,
    connected: rows.filter((r) => r.connected).length,
    finders: rows.reduce((n, r) => n + r.finders, 0),
    credits_total: rows.reduce((n, r) => n + r.credits.total, 0),
    credits_used: rows.reduce((n, r) => n + r.credits.used, 0),
    credits_left: rows.reduce((n, r) => n + r.credits.left, 0),
    clients_out: rows.filter((r) => r.credits.left <= 0).length,
    pushed_month: all.filter((a) => (a.kind === 'push' || a.kind === 'finder') && a.t >= monthStart).reduce((n, a) => n + (a.n || 0), 0),
    searches_month: all.filter((a) => a.kind === 'search' && a.t >= monthStart).length,
    finder_runs_today: all.filter((a) => a.kind === 'finder' && a.t >= dayStart).length,
  };
  res.json({ totals, clients: rows.map(({ acts: _a, ...r }) => r), recent });
});

admin.get('/link', (_req, res) => {
  const s = agencySettings();
  res.json({ url: universalLink(), secret_set: !!s.link_secret, support_email: s.support_email });
});

admin.put('/settings', (req, res) => {
  const email = String(req.body?.support_email ?? '').trim().slice(0, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'That does not look like an email address.' });
  const s = saveAgencySettings({ support_email: email });
  res.json({ support_email: s.support_email });
});

admin.post('/link/rotate', (_req, res) => {
  rotateLinkSecret();
  res.json({ url: universalLink() });
});

admin.post('/clients/:slug/rotate-key', (req, res) => {
  const c = getClient(String(req.params.slug));
  if (!c) return res.status(404).json({ error: 'No such client.' });
  c.access_key = newKey();
  saveClient(c);
  res.json({ client: c, links: menuLinks(c) });
});

admin.delete('/clients/:slug', (req, res) => {
  deleteClient(String(req.params.slug));
  res.json({ ok: true });
});

admin.post('/clients/:slug/test', wrap(async (req, res) => {
  const c = getClient(String(req.params.slug));
  if (!c) return res.status(404).json({ error: 'No such client.' });
  const lp = lpOf(c);
  const result = await testConnection({ ...lp, ...(req.body?.launchpad || {}) });
  res.json(result);
}));

admin.post('/clients/:slug/draft', wrap(async (req, res) => {
  const c = getClient(String(req.params.slug));
  if (!c) return res.status(404).json({ error: 'No such client.' });
  const keys = effectiveKeys(c);
  if (!keys.openai) return res.status(400).json({ error: 'Add an OpenAI key (client or agency) before drafting from a website.' });
  const url = String(req.body?.url || '').trim();
  if (!url) return res.status(400).json({ error: 'Enter the website address.' });
  const text = await siteText(url);
  const profile = await draftProfile({ slug: c.slug, ctx: 'admin:draft', key: keys.openai, model: keys.openaiModel }, text, url);
  res.json({ profile });
}));

admin.get('/clients/:slug/usage', (req, res) => {
  const c = getClient(String(req.params.slug));
  if (!c) return res.status(404).json({ error: 'No such client.' });
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  res.json({ summary: usageCompute(usageRead(c.slug, days), days, c.launchpad.timezone) });
});

api.use('/admin', admin);

function menuLinks(c: Client): { label: string; url: string }[] {
  const base = `${config.publicUrl}/?key=${encodeURIComponent(c.access_key)}`;
  return [{ label: 'ProspectIQ (this client only)', url: base }, { label: 'ProspectIQ (one link for every sub-account)', url: universalLink() }];
}

function cleanProfile(p: Partial<Profile>): Profile {
  const list = (v: unknown, cap: number) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean).slice(0, cap) : []);
  const templates: Record<string, string[]> = {};
  if (p.templates && typeof p.templates === 'object') for (const [g, items] of Object.entries(p.templates)) { const l = list(items, 6); if (g.trim() && l.length) templates[g.trim().slice(0, 60)] = l; }
  const angles = Array.isArray(p.angles) ? p.angles.filter((a) => a && typeof a === 'object').map((a) => ({ match: String(a.match || '.').slice(0, 200), what: String(a.what || '').slice(0, 200), why: String(a.why || '').slice(0, 300) })).slice(0, 8) : [];
  const roles = list(p.roles, 8);
  return { company: String(p.company || '').trim().slice(0, 80), sells: String(p.sells || '').trim().slice(0, 600), sells_to: String(p.sells_to || '').trim().slice(0, 600), industries: list(p.industries, 30), roles: roles.length ? roles : ['Purchasing', 'Operations', 'Executive', 'Other'], angles, templates, default_titles: list(p.default_titles, 20) };
}
