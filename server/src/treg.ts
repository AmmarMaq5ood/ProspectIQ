import { usageLog } from './usage.js';
import type { Person } from './types.js';

/**
 * The email waterfall: treg.to is a pay-per-call gateway to 100+ data
 * providers. When the research database has no work email for a person we
 * are pushing, one call runs name + company domain through the providers
 * in turn and comes back with an address and whether it verified. Each call
 * is a small charge (about one to two cents), so it runs only for clients
 * with the switch on, only after the research lookup, and never past the
 * credits the client has left. Clients never see the name treg.to.
 */

const API = 'https://treg.to/call/treg.people.email.find';
const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'protonmail.com', 'proton.me', 'gmx.com', 'gmx.net', 'mail.com', 'yandex.com', 'zoho.com', 'comcast.net', 'att.net', 'verizon.net']);

export interface TregCtx { slug: string; key: string; ctx: string; timeoutMs?: number; maxCost?: number }
export interface TregHit { email: string; verified: boolean; provider: string; cost: number }

export const isFreeMail = (email: string): boolean => FREE_MAIL.has((email.toLowerCase().split('@')[1] || '').trim());

/** The one usable address in a treg.to answer: a work email, on the company's domain when we know it, verified first. */
export function pickEmail(output: unknown, domain = ''): { email: string; verified: boolean } | null {
  const o = (output && typeof output === 'object' ? output : {}) as Record<string, unknown>;
  const cands: { email: string; verified: boolean }[] = [];
  const add = (e: unknown, v: unknown) => {
    const s = String(e || '').trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) cands.push({ email: s, verified: v === true || v === 'valid' || v === 'verified' || v === 'deliverable' });
  };
  add(o.email, o.verified ?? o.status);
  for (const x of (Array.isArray(o.emails) ? o.emails : []) as unknown[]) {
    if (typeof x === 'string') add(x, false);
    else if (x && typeof x === 'object') { const r = x as Record<string, unknown>; add(r.email ?? r.value, r.verified ?? r.status); }
  }
  const work = cands.filter((c) => !isFreeMail(c.email));
  const d = domain.toLowerCase().replace(/^www\./, '');
  const onDomain = d ? work.filter((c) => c.email.endsWith('@' + d)) : [];
  const pool = onDomain.length ? onDomain : work;
  if (!pool.length) return null;
  return pool.find((c) => c.verified) || pool[0];
}

/** One lookup. Logs the call (cost, provider, verified or not) in the client's usage log; never throws. */
export async function tregFind(t: TregCtx, p: { first: string; last: string; domain: string; linkedin?: string }): Promise<TregHit | null> {
  const t0 = Date.now();
  const body = p.linkedin ? { linkedin_url: p.linkedin } : { first_name: p.first, last_name: p.last, domain: p.domain };
  let res: Response;
  let json: Record<string, unknown> = {};
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'X-Treg-Token': t.key, 'X-Treg-Route-Verify': 'true', 'X-Treg-Route-Max-Cost': String(t.maxCost ?? 0.02) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(t.timeoutMs ?? 40000),
    });
    json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  } catch (e) {
    usageLog(t.slug, t.ctx, { p: 'treg', ep: 'people.email.find', ok: 0, ms: Date.now() - t0, err: String((e as Error).message || e).slice(0, 200) });
    return null;
  }
  const ms = Date.now() - t0;
  const micro = Number(res.headers.get('x-treg-cost-micro') || 0);
  const cost = Number.isFinite(micro) && micro > 0 ? micro / 1e6 : 0;
  const provider = res.headers.get('x-treg-served-by') || '';
  if (!res.ok) {
    usageLog(t.slug, t.ctx, { p: 'treg', ep: 'people.email.find', ok: 0, ms, cost, err: String(json.error || json.message || `HTTP ${res.status}`).slice(0, 200) });
    return null;
  }
  const hit = pickEmail(json.output ?? json, p.domain);
  usageLog(t.slug, t.ctx, { p: 'treg', ep: 'people.email.find', ok: 1, ms, cost, n: hit ? 1 : 0, kind: provider || undefined, model: hit ? (hit.verified ? 'verified' : 'unverified') : 'none' });
  return hit ? { ...hit, provider, cost } : null;
}

export interface WaterfallOpts { budgetMs: number; maxFinds: number; concurrency?: number; find?: typeof tregFind; now?: () => number }
export interface WaterfallResult { tried: number; found: number; cost: number; skipped: number }

/**
 * Fill in emails for the people who came back from the research lookup
 * without one: a few lookups at a time, inside a time budget, and never more
 * finds than the credits allow. Mutates the people it fills (email, source,
 * verified flag, tags).
 */
export async function waterfall(t: TregCtx, people: Person[], opts: WaterfallOpts): Promise<WaterfallResult> {
  const find = opts.find || tregFind;
  const now = opts.now || Date.now;
  const todo = people.filter((p) => !p.email && p.first && p.last && !p.last_obf && p.domain);
  const skipped = people.filter((p) => !p.email).length - todo.length;
  const deadline = now() + opts.budgetMs;
  let i = 0, tried = 0, found = 0, cost = 0;
  const worker = async () => {
    while (i < todo.length) {
      if (now() >= deadline || found >= opts.maxFinds) return;
      const p = todo[i++];
      tried++;
      const left = deadline - now();
      const hit = await find({ ...t, timeoutMs: Math.max(5000, Math.min(t.timeoutMs ?? 40000, left)) }, { first: p.first, last: p.last, domain: p.domain, linkedin: p.linkedin || undefined });
      if (!hit || found >= opts.maxFinds) continue;
      found++;
      cost += hit.cost;
      p.email = hit.email;
      p.has_email = true;
      p.email_source = 'waterfall';
      p.email_verified = hit.verified;
      p.tags = [...new Set([...(p.tags || []), 'email-waterfall', ...(hit.verified ? [] : ['email-unverified'])])];
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 3, todo.length)) }, worker));
  return { tried, found, cost, skipped };
}
