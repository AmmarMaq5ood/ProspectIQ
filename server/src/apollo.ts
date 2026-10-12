import { cached } from './store.js';
import { usageLog } from './usage.js';
import type { Filters, Org, Person, SearchResult } from './types.js';

/**
 * Research-database client (Apollo.io behind the scenes; never named in the
 * UI). Credit-free people and company searches with the full filter set,
 * bulk company enrichment, and per-person lookup on push (one credit when an
 * email or phone comes back). Verified against the live API on 8 Oct 2026.
 */

const BASE = 'https://api.apollo.io/api/v1';

export const SENIORITY: Record<string, string> = { owner: 'Owner', founder: 'Founder', c_suite: 'C-suite', partner: 'Partner', vp: 'VP', head: 'Head', director: 'Director', manager: 'Manager', senior: 'Senior', entry: 'Entry', intern: 'Intern' };

export const DEPARTMENTS: Record<string, Record<string, string>> = {
  Operations: { master_operations: 'All operations', operations: 'Operations', supply_chain: 'Supply chain', logistics: 'Logistics', quality_management: 'Quality management', safety: 'Safety', project_development: 'Project development', office_operations: 'Office operations', physical_security: 'Physical security', real_estate: 'Real estate', operations_executive: 'Operations executives' },
  Engineering: { master_engineering_technical: 'All engineering & technical', engineering_technical: 'Engineering', industrial_engineering: 'Industrial engineering', quality_assurance: 'Quality assurance', product_management: 'Product management' },
  Leadership: { c_suite: 'C-suite', executive: 'Executives', founder: 'Founders' },
  Finance: { master_finance: 'All finance', finance: 'Finance', accounting: 'Accounting', finance_executive: 'Finance executives' },
  Sales: { master_sales: 'All sales', sales: 'Sales', business_development: 'Business development', account_management: 'Account management', inside_sales: 'Inside sales', customer_success: 'Customer success', sales_executive: 'Sales executives' },
  Other: { master_marketing: 'Marketing', master_information_technology: 'IT', master_human_resources: 'Human resources', master_legal: 'Legal' },
};
export const DEP_CODES = Object.values(DEPARTMENTS).flatMap((g) => Object.keys(g));

export const EMPLOYEE_RANGES: Record<string, string> = { '1,10': '1–10', '11,20': '11–20', '21,50': '21–50', '51,100': '51–100', '101,200': '101–200', '201,500': '201–500', '501,1000': '501–1,000', '1001,2000': '1,001–2,000', '2001,5000': '2,001–5,000', '5001,10000': '5,001–10,000', '10001,1000000': '10,001+' };
export const EMAIL_STATUS: Record<string, string> = { verified: 'Verified', 'likely to engage': 'Likely to engage', unverified: 'Unverified', unavailable: 'Unavailable' };
export const FUNDING: Record<string, string> = { '0': 'Seed', '1': 'Angel', '2': 'Venture (round not specified)', '3': 'Series A', '4': 'Series B', '5': 'Series C', '6': 'Series D', '7': 'Series E', '8': 'Series F', '9': 'Debt financing', '10': 'Equity crowdfunding', '11': 'Convertible note', '12': 'Private equity', '13': 'Other' };
export const PER_PAGE = [10, 25, 50, 100];

export interface ApolloCtx { slug: string; key: string; ctx: string }

export class ApolloError extends Error {}

async function call(a: ApolloCtx, method: 'GET' | 'POST', ep: string, body: Record<string, unknown> = {}): Promise<Record<string, any>> {
  if (!a.key) throw new ApolloError('Research key missing: add one for this client or the agency.');
  const quiet = ep === '/usage_stats/api_usage_stats';
  const url = method === 'GET' ? `${BASE}${ep}?${new URLSearchParams(body as Record<string, string>)}` : `${BASE}${ep}`;
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { 'x-api-key': a.key, accept: 'application/json', 'content-type': 'application/json', 'cache-control': 'no-cache' }, body: method === 'POST' ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(40000) });
  } catch (e) {
    if (!quiet) usageLog(a.slug, a.ctx, { p: 'apollo', ep, ok: 0, ms: Date.now() - t0, err: String(e) });
    throw new ApolloError(`Research service ${ep}: ${(e as Error).message}`);
  }
  const ms = Date.now() - t0;
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) {
    let msg = json?.error_details?.message || json?.error || json?.message || `HTTP ${res.status}`;
    if (res.status === 429) msg = 'rate limit reached, try again in a minute';
    if (!quiet) usageLog(a.slug, a.ctx, { p: 'apollo', ep, ok: 0, ms, err: String(msg) });
    throw new ApolloError(`Research service ${ep}: ${msg}`);
  }
  if (!quiet) {
    let credit = 0;
    if (ep === '/people/match') {
      const pe = json.person || {};
      const em = String(pe.email || '');
      if ((em && !em.includes('email_not_unlocked')) || (Array.isArray(pe.phone_numbers) && pe.phone_numbers.length)) credit = 1;
    }
    const n = Array.isArray(json.people) ? json.people.length : Array.isArray(json.organizations) ? json.organizations.length : json.organization || json.person ? 1 : 0;
    usageLog(a.slug, a.ctx, { p: 'apollo', ep, ok: 1, ms, n, credit });
  }
  return json;
}

export function orgShape(o: Record<string, any>, domain = ''): Org {
  return {
    id: String(o.id || ''),
    name: String(o.name || ''),
    domain: String(o.primary_domain || domain),
    website: String(o.website_url || (domain ? `https://${domain}` : '')),
    industry: String(o.industry || ''),
    industries: (o.industries || []).map(String),
    employees: Number(o.estimated_num_employees || 0),
    city: String(o.city || ''),
    state: String(o.state || ''),
    country: String(o.country || ''),
    phone: String(o.phone || o.primary_phone?.number || ''),
    linkedin: String(o.linkedin_url || ''),
    logo: String(o.logo_url || ''),
    founded: Number(o.founded_year || 0),
    revenue: String(o.organization_revenue_printed || o.annual_revenue_printed || ''),
    revenue_n: Number(o.organization_revenue || o.annual_revenue || 0),
    growth12: o.organization_headcount_twelve_month_growth != null ? Number(o.organization_headcount_twelve_month_growth) : null,
    sic: (o.sic_codes || []).map(String),
    naics: (o.naics_codes || []).map(String),
    description: String(o.short_description || ''),
    keywords: (o.keywords || []).slice(0, 12).map(String),
    enriched: o.estimated_num_employees != null || o.industry != null || o.short_description != null,
  };
}

export function personShape(p: Record<string, any>): Person {
  const last = String(p.last_name || '');
  const obf = !last && p.last_name_obfuscated != null;
  const email = String(p.email || '');
  const org = p.organization || {};
  return {
    id: String(p.id || ''),
    first: String(p.first_name || ''),
    last: obf ? String(p.last_name_obfuscated) : last,
    last_obf: obf,
    title: String(p.title || ''),
    seniority: String(p.seniority || ''),
    linkedin: String(p.linkedin_url || ''),
    email: email && !email.includes('email_not_unlocked') ? email : '',
    has_email: !!p.has_email || !!email,
    has_phone: !!p.has_direct_phone,
    city: [p.city, p.state].filter(Boolean).join(', '),
    has_city: !!p.has_city || !!p.city,
    company: String(org.name || ''),
    company_id: String(org.id || ''),
    domain: String(org.primary_domain || ''),
    departments: (p.departments || []).map(String),
  };
}

export function companyBody(f: Filters): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  if (f.oname) b.q_organization_name = f.oname;
  if (f.okw.length) b.q_organization_keyword_tags = f.okw;
  if (f.oloc.length) b.organization_locations = f.oloc;
  if (f.onot.length) b.organization_not_locations = f.onot;
  if (f.size.length) b.organization_num_employees_ranges = f.size;
  if (f.rev_min || f.rev_max) b.revenue_range = { ...(f.rev_min ? { min: Number(f.rev_min) } : {}), ...(f.rev_max ? { max: Number(f.rev_max) } : {}) };
  if (f.tech.length) b.currently_using_any_of_technology_uids = f.tech.map((t) => t.trim().toLowerCase().replace(/\s+/g, '_'));
  if (f.fund.length) b.organization_latest_funding_stage_cd = f.fund;
  if (f.founded_min || f.founded_max) b.organization_founded_year_range = { ...(f.founded_min ? { min: Number(f.founded_min) } : {}), ...(f.founded_max ? { max: Number(f.founded_max) } : {}) };
  if (f.oids.length) b.organization_ids = f.oids;
  return b;
}

export function peopleBody(f: Filters): Record<string, unknown> {
  const b = companyBody(f);
  if (f.titles.length) { b.person_titles = f.titles; b.include_similar_titles = !!f.similar; }
  if (f.not_titles.length) b.person_not_titles = f.not_titles;
  if (f.name) b.q_person_name = f.name;
  if (f.kw) b.q_keywords = f.kw;
  if (f.sen.length) b.person_seniorities = f.sen;
  if (f.dep.length) b.person_department_or_subdepartments = f.dep;
  if (f.ploc.length) b.person_locations = f.ploc;
  if (f.pnot.length) b.person_not_locations = f.pnot;
  if (f.domains.length) b.q_organization_domains_list = f.domains;
  if (f.email.length) b.contact_email_status = f.email;
  return b;
}

export async function searchPeople(a: ApolloCtx, f: Filters, page = 1, perPage = 25): Promise<SearchResult<Person>> {
  const r = await call(a, 'POST', '/mixed_people/api_search', { ...peopleBody(f), page: Math.max(1, page), per_page: Math.max(1, Math.min(100, perPage)) });
  const rows = (r.people || []).map(personShape);
  const total = Number(r.total_entries ?? r.pagination?.total_entries ?? rows.length);
  return { rows, total, page, per_page: perPage, pages: Math.max(1, Math.ceil(total / Math.max(1, perPage))) };
}

export async function searchCompanies(a: ApolloCtx, f: Filters, page = 1, perPage = 25, enrich = true): Promise<SearchResult<Org>> {
  const r = await call(a, 'POST', '/mixed_companies/search', { ...companyBody(f), page: Math.max(1, page), per_page: Math.max(1, Math.min(100, perPage)) });
  const rows: Org[] = (r.organizations || []).map((o: Record<string, any>) => orgShape(o));
  if (enrich && rows.length) {
    const facts = await bulkOrgs(a, rows.map((c) => c.domain));
    for (const c of rows) {
      const x = facts[c.domain];
      if (!x) continue;
      for (const k of ['industry', 'industries', 'employees', 'city', 'state', 'country', 'description', 'keywords'] as const) {
        const v = x[k];
        if (v && (!Array.isArray(v) || v.length)) (c as any)[k] = v;
      }
      c.enriched = true;
      if (!c.revenue && x.revenue) { c.revenue = x.revenue; c.revenue_n = x.revenue_n; }
    }
  }
  const total = Number(r.pagination?.total_entries ?? rows.length);
  return { rows, total, page, per_page: perPage, pages: Math.max(1, Number(r.pagination?.total_pages ?? Math.ceil(total / Math.max(1, perPage)))) };
}

export async function orgByDomain(a: ApolloCtx, domain: string): Promise<Org> {
  const r = await call(a, 'GET', '/organizations/enrich', { domain });
  return orgShape(r.organization || {}, domain);
}

/** Industry, size, HQ and description for several domains: 10 a call, cached a week per domain. */
export async function bulkOrgs(a: ApolloCtx, domains: string[]): Promise<Record<string, Org>> {
  const uniq = [...new Set(domains.filter(Boolean))];
  const out: Record<string, Org> = {};
  const need: string[] = [];
  for (const d of uniq) {
    const hit = await cached<Org | null>(a.slug, `org|${d.toLowerCase()}`, 7 * 86400, async () => null);
    if (hit) out[d] = hit; else need.push(d);
  }
  for (let i = 0; i < need.length; i += 10) {
    const chunk = need.slice(i, i + 10);
    const r = await call(a, 'POST', '/organizations/bulk_enrich', { domains: chunk });
    (r.organizations || []).forEach((o: Record<string, any> | null, idx: number) => {
      if (!o) return;
      const shape = orgShape(o, String(o.primary_domain || chunk[idx] || ''));
      const key = chunk.find((d) => d.toLowerCase() === shape.domain.toLowerCase() || (shape.website && shape.website.toLowerCase().includes(d.toLowerCase()))) || chunk[idx] || shape.domain;
      out[key] = shape;
      void cached(a.slug, `org|${key.toLowerCase()}`, 7 * 86400, async () => shape).catch(() => undefined);
    });
  }
  return out;
}

/** Full name, LinkedIn, email and the company facts for one person. A credit when an email or phone comes back. */
export async function enrichPerson(a: ApolloCtx, p: Person, domain: string): Promise<Person> {
  const body: Record<string, unknown> = { reveal_personal_emails: false };
  if (p.id && !p.id.startsWith('sp')) body.id = p.id; else { body.first_name = p.first; body.last_name = p.last; body.domain = domain; }
  const r = await call(a, 'POST', '/people/match', body);
  const m = r.person;
  if (!m) return p;
  const email = String(m.email || '');
  const out: Person = { ...p, first: String(m.first_name || p.first), last: String(m.last_name || p.last), last_obf: false, title: String(m.title || p.title), seniority: String(m.seniority || p.seniority), linkedin: String(m.linkedin_url || p.linkedin), email: email && !email.includes('email_not_unlocked') ? email : p.email, city: [m.city, m.state].filter(Boolean).join(', ') };
  if (m.organization && typeof m.organization === 'object') {
    const org = orgShape(m.organization, domain);
    out.org = org;
    out.company = org.name || p.company;
    out.domain = org.domain || p.domain || domain;
  }
  return out;
}

/** The service's own per-endpoint limits for today (cached 5 minutes). */
export async function planLimits(a: ApolloCtx): Promise<{ label: string; day?: any; hour?: any; minute?: any }[]> {
  return cached(a.slug, 'plan-limits', 300, async () => {
    const want: Record<string, string> = { '["api/v1/mixed_people", "api_search"]': 'People search', '["api/v1/mixed_companies", "search"]': 'Company search', '["api/v1/organizations", "enrich"]': 'Company lookup', '["api/v1/organizations", "bulk_enrich"]': 'Company lookup (bulk)', '["api/v1/people", "match"]': 'Person lookup' };
    const r = await call(a, 'POST', '/usage_stats/api_usage_stats', {});
    return Object.entries(want).filter(([k]) => r[k]).map(([k, label]) => ({ label, day: r[k].day, hour: r[k].hour, minute: r[k].minute }));
  });
}
