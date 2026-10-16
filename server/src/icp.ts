import type { IcpMatch, MatchLevel, Org, Person, Profile, Targeting } from './types.js';

/**
 * Targeting (the client's ideal customer profile) and the matcher.
 *
 * The client writes down who they want once: titles, seniority, department,
 * industries, locations, company size, revenue, and what to exclude. Every
 * search result and every pushed lead is compared against it. A lead that
 * meets every condition we could check is an "ICP match" (hot lead); one
 * that meets at least half is a "target match" (high priority). Conditions
 * we cannot check for a lead (no company data yet) count as unknown, never
 * as a miss. Scout still shows everything the request asked for; matching
 * only highlights, tags, and lets finders push the matches alone.
 */

export function blankTargeting(): Targeting {
  return { titles: [], seniorities: [], departments: [], industries: [], locations: [], employee_ranges: [], revenue_min: 0, revenue_max: 0, exclude: { titles: [], industries: [], locations: [], companies: [] }, finders_icp_only: false, updated: 0 };
}

const strs = (v: unknown, max = 40, len = 80): string[] => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\r?\n|,/) : []).map((x) => String(x ?? '').trim().slice(0, len)).filter(Boolean).filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i).slice(0, max);
const num = (v: unknown): number => { const n = Number(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };

export function cleanTargeting(raw: unknown): Targeting {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const ex = (r.exclude && typeof r.exclude === 'object' ? r.exclude : {}) as Record<string, unknown>;
  const t: Targeting = {
    titles: strs(r.titles), seniorities: strs(r.seniorities), departments: strs(r.departments), industries: strs(r.industries), locations: strs(r.locations), employee_ranges: strs(r.employee_ranges),
    revenue_min: num(r.revenue_min), revenue_max: num(r.revenue_max),
    exclude: { titles: strs(ex.titles), industries: strs(ex.industries), locations: strs(ex.locations), companies: strs(ex.companies) },
    finders_icp_only: r.finders_icp_only === true,
    updated: typeof r.updated === 'number' ? r.updated : 0,
  };
  if (t.revenue_max && t.revenue_min > t.revenue_max) [t.revenue_min, t.revenue_max] = [t.revenue_max, t.revenue_min];
  return t;
}

/** Which conditions are set at all. */
export function configured(t: Targeting): string[] {
  const out: string[] = [];
  if (t.titles.length) out.push('title');
  if (t.seniorities.length) out.push('seniority');
  if (t.departments.length) out.push('department');
  if (t.industries.length) out.push('industry');
  if (t.locations.length) out.push('location');
  if (t.employee_ranges.length) out.push('company size');
  if (t.revenue_min || t.revenue_max) out.push('revenue');
  return out;
}

export const targetingActive = (t: Targeting | undefined | null): boolean => !!t && configured(t).length > 0;

/* ---- text matching: lowercase, light stemming, phrase or all-words ---- */

const stem = (w: string) => (w.length > 4 ? w.replace(/ies$/, 'y').replace(/(sses|ches|shes|xes)$/, (m) => m.slice(0, -2)).replace(/s$/, '') : w);
const norm = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9+ ]+/g, ' ').split(/\s+/).filter(Boolean).map(stem).join(' ');
const SYN: Record<string, string> = { us: 'united states', usa: 'united states', america: 'united states', uk: 'united kingdom', uae: 'united arab emirates' };
/** Locations: normalised, with country short forms expanded token by token ("US" and "United States" meet in the middle). */
const loc = (s: string) => norm(s).split(' ').map((w) => (SYN[w] ? norm(SYN[w]) : w)).join(' ');

/** Does `hay` mention `kw`: as a phrase, or every word of it (so "manager, purchasing" still matches "purchasing manager"). */
export function mentions(hay: string, kw: string, asLocation = false): boolean {
  const h = ' ' + (asLocation ? loc(hay) : norm(hay)) + ' ';
  const k = asLocation ? loc(kw) : norm(kw);
  if (!k.trim()) return false;
  if (h.includes(' ' + k + ' ')) return true;
  const words = k.split(' ').filter((w) => w.length > 2);
  return words.length > 0 && words.every((w) => h.includes(' ' + w + ' '));
}
const anyMention = (hay: string, kws: string[], asLocation = false) => kws.find((k) => mentions(hay, k, asLocation)) || '';

function inRange(n: number, code: string): boolean {
  const [a, b] = code.split(',').map((x) => Number(x));
  if (!Number.isFinite(a)) return false;
  return n >= a && (Number.isFinite(b) ? n <= b : true);
}

interface Check { name: string; ok: boolean | null; why?: string }

function companyChecks(t: Targeting, o: Org | undefined, personCity = ''): Check[] {
  const out: Check[] = [];
  const known = !!o && (o.enriched || !!o.industry || o.employees > 0);
  const indHay = o ? [o.industry, ...(o.industries || []), ...(o.keywords || []), o.description].filter(Boolean).join(' ') : '';
  if (t.industries.length) { const hit = indHay ? anyMention(indHay, t.industries) : ''; out.push({ name: 'industry', ok: indHay ? !!hit : null, why: hit }); }
  const locHay = [personCity, o?.city, o?.state, o?.country].filter(Boolean).join(' ');
  if (t.locations.length) { const hit = locHay ? anyMention(locHay, t.locations, true) : ''; out.push({ name: 'location', ok: locHay ? !!hit : null, why: hit }); }
  if (t.employee_ranges.length) out.push({ name: 'company size', ok: o && o.employees > 0 ? t.employee_ranges.some((c) => inRange(o.employees, c)) : null, why: o?.employees ? `${o.employees.toLocaleString('en-US')} employees` : '' });
  if (t.revenue_min || t.revenue_max) out.push({ name: 'revenue', ok: o && o.revenue_n > 0 ? o.revenue_n >= (t.revenue_min || 0) && (!t.revenue_max || o.revenue_n <= t.revenue_max) : null, why: o?.revenue ? `$${o.revenue}` : '' });
  void known;
  return out;
}

function excluded(t: Targeting, title: string, o: Org | undefined, personCity: string, company: string): string {
  const e = t.exclude;
  const tt = title && anyMention(title, e.titles); if (tt) return `title "${tt}"`;
  const indHay = o ? [o.industry, ...(o.industries || []), ...(o.keywords || [])].filter(Boolean).join(' ') : '';
  const ii = indHay && anyMention(indHay, e.industries); if (ii) return `industry "${ii}"`;
  const locHay = [personCity, o?.city, o?.state, o?.country].filter(Boolean).join(' ');
  const ll = locHay && anyMention(locHay, e.locations, true); if (ll) return `location "${ll}"`;
  const coHay = [company, o?.name, o?.domain].filter(Boolean).join(' ');
  const cc = coHay && anyMention(coHay, e.companies); if (cc) return `company "${cc}"`;
  return '';
}

function decide(t: Targeting, checks: Check[], reason: string): IcpMatch {
  const conf = configured(t).length;
  const hits = checks.filter((c) => c.ok === true).map((c) => c.name);
  const misses = checks.filter((c) => c.ok === false).map((c) => c.name);
  const unknown = checks.filter((c) => c.ok === null).map((c) => c.name);
  const evaluable = hits.length + misses.length;
  let level: MatchLevel = 'none';
  if (reason) level = 'none';
  else if (evaluable > 0 && misses.length === 0 && evaluable >= Math.max(1, Math.ceil(conf / 2))) level = 'icp';
  else if (hits.length > 0 && hits.length >= Math.ceil(evaluable / 2)) level = 'target';
  return { level, hits, misses, unknown, of: conf, excluded: reason || undefined, why: checks.filter((c) => c.ok === true && c.why).map((c) => `${c.name}: ${c.why}`) };
}

/** A person against the targeting. Uses the company facts on `p.org` when they are there (after a reveal, or an org lookup on the results page). */
export function matchPerson(t: Targeting, p: Person): IcpMatch | null {
  if (!targetingActive(t)) return null;
  const o = p.org;
  const checks: Check[] = [];
  if (t.titles.length) { const hit = anyMention(p.title || '', t.titles); checks.push({ name: 'title', ok: p.title ? !!hit : null, why: hit }); }
  if (t.seniorities.length) checks.push({ name: 'seniority', ok: p.seniority ? t.seniorities.includes(p.seniority) : null, why: p.seniority });
  if (t.departments.length) checks.push({ name: 'department', ok: p.departments?.length ? p.departments.some((d) => t.departments.includes(d)) : null, why: (p.departments || []).find((d) => t.departments.includes(d)) });
  checks.push(...companyChecks(t, o, p.city));
  return decide(t, checks, excluded(t, p.title, o, p.city, p.company));
}

/** A company against the company-level conditions only. */
export function matchOrg(t: Targeting, o: Org): IcpMatch | null {
  if (!targetingActive(t)) return null;
  const checks = companyChecks(t, o);
  if (!checks.length) return null;
  return decide({ ...t, titles: [], seniorities: [], departments: [] }, checks, excluded(t, '', o, '', o.name));
}

export const PRIORITY: Record<MatchLevel, { label: string; field: string; priority: string; tags: string[] }> = {
  icp: { label: 'ICP match', field: 'ICP match', priority: 'Hot', tags: ['icp-match', 'hot-lead'] },
  target: { label: 'Target match', field: 'Target match', priority: 'High', tags: ['target-match', 'high-priority'] },
  none: { label: '', field: 'No match', priority: 'Normal', tags: [] },
};

export const tagsFor = (m: IcpMatch | null | undefined): string[] => (m ? PRIORITY[m.level].tags : []);

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** One line a person can read: what matched, what did not, what could not be checked. */
export function matchText(m: IcpMatch | null | undefined): string {
  if (!m) return '';
  if (m.excluded) return `Excluded by the targeting: ${m.excluded}.`;
  const bits: string[] = [];
  if (m.hits.length) bits.push(`Matches ${list(m.hits)}`);
  if (m.misses.length) bits.push(`${list(m.misses)} ${m.misses.length === 1 ? 'differs' : 'differ'}`);
  if (m.unknown.length) bits.push(`${list(m.unknown)} not known yet`);
  return bits.length ? bits.join('; ') + '.' : 'None of the targeting conditions could be checked.';
}

/** The written summary when GPT is off, or as its fallback: who this is, why they fit, how hot. */
export function summaryRule(p: Person, m: IcpMatch | null, t: Targeting, profile: Profile): string {
  const o = p.org;
  const who = `${p.first} ${p.last}`.trim() || 'This contact';
  const co = [o?.industry, o?.employees ? `~${o.employees.toLocaleString('en-US')} employees` : '', [o?.city, o?.state].filter(Boolean).join(', ')].filter(Boolean).join(', ');
  const s1 = `${who} is ${p.title ? p.title + ' at ' : 'at '}${p.company || o?.name || 'the company'}${co ? ` (${co})` : ''}.`;
  if (!m || !targetingActive(t)) return `${s1}${profile.sells ? ` ${profile.company || 'We'} sell${profile.company ? 's' : ''} ${profile.sells.replace(/\.$/, '')}.` : ''}`;
  const fit = m.level === 'icp' ? 'Hot lead: every targeting condition that could be checked is met' : m.level === 'target' ? 'High priority: most targeting conditions are met' : m.excluded ? `Not a target: excluded by ${m.excluded}` : 'Outside the targeting';
  const detail = m.hits.length ? ` (${list(m.hits)})` : '';
  const miss = m.misses.length ? `; ${list(m.misses)} ${m.misses.length === 1 ? 'does' : 'do'} not match` : '';
  const unk = m.unknown.length ? `; ${list(m.unknown)} still to confirm` : '';
  return `${s1} ${fit}${detail}${miss}${unk}.`;
}

/** One line for the activity log: what the targeting says. */
export function describeTargeting(t: Targeting): string {
  const bits: string[] = [];
  if (t.titles.length) bits.push(`titles: ${t.titles.join(', ')}`);
  if (t.seniorities.length) bits.push(`seniority: ${t.seniorities.join(', ')}`);
  if (t.departments.length) bits.push(`departments: ${t.departments.join(', ')}`);
  if (t.industries.length) bits.push(`industries: ${t.industries.join(', ')}`);
  if (t.locations.length) bits.push(`locations: ${t.locations.join(', ')}`);
  if (t.employee_ranges.length) bits.push(`company size: ${t.employee_ranges.map((r) => r.replace(',', ' to ')).join(', ')} employees`);
  if (t.revenue_min || t.revenue_max) bits.push(`revenue: ${t.revenue_min ? '$' + t.revenue_min.toLocaleString('en-US') : 'any'} to ${t.revenue_max ? '$' + t.revenue_max.toLocaleString('en-US') : 'any'}`);
  const ex = [...t.exclude.titles, ...t.exclude.industries, ...t.exclude.locations, ...t.exclude.companies];
  if (ex.length) bits.push(`excluding: ${ex.join(', ')}`);
  if (t.finders_icp_only) bits.push('new finders push ICP matches only');
  return bits.join(' · ');
}
