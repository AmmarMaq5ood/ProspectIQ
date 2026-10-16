import path from 'node:path';
import { config } from './config.js';
import { appendLine, readLines } from './store.js';
import { effectiveKeys, listClients } from './clients.js';
import { usageReadSince } from './costs.js';
import { tregFind } from './treg.js';
import { enrichPerson, searchPeople } from './apollo.js';
import { askIntent } from './llm.js';
import { intentFilters } from './rules.js';
import type { Client, Person, UsageRow } from './types.js';

/**
 * The admin's view of the email waterfall: how it has done so far (from the
 * usage log every lookup writes) and a tester that runs it on a pasted list
 * or on a Scout search without pushing anything, so the agency can judge the
 * hit rate, the verified share and the cost per email before switching it on
 * for clients. Test results are kept in waterfall-tests.jsonl (admin only).
 */

export const TEST_CTX = 'admin:waterfall';
const TESTS = () => path.join(config.dataDir, 'waterfall-tests.jsonl');

export interface TestPerson { first: string; last: string; domain: string; linkedin?: string; company?: string; title?: string }
export type TestStatus = 'found' | 'none' | 'error' | 'had_email' | 'skipped';
export interface TestRow {
  t: number; client: string; mode: 'list' | 'search'; q?: string;
  first: string; last: string; domain: string; company?: string; title?: string; linkedin?: string;
  db_email?: string; email: string; verified: boolean; provider: string; cost: number; ms: number; status: TestStatus; err?: string;
}

const LINKEDIN = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^\s,;|<>]+/i;
const DOMAIN = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i;

/** One person per line: "Jane Smith, acme.com", "Jane Smith acme.com", "Jane Smith <https://linkedin.com/in/jane>" or just a LinkedIn URL. */
export function parsePeopleList(text: string): TestPerson[] {
  const out: TestPerson[] = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const li = line.match(LINKEDIN);
    const linkedin = li ? li[0].replace(/[>)\]]+$/, '') : '';
    if (li) line = line.replace(li[0], ' ');
    line = line.replace(/<|>/g, ' ');
    const dm = line.match(DOMAIN);
    const domain = dm ? dm[0].toLowerCase().replace(/^www\./, '') : '';
    if (dm) line = line.replace(dm[0], ' ');
    const words = line.replace(/[,;|\t]+/g, ' ').split(/\s+/).filter(Boolean);
    const first = words[0] || '';
    const last = words.slice(1).join(' ');
    if (linkedin || (first && last && domain)) out.push({ first, last, domain, linkedin: linkedin || undefined });
  }
  return out;
}

export function readTests(limit = 100): TestRow[] {
  const rows = readLines<TestRow>(TESTS(), () => true);
  return rows.slice(-limit).reverse();
}

async function lookupOne(client: Client, key: string, p: TestPerson, mode: 'list' | 'search', q?: string): Promise<TestRow> {
  const t0 = Date.now();
  const base = { t: t0, client: client.slug, mode, q, first: p.first, last: p.last, domain: p.domain, company: p.company, title: p.title, linkedin: p.linkedin };
  let row: TestRow;
  try {
    const hit = await tregFind({ slug: client.slug, key, ctx: TEST_CTX, timeoutMs: 30000 }, { first: p.first, last: p.last, domain: p.domain, linkedin: p.linkedin });
    row = hit
      ? { ...base, email: hit.email, verified: hit.verified, provider: hit.provider, cost: hit.cost, ms: Date.now() - t0, status: 'found' }
      : { ...base, email: '', verified: false, provider: '', cost: 0, ms: Date.now() - t0, status: 'none' };
  } catch (e) {
    row = { ...base, email: '', verified: false, provider: '', cost: 0, ms: Date.now() - t0, status: 'error', err: String((e as Error).message || e).slice(0, 200) };
  }
  appendLine(TESTS(), row);
  return row;
}

/** Runs the waterfall on a pasted list, a few at a time. Nothing is pushed; each call is logged like a real one. */
export async function testPeople(client: Client, people: TestPerson[], mode: 'list' | 'search' = 'list', q?: string): Promise<TestRow[]> {
  const key = effectiveKeys(client).treg;
  if (!key) throw new Error('No email waterfall key yet: add it under Settings, API keys.');
  const rows: TestRow[] = new Array(people.length);
  let i = 0;
  const worker = async () => { while (i < people.length) { const k = i++; rows[k] = await lookupOne(client, key, people[k], mode, q); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(4, people.length)) }, worker));
  return rows;
}

export interface SearchTest { summary: string; total: number; rows: TestRow[]; db_emails: number }

/**
 * The production flow without the push: read the request, search, reveal
 * each person (a research credit is used only when the database returns an
 * email), then run the waterfall on everyone still without one.
 */
export async function testFromSearch(client: Client, q: string, n: number): Promise<SearchTest> {
  const keys = effectiveKeys(client);
  if (!keys.apollo) throw new Error('This client has no research key, so there is nothing to search.');
  if (!keys.treg) throw new Error('No email waterfall key yet: add it under Settings, API keys.');
  const apollo = { slug: client.slug, key: keys.apollo, ctx: TEST_CTX };
  const llm = { slug: client.slug, ctx: TEST_CTX, key: keys.openai, model: keys.openaiModel };
  const intent = await askIntent(llm, client.profile, q, !!keys.openai);
  if (intent.kind !== 'people') throw new Error('Ask for people (titles at companies), not companies: the waterfall finds emails for people.');
  const result = await searchPeople(apollo, intentFilters(intent), 1, Math.max(1, Math.min(10, n)));
  const rows: TestRow[] = [];
  const todo: TestPerson[] = [];
  let dbEmails = 0;
  for (let p of result.rows as Person[]) {
    const t0 = Date.now();
    const base = { t: t0, client: client.slug, mode: 'search' as const, q, first: p.first, last: p.last, domain: p.domain, company: p.company, title: p.title, linkedin: p.linkedin || undefined };
    try { p = await enrichPerson(apollo, p, p.domain); } catch (e) {
      rows.push({ ...base, email: '', verified: false, provider: '', cost: 0, ms: Date.now() - t0, status: 'error', err: `Research lookup failed: ${String((e as Error).message || e).slice(0, 160)}` });
      continue;
    }
    const full = { ...base, first: p.first, last: p.last, domain: p.domain, company: p.company, title: p.title, linkedin: p.linkedin || undefined };
    if (p.email) { dbEmails++; rows.push({ ...full, db_email: p.email, email: '', verified: false, provider: '', cost: 0, ms: Date.now() - t0, status: 'had_email' }); continue; }
    if (p.last_obf || !p.last || !p.domain) { rows.push({ ...full, email: '', verified: false, provider: '', cost: 0, ms: Date.now() - t0, status: 'skipped', err: p.last_obf ? 'surname not revealed' : 'no company domain' }); continue; }
    todo.push({ first: p.first, last: p.last, domain: p.domain, linkedin: p.linkedin || undefined, company: p.company, title: p.title });
  }
  const wf = await testPeople(client, todo, 'search', q);
  for (const r of rows) if (r.status !== 'found') appendLine(TESTS(), r);
  return { summary: intent.summary, total: result.total, rows: [...rows, ...wf], db_emails: dbEmails };
}

/* ---- stats from the usage log ---- */

export interface WfLine { tried: number; found: number; verified: number; errors: number; cost: number; ms: number }
export interface WfRecent { t: number; client: string; source: string; ok: boolean; found: boolean; verified: boolean; provider: string; cost: number; ms: number; err?: string }
export interface WfStats {
  days: number;
  totals: WfLine & { hit_rate: number; verified_share: number; cost_per_email: number; ms_avg: number };
  by_day: ({ day: string } & WfLine)[];
  by_client: ({ slug: string; name: string } & WfLine)[];
  by_source: ({ source: string } & WfLine)[];
  recent: WfRecent[];
}

const line = (): WfLine => ({ tried: 0, found: 0, verified: 0, errors: 0, cost: 0, ms: 0 });
const add = (l: WfLine, r: UsageRow) => { l.tried++; l.cost += r.cost || 0; l.ms += r.ms || 0; if (!r.ok) l.errors++; else if (r.n) { l.found++; if (r.model === 'verified') l.verified++; } };
export const sourceOf = (ctx: string): string => (ctx === TEST_CTX ? 'Tests' : ctx.startsWith('finder:') ? 'Daily finders' : 'Pushes');

/** Pure: the report from each client's usage rows. */
export function statsFromRows(clients: { slug: string; name: string; rows: UsageRow[] }[], days: number, now = Date.now()): WfStats {
  const since = now - days * 86400000;
  const totals = line();
  const byDay = new Map<string, { day: string } & WfLine>();
  const byClient: ({ slug: string; name: string } & WfLine)[] = [];
  const bySource = new Map<string, { source: string } & WfLine>();
  const recent: WfRecent[] = [];
  const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
  for (const c of clients) {
    const cl = { slug: c.slug, name: c.name, ...line() };
    for (const r of c.rows) {
      if (r.p !== 'treg' || (r.t || 0) < since) continue;
      add(totals, r); add(cl, r);
      const d = byDay.get(dayKey(r.t)) || { day: dayKey(r.t), ...line() }; add(d, r); byDay.set(d.day, d);
      const s = sourceOf(r.ctx); const sl = bySource.get(s) || { source: s, ...line() }; add(sl, r); bySource.set(s, sl);
      recent.push({ t: r.t, client: c.name, source: s, ok: !!r.ok, found: !!r.n, verified: r.model === 'verified', provider: r.kind || '', cost: r.cost || 0, ms: r.ms || 0, err: r.err });
    }
    if (cl.tried) byClient.push(cl);
  }
  recent.sort((a, b) => b.t - a.t);
  const okCalls = totals.tried - totals.errors;
  return {
    days,
    totals: { ...totals, hit_rate: okCalls ? totals.found / okCalls : 0, verified_share: totals.found ? totals.verified / totals.found : 0, cost_per_email: totals.found ? totals.cost / totals.found : 0, ms_avg: totals.tried ? totals.ms / totals.tried : 0 },
    by_day: [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1)),
    by_client: byClient.sort((a, b) => b.tried - a.tried),
    by_source: [...bySource.values()].sort((a, b) => b.tried - a.tried),
    recent: recent.slice(0, 50),
  };
}

export function waterfallStats(days: number): WfStats {
  const since = Date.now() - days * 86400000;
  return statsFromRows(listClients().map((c) => ({ slug: c.slug, name: c.name, rows: usageReadSince(c.slug, since) })), days);
}
