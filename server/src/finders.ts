import path from 'node:path';
import crypto from 'node:crypto';
import cron from 'node-cron';
import { clientDir, readJson, writeJson } from './store.js';
import { effectiveKeys, listClients } from './clients.js';
import { searchCompanies, searchPeople, type ApolloCtx, bulkOrgs } from './apollo.js';
import { sampleCompanies, samplePeople } from './samples.js';
import { cleanIntent, intentFilters } from './rules.js';
import { fitLines, type LlmCtx } from './llm.js';
import { lpOf, lpReady } from './launchpad.js';
import { annotateInLaunchpad } from './lpindex.js';
import { creditsLeft, outOfCreditsText, spendCredits } from './credits.js';
import { autoPushLimitText, autoPushSpend, autoPushState } from './autopush.js';
import { logActivity } from './activity.js';
import { pushCompanies, pushPeople, waterfallPlan } from './push.js';
import type { Client, Finder, Org, Person, IcpMatch, Kind } from './types.js';
import { matchOrg, matchPerson, targetingActive } from './icp.js';

/** Saved searches that run on their own: storage, schedule maths, one run, and the in-process scheduler. */

const file = (slug: string) => path.join(clientDir(slug), 'finders.json');

export function listFinders(slug: string): Finder[] {
  return readJson<Finder[]>(file(slug), []);
}

export function saveFinders(slug: string, finders: Finder[]): void {
  writeJson(file(slug), finders);
}

export function createFinder(client: Client, input: { name: string; q: string; intent: unknown; per_run: number; start: string; time: string; repeat: string; notify: boolean; icp_only?: boolean }): Finder {
  const intent = cleanIntent((input.intent || {}) as Partial<Finder['intent']>);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(input.time || '') || ['', '8', '00'];
  const startParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.start || '');
  const start = startParts ? zonedMidnight(Number(startParts[1]), Number(startParts[2]), Number(startParts[3]), client.launchpad.timezone) : zonedMidnightToday(client.launchpad.timezone);
  const f: Finder = {
    id: crypto.randomBytes(5).toString('hex'),
    name: (input.name || '').trim().slice(0, 160) || intent.summary || 'Daily leads',
    q: (input.q || '').trim().slice(0, 300),
    intent,
    per_run: Math.max(1, Math.min(100, Number(input.per_run) || 5)),
    hour: Math.max(0, Math.min(23, Number(tm[1]))),
    minute: Math.max(0, Math.min(59, Number(tm[2]))),
    start,
    repeat: (['daily', 'weekdays', 'weekly'] as const).includes(input.repeat as any) ? (input.repeat as Finder['repeat']) : 'daily',
    notify: !!input.notify,
    icp_only: !!input.icp_only,
    enabled: true,
    created: Date.now(),
    last_run: 0,
    last_result: '',
    seen: [],
  };
  const all = listFinders(client.slug);
  all.push(f);
  saveFinders(client.slug, all);
  return f;
}

/* ---- schedule maths, all in the client's timezone ---- */

function parts(ms: number, timeZone: string): { y: number; m: number; d: number; h: number; min: number; dow: number } {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short' });
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const dows: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, min: Number(p.minute), dow: dows[p.weekday] || 1 };
}

/** Midnight of a calendar day in a timezone, as epoch ms (iterative, no library). */
export function zonedMidnight(y: number, m: number, d: number, timeZone: string): number {
  let guess = Date.UTC(y, m - 1, d, 0, 0);
  for (let i = 0; i < 3; i++) {
    const p = parts(guess, timeZone);
    const diff = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Date.UTC(y, m - 1, d, 0, 0);
    if (diff === 0) break;
    guess -= diff;
  }
  return guess;
}

export function zonedMidnightToday(timeZone: string, now = Date.now()): number {
  const p = parts(now, timeZone);
  return zonedMidnight(p.y, p.m, p.d, timeZone);
}

const dayKey = (ms: number, tz: string) => { const p = parts(ms, tz); return `${p.y}-${p.m}-${p.d}`; };

export function runsOn(f: Finder, dayMs: number, tz: string): boolean {
  if (f.start && dayMs < zonedMidnightToday(tz, f.start)) return false;
  const dow = parts(dayMs, tz).dow;
  if (f.repeat === 'weekdays') return dow <= 5;
  if (f.repeat === 'weekly') return dow === (f.start ? parts(f.start, tz).dow : 1);
  return true;
}

export function nextRun(f: Finder, tz: string, now = Date.now()): number {
  let day = zonedMidnightToday(tz, now);
  for (let i = 0; i < 400; i++) {
    const at = day + (f.hour * 60 + f.minute) * 60000;
    if (at > now && runsOn(f, day, tz)) return at;
    day += 86400000;
  }
  return day;
}

export function isDue(f: Finder, tz: string, now = Date.now()): boolean {
  if (!f.enabled) return false;
  const day = zonedMidnightToday(tz, now);
  if (!runsOn(f, day, tz)) return false;
  if (now < day + (f.hour * 60 + f.minute) * 60000) return false;
  if (f.last_run && dayKey(f.last_run, tz) === dayKey(now, tz)) return false;
  return true;
}

export function describe(f: Finder, tz: string): string {
  const t = `${String(f.hour).padStart(2, '0')}:${String(f.minute).padStart(2, '0')}`;
  let s = `${f.per_run} ${f.repeat === 'weekly' ? 'a week' : 'a day'} at ${t}`;
  if (f.repeat === 'weekdays') s += ', weekdays';
  else if (f.repeat === 'weekly' && f.start) s += ', every ' + new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(new Date(f.start));
  if (f.start > Date.now()) s += ', from ' + new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' }).format(new Date(f.start));
  return s;
}

/* ---- one run ---- */

export interface RunResult { ok: boolean; text: string; pushed: { name: string; company: string; id: string; fit: string }[]; credits: number; spent: number; left: number; skipped: number; seen: string[]; limited?: boolean; icp_skipped?: number }

export async function runFinder(client: Client, f: Finder, live: boolean): Promise<RunResult> {
  const keys = effectiveKeys(client);
  const apollo: ApolloCtx = { slug: client.slug, key: keys.apollo, ctx: `finder:${f.name}` };
  const llm: LlmCtx = { slug: client.slug, ctx: `finder:${f.name}`, key: keys.openai, model: keys.openaiModel };
  const intent = cleanIntent(f.intent);
  const filters = intentFilters(intent);
  const seen = new Set(f.seen || []);
  const icpOnly = !!f.icp_only && targetingActive(client.targeting);
  const icpOf = new Map<string, IcpMatch>();
  let notIcp = 0;
  let want = Math.max(1, f.per_run);
  const left = creditsLeft(client);
  if (intent.kind === 'people' && live) {
    if (left <= 0) return { ok: false, text: `The finder did not run. ${outOfCreditsText(client)}`, pushed: [], credits: 0, spent: 0, left: 0, skipped: 0, seen: [...seen] };
    want = Math.min(want, left);
  }
  // The daily cap on automatic pushes, shared by every finder of this client.
  const cap = autoPushState(client);
  let capped = false;
  if (live) {
    if (cap.left <= 0) return { ok: true, text: `The finder did not push anything. ${autoPushLimitText(client)}`, pushed: [], credits: 0, spent: 0, left, skipped: 0, seen: [...seen], limited: true };
    if (cap.left < want) { want = cap.left; capped = true; }
  }
  const picked: (Person | Org)[] = [];
  let credits = 0;
  let skipped = 0;
  for (let page = 1; page <= (icpOnly ? 8 : 4) && picked.length < want; page++) {
    const res = intent.kind === 'people' ? (live ? await searchPeople(apollo, filters, page, 25) : samplePeople(filters, page, 25)) : (live ? await searchCompanies(apollo, filters, page, 25) : sampleCompanies(filters, page, 25));
    if (!res.rows.length) break;
    if (intent.kind === 'people') await annotateInLaunchpad(client, res.rows as Person[], live);
    if (targetingActive(client.targeting)) await annotateTargeting(client, res.rows, intent.kind, apollo, live, icpOf);
    for (const r of res.rows) {
      if (picked.length >= want) break;
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      if ((r as Person).in_lp) { skipped++; continue; }
      if (icpOnly && icpOf.get(r.id)?.level !== 'icp') { notIcp++; continue; }
      picked.push(r);
    }
    if (res.rows.length < 25) break;
  }
  const seenOut = [...seen].slice(-2000);
  if (!picked.length) return { ok: true, icp_skipped: notIcp, text: notIcp ? `No ICP matches today: ${notIcp} lead${notIcp === 1 ? '' : 's'} checked, none met every targeting condition${skipped ? `, ${skipped} already in Launchpad` : ''}.` : skipped ? `No new leads today: everything the search returned is already in Launchpad (${skipped} skipped).` : 'No new leads today: everything the search returned was delivered before.', pushed: [], credits: 0, spent: 0, left, skipped, seen: seenOut };
  const fits = await fitLines(llm, client.profile, picked, intent, intent.kind, live && !!keys.openai);
  const header = `LEADS FINDER — ${f.name} (${new Intl.DateTimeFormat('en-US', { timeZone: client.launchpad.timezone, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date())})`;
  const tags = ['leads-finder', 'leads-finder-new'];
  const pushed: RunResult['pushed'] = [];
  const errors: string[] = [];
  let spent = 0;
  let waterfallNote = '';
  if (intent.kind === 'people') {
    const r = await pushPeople(client, picked as Person[], {}, { live, apollo, llm, tags, noteHeader: header, fits, waterfall: waterfallPlan(client, 'finder', `finder:${f.name}`) });
    credits = r.credits;
    if (r.waterfall && r.waterfall.tried) waterfallNote = `, email waterfall found ${r.waterfall.found} of ${r.waterfall.tried}`;
    spent = r.spent;
    if (live && spent) spendCredits(client, spent, `finder: ${f.name}`, 'finder');
    errors.push(...r.errors);
    for (const res of r.results) for (const c of res.contacts) pushed.push({ name: c.name, company: res.company.name, id: c.id, fit: '' });
  } else {
    const r = await pushCompanies(client, picked as Org[], live, fits, header);
    errors.push(...r.errors);
    for (const c of r.results) pushed.push({ name: c.name, company: c.domain, id: c.id, fit: fits[c.name] || '' });
  }
  if (!live) return { ok: true, icp_skipped: notIcp, text: `Sample run: ${picked.length} leads would be pushed${notIcp ? `, ${notIcp} skipped as not an ICP match` : ''} (nothing written in sample mode).`, pushed: picked.map((r) => ({ name: 'first' in r ? `${r.first} ${r.last}`.trim() : r.name, company: 'first' in r ? r.company : r.domain, id: '', fit: fits[r.id] || '' })), credits: 0, spent: 0, left, skipped, seen: seenOut };
  const ok = errors.length === 0;
  const nowLeft = creditsLeft(client);
  const after = pushed.length ? autoPushSpend(client, pushed.length) : cap;
  let text = ok ? `${pushed.length} new lead${pushed.length === 1 ? '' : 's'} pushed into Launchpad${skipped ? `, ${skipped} already there skipped` : ''}${notIcp ? `, ${notIcp} not an ICP match skipped` : ''}${waterfallNote}${spent ? `, ${spent} credit${spent === 1 ? '' : 's'} used (${nowLeft} left)` : ''}.` : errors.join(' ');
  if (ok && (capped || after.left <= 0)) text += ` ${after.used} of ${after.daily} automatic pushes used today${after.left <= 0 ? ': the finders pause until tomorrow' : ''}.`;
  return { ok, text, pushed, credits, spent, left: nowLeft, skipped, seen: seenOut, limited: after.left <= 0, icp_skipped: notIcp };
}

/**
 * The targeting verdict on each row. People get their company facts first
 * (one org lookup per domain, cached a week, no credits) when the targeting
 * has company conditions, so industry, size and revenue can be checked
 * before a reveal. Sets `icp` on people; companies go into `into`.
 */
export async function annotateTargeting(client: Client, rows: (Person | Org)[], kind: Kind, apollo: ApolloCtx, live: boolean, into?: Map<string, IcpMatch>): Promise<Record<string, IcpMatch>> {
  const t = client.targeting;
  const out: Record<string, IcpMatch> = {};
  if (!targetingActive(t)) return out;
  if (kind === 'people') {
    const people = rows as Person[];
    const needOrg = !!(t.industries.length || t.employee_ranges.length || t.revenue_min || t.revenue_max || t.locations.length || t.exclude.industries.length || t.exclude.companies.length);
    if (needOrg && live) {
      try {
        const orgs = await bulkOrgs(apollo, people.filter((p) => !p.org && p.domain).map((p) => p.domain));
        for (const p of people) if (!p.org && p.domain && orgs[p.domain]) p.org = orgs[p.domain];
      } catch { /* match on what we have */ }
    }
    for (const p of people) { const m = matchPerson(t, p); if (m) { p.icp = m; out[p.id] = m; into?.set(p.id, m); } }
  } else {
    for (const o of rows as Org[]) { const m = matchOrg(t, o); if (m) { out[o.id] = m; into?.set(o.id, m); } }
  }
  return out;
}

export async function runAndSave(client: Client, id: string, live: boolean, by: 'finder' | 'client' = 'finder'): Promise<RunResult> {
  const all = listFinders(client.slug);
  const i = all.findIndex((f) => f.id === id);
  if (i < 0) return { ok: false, text: 'Finder not found.', pushed: [], credits: 0, spent: 0, left: 0, skipped: 0, seen: [] };
  const r = await runFinder(client, all[i], live);
  if (live) logActivity(client.slug, { kind: 'finder', title: all[i].name, detail: r.text, credits: r.spent, by, ok: r.ok, n: r.pushed.length, items: r.pushed.map((p) => ({ name: p.name, company: p.company, id: p.id })), ref: all[i].id });
  if (live && (r.ok || r.pushed.length)) {
    all[i].last_run = Date.now();
    all[i].last_result = r.text;
    all[i].seen = r.seen;
    saveFinders(client.slug, all);
  }
  return r;
}

/** Every five minutes, run what is due for every enabled client. */
export function startScheduler(log: (s: string) => void): void {
  let busy = false;
  cron.schedule('*/5 * * * *', async () => {
    if (busy) return;
    busy = true;
    try {
      for (const client of listClients()) {
        if (!client.enabled) continue;
        const keys = effectiveKeys(client);
        const live = !!keys.apollo && lpReady(lpOf(client));
        for (const f of listFinders(client.slug)) {
          if (!isDue(f, client.launchpad.timezone)) continue;
          log(`[finder] ${client.slug} · "${f.name}" running`);
          try {
            const r = await runAndSave(client, f.id, live);
            log(`[finder] ${client.slug} · ${r.ok ? 'ok' : 'FAILED'}: ${r.text}`);
          } catch (e) {
            log(`[finder] ${client.slug} · error: ${(e as Error).message}`);
          }
        }
      }
    } finally {
      busy = false;
    }
  });
}
