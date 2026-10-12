import OpenAI from 'openai';
import { DEP_CODES, EMPLOYEE_RANGES, SENIORITY } from './apollo.js';
import { cached } from './store.js';
import { usageLog, priceFor } from './usage.js';
import { blankIntent, cleanIntent, intentSummary, rulesIntent } from './rules.js';
import type { Intent, Kind, Org, Person, Profile } from './types.js';

/**
 * GPT for ProspectIQ: reads a plain-words request into search filters, writes
 * a one-line "why this is a fit" per lead, and drafts a client profile from a
 * website. Every call is a strict JSON-schema structured output, logged to
 * the client's usage file with tokens and cost.
 */

export interface LlmCtx { slug: string; ctx: string; key: string; model: string }

export function llmReady(c: LlmCtx): boolean {
  return !!c.key;
}

async function json<T>(c: LlmCtx, kind: string, system: string, user: string, name: string, schema: Record<string, unknown>): Promise<T> {
  if (!c.key) throw new Error('OpenAI key missing.');
  const client = new OpenAI({ apiKey: c.key, timeout: 90000, maxRetries: 1 });
  const t0 = Date.now();
  const isReasoning = /^(gpt-5|o\d)/.test(c.model);
  try {
    const res = await client.chat.completions.create({
      model: c.model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
      max_completion_tokens: 4000,
      ...(isReasoning ? { reasoning_effort: 'low' as const } : {}),
    });
    const ms = Date.now() - t0;
    const inn = res.usage?.prompt_tokens || 0, out = res.usage?.completion_tokens || 0;
    const price = priceFor(c.model);
    usageLog(c.slug, c.ctx, { p: 'openai', model: c.model, kind, ok: 1, ms, in: inn, out, cost: price ? Math.round(((inn * price[0] + out * price[1]) / 1e6) * 1e6) / 1e6 : null });
    const choice = res.choices[0];
    if (choice?.message?.refusal) throw new Error('GPT declined this request.');
    if (choice?.finish_reason === 'length') throw new Error('GPT: the answer was cut off.');
    const text = typeof choice?.message?.content === 'string' ? choice.message.content : '';
    const parsed = JSON.parse(text) as T;
    if (!parsed || typeof parsed !== 'object') throw new Error('GPT: the structured answer was not an object.');
    return parsed;
  } catch (e) {
    const err = e as Error & { status?: number };
    if (!(err.message || '').startsWith('GPT')) usageLog(c.slug, c.ctx, { p: 'openai', model: c.model, kind, ok: 0, ms: Date.now() - t0, err: err.status === 429 ? 'rate limit or quota reached' : err.message });
    throw new Error(err.status === 429 ? 'GPT: rate limit or quota reached, try again in a minute' : err.message.startsWith('GPT') ? err.message : `GPT: ${err.message}`);
  }
}

const list = (enumv?: string[]) => ({ type: 'array', items: { type: 'string', ...(enumv ? { enum: enumv } : {}) } });

function intentSchema() {
  const props: Record<string, unknown> = {
    kind: { type: 'string', enum: ['people', 'companies'] }, titles: list(), seniorities: list(Object.keys(SENIORITY)), departments: list(DEP_CODES), person_locations: list(), company_locations: list(), exclude_locations: list(), industry_keywords: list(), company_domains: list(), company_name: { type: 'string' }, employee_ranges: list(Object.keys(EMPLOYEE_RANGES)), revenue_min: { type: 'integer' }, revenue_max: { type: 'integer' }, technologies: list(), keywords: { type: 'string' }, summary: { type: 'string' },
  };
  return { type: 'object', properties: props, required: Object.keys(props), additionalProperties: false };
}

function profileContext(p: Profile): string {
  return `The user works for ${p.company || 'the client'}, which sells ${p.sells || '(not described)'} to ${p.sells_to || '(not described)'}.`;
}

export async function parseIntent(c: LlmCtx, profile: Profile, q: string): Promise<Intent> {
  const system = `You turn a sales person's plain-English request for leads into search filters for a B2B contact database. ${profileContext(profile)}

Rules:
- kind: "people" when the request is about buyers, contacts, roles, decision makers or leads; "companies" when it is about firms, manufacturers, suppliers, markets or whole industries with no role mentioned.
- titles: job titles as commonly written ("purchasing manager", "director of supply chain"). Include obvious synonyms (purchasing ↔ procurement ↔ sourcing ↔ buyer). Empty when no role is implied.
- seniorities and departments: only codes from the enums, only when implied.
- person_locations: where the person is; company_locations: where the company is headquartered. Use "City, State" for US cities, "State, US" for US states, or a country name. Put a plain "in Texas" under person_locations for people searches and under company_locations for company searches.
- industry_keywords: short noun phrases describing what the company makes or does.
- employee_ranges: only codes from the enum, covering the size described ("50 to 500 employees" → "51,100", "101,200", "201,500"; "small" → up to 200; "mid-size" → 201 to 2,000; "large" → 2,001 and up).
- revenue_min / revenue_max in whole US dollars, 0 when not mentioned.
- summary: one short sentence restating what will be searched.
Return only the JSON.`;
  const raw = await cached<Partial<Intent>>(c.slug, `intent|${c.model}|${q.trim().toLowerCase()}`, 86400, () => json<Partial<Intent>>(c, 'intent', system, `Request: ${q.trim()}`, 'intent', intentSchema()));
  const i = cleanIntent({ ...blankIntent(), ...raw });
  if (!i.summary) i.summary = intentSummary(i);
  return i;
}

/** Intent: GPT when there is a key and we are live, the rules otherwise; GPT failure falls back to the rules with the error noted. */
export async function askIntent(c: LlmCtx, profile: Profile, q: string, useGpt: boolean): Promise<Intent> {
  if (useGpt && c.key) {
    try {
      return { ...(await parseIntent(c, profile, q)), source: 'gpt' };
    } catch (e) {
      return { ...rulesIntent(q, profile), source: 'rules', error: (e as Error).message };
    }
  }
  return { ...rulesIntent(q, profile), source: 'rules' };
}

export function fitRule(row: Person | Org, intent: Intent, kind: Kind): string {
  const bits: string[] = [];
  if (kind === 'people') {
    const p = row as Person;
    const title = p.title.toLowerCase();
    for (const t of intent.titles) { const w = t.toLowerCase().split(' '); if (title.includes(t.toLowerCase()) || (w.length > 1 && title.includes(w[0]))) { bits.push(`holds a ${t.toLowerCase()} role`); break; } }
    if (!bits.length && title) bits.push(`title "${p.title}" is on the buying side`);
    if (intent.industry_keywords.length && p.company) bits.push(`${p.company} sits in the ${intent.industry_keywords[0]} space you asked for`);
    if (p.has_email) bits.push('work email on file');
  } else {
    const o = row as Org;
    if (intent.industry_keywords.length) bits.push(`${o.industry ? o.industry.charAt(0).toUpperCase() + o.industry.slice(1) + ' company' : 'Company'} in the ${intent.industry_keywords[0]} market`);
    if (o.employees) bits.push(`${o.employees.toLocaleString()} employees`);
    const hq = [o.city, o.state, o.country === 'United States' ? 'US' : o.country].filter(Boolean).join(', ');
    if (hq) bits.push(`headquartered in ${hq}`);
    if (o.revenue) bits.push(`$${o.revenue} revenue`);
  }
  if (!bits.length) return 'Matches the filters of your request; verify the fit before reaching out.';
  const s = bits.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

export async function fitLines(c: LlmCtx, profile: Profile, rows: (Person | Org)[], intent: Intent, kind: Kind, useGpt: boolean): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const r of rows) out[r.id] = fitRule(r, intent, kind);
  if (!useGpt || !c.key || !rows.length) return out;
  const facts = rows.map((r) => kind === 'people' ? { id: r.id, title: (r as Person).title, company: (r as Person).company, has_email: (r as Person).has_email } : { id: r.id, name: (r as Org).name, industry: (r as Org).industry, employees: (r as Org).employees, hq: [(r as Org).city, (r as Org).state, (r as Org).country].filter(Boolean).join(', '), revenue: (r as Org).revenue, founded: (r as Org).founded, description: (r as Org).description.slice(0, 200) });
  const schema = { type: 'object', properties: { fits: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, fit: { type: 'string' } }, required: ['id', 'fit'], additionalProperties: false } } }, required: ['fits'], additionalProperties: false };
  const system = `You write one short line per lead explaining why it fits the sales person's request. ${profileContext(profile)} Use only the facts given for the lead; never invent details. At most 22 words per line, plain language, no exclamation marks. When the facts are thin, say what matches and what to verify.`;
  try {
    const j = await cached<{ fits: { id: string; fit: string }[] }>(c.slug, `fit|${c.model}|${intent.summary}|${JSON.stringify(facts)}`, 86400, () => json(c, 'fits', system, `Request: ${intent.summary}\n\nLeads (JSON):\n${JSON.stringify(facts)}`, 'fits', schema));
    for (const f of j.fits || []) if (out[f.id] !== undefined && f.fit?.trim()) out[f.id] = f.fit.trim();
  } catch {
    // the templated lines stay
  }
  return out;
}

/** Draft a client profile from the text of their website (admin panel: "Draft from website"). */
export async function draftProfile(c: LlmCtx, siteText: string, url: string): Promise<Profile> {
  const schema = {
    type: 'object',
    properties: {
      company: { type: 'string' }, sells: { type: 'string' }, sells_to: { type: 'string' },
      industries: list(), roles: list(), default_titles: list(),
      angles: { type: 'array', items: { type: 'object', properties: { match: { type: 'string' }, what: { type: 'string' }, why: { type: 'string' } }, required: ['match', 'what', 'why'], additionalProperties: false } },
      templates: { type: 'array', items: { type: 'object', properties: { group: { type: 'string' }, requests: list() }, required: ['group', 'requests'], additionalProperties: false } },
    },
    required: ['company', 'sells', 'sells_to', 'industries', 'roles', 'default_titles', 'angles', 'templates'],
    additionalProperties: false,
  };
  const system = `You read a company's website and write the profile a lead-research tool needs to find that company's buyers.
- company: the company name.
- sells: one sentence, what they sell and how (products, services, where from).
- sells_to: one sentence, who buys it: the kinds of organisations and the job roles that decide.
- industries: 10 to 20 short industry keywords of the buyers' companies (e.g. "hotels", "landscape architecture", "commercial real estate"), as a database would tag them.
- roles: 4 to 6 short role buckets for contacts (e.g. "Purchasing", "Operations", "Design", "Executive", "Other"); always end with "Other".
- default_titles: 8 to 14 job-title keywords of the people who buy (e.g. "purchasing manager", "landscape architect", "general manager").
- angles: 3 to 5 entries. match: a lowercase regex of industry words that pick the angle (last one "." as catch-all). what: what this company would offer that buyer, in 8 to 14 words. why: one sentence on why the buyer should care.
- templates: 4 to 6 groups named after buyer niches, each with 2 or 3 plain-English lead requests like "Purchasing managers at hotel groups in Florida with 200 to 2,000 employees". Mention titles, industry, a US state or country, and sometimes a size or revenue.
Return only the JSON.`;
  const j = await json<Profile & { templates: { group: string; requests: string[] }[] }>(c, 'profile', system, `Website: ${url}\n\nPage text:\n${siteText.slice(0, 24000)}`, 'profile', schema);
  const templates: Record<string, string[]> = {};
  for (const t of j.templates || []) if (t.group && t.requests?.length) templates[t.group] = t.requests.slice(0, 3);
  return { company: j.company || '', sells: j.sells || '', sells_to: j.sells_to || '', industries: (j.industries || []).slice(0, 20), roles: j.roles?.length ? j.roles : ['Purchasing', 'Operations', 'Executive', 'Other'], angles: (j.angles || []).slice(0, 5), templates, default_titles: (j.default_titles || []).slice(0, 14) };
}

/** Plain text of a website's main pages, for draftProfile (best effort, 25 KB cap). */
export async function siteText(url: string): Promise<string> {
  const base = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const u = new URL(base);
  const pages = [u.href, new URL('/about', u).href, new URL('/about-us', u).href, new URL('/products', u).href, new URL('/services', u).href];
  let out = '';
  for (const p of pages) {
    if (out.length > 25000) break;
    try {
      const res = await fetch(p, { signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; ProspectIQ/1.0)' }, redirect: 'follow' });
      if (!res.ok) continue;
      const html = await res.text();
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
      if (text.length > 200) out += `\n\n[${p}]\n${text.slice(0, 9000)}`;
    } catch {
      // skip
    }
  }
  if (out.length < 200) throw new Error('Could not read enough text from that website.');
  return out;
}
