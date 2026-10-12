import { DEP_CODES, EMPLOYEE_RANGES, SENIORITY } from './apollo.js';
import type { Filters, Intent, Profile } from './types.js';

/**
 * The rule-based request parser: used when a client has no GPT key, in
 * sample mode, or as the fallback when GPT fails. Vocabulary = a base list
 * plus the client's profile (industries, default titles).
 */

export function blankIntent(): Intent {
  return { kind: 'people', titles: [], seniorities: [], departments: [], person_locations: [], company_locations: [], exclude_locations: [], industry_keywords: [], company_domains: [], company_name: '', employee_ranges: [], revenue_min: 0, revenue_max: 0, technologies: [], keywords: '', summary: '' };
}

const TITLES = ['purchasing manager', 'purchasing director', 'procurement manager', 'procurement director', 'sourcing manager', 'strategic sourcing', 'senior buyer', 'buyer', 'supply chain manager', 'supply chain director', 'vp supply chain', 'vice president of supply chain', 'materials manager', 'logistics manager', 'plant manager', 'operations manager', 'director of operations', 'vp operations', 'vice president of operations', 'coo', 'chief operating officer', 'ceo', 'chief executive officer', 'president', 'owner', 'founder', 'general manager', 'engineering manager', 'quality manager', 'maintenance manager', 'production manager', 'commodity manager', 'category manager', 'facilities manager', 'landscape architect', 'interior designer', 'project manager', 'marketing manager', 'marketing director', 'sales manager', 'sales director', 'hotel manager', 'general contractor', 'architect', 'designer', 'property manager'];
const INDUSTRIES = ['industrial valves', 'valves', 'pumps', 'flow control', 'actuators', 'castings', 'foundry', 'forgings', 'machining', 'metal fabrication', 'steel', 'oil and gas', 'water treatment', 'hvac', 'electrical equipment', 'electrical', 'conduit', 'fittings', 'wire and cable', 'automotive parts', 'automotive', 'aerospace', 'packaging machinery', 'packaging', 'material handling', 'mining equipment', 'mining', 'agricultural equipment', 'medical devices', 'industrial automation', 'automation', 'plastics', 'hydraulics', 'compressors', 'instrumentation', 'utilities', 'construction equipment', 'marine', 'hotels', 'hospitality', 'restaurants', 'resorts', 'outdoor furniture', 'landscape architecture', 'commercial real estate', 'property management', 'furniture', 'retail', 'software', 'logistics'];
const STATES = ['alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming'];
const COUNTRIES: Record<string, string> = { 'united states': 'United States', usa: 'United States', 'u.s.': 'United States', us: 'United States', america: 'United States', mexico: 'Mexico', canada: 'Canada', colombia: 'Colombia', panama: 'Panama', 'costa rica': 'Costa Rica', guatemala: 'Guatemala', 'dominican republic': 'Dominican Republic', chile: 'Chile', peru: 'Peru', brazil: 'Brazil', argentina: 'Argentina', germany: 'Germany', 'united kingdom': 'United Kingdom', uk: 'United Kingdom', spain: 'Spain', italy: 'Italy', india: 'India', china: 'China', taiwan: 'Taiwan', japan: 'Japan', australia: 'Australia', 'the midwest': 'United States', midwest: 'United States' };
const ALIASES: Record<string, string> = { foundries: 'foundry', valve: 'industrial valves', valves: 'industrial valves', pump: 'pumps', casting: 'castings', forging: 'forgings', fitting: 'fittings', 'medical device': 'medical devices', 'oil & gas': 'oil and gas', hotel: 'hotels', resort: 'resorts', restaurant: 'restaurants' };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function rulesIntent(q: string, profile?: Profile): Intent {
  const i = blankIntent();
  const lc = ' ' + q.toLowerCase().replace(/\s+/g, ' ').trim() + ' ';
  const has = (needle: string) => new RegExp(`(?<![a-z])${esc(needle)}(?![a-z])`).test(lc);
  const add = (arr: string[], v: string) => { if (!arr.some((x) => x.toLowerCase() === v.toLowerCase())) arr.push(v); };

  const titles = [...TITLES, ...(profile?.default_titles || []).map((t) => t.toLowerCase()).filter((t) => t.includes(' '))];
  for (const t of titles) if (has(t) || has(t + 's')) add(i.titles, t);
  const m1 = lc.match(/supply chain [a-z ]*?(manager|director)/);
  if (m1) add(i.titles, 'supply chain ' + m1[1]);
  if (has('purchasing') && /purchasing (?:and|&|or) [a-z ]*?manager/.test(lc)) add(i.titles, 'purchasing manager');
  for (const [phrase, t] of Object.entries({ buyers: 'buyer', 'purchasing people': 'purchasing manager', 'procurement people': 'procurement manager', 'plant managers': 'plant manager', 'operations leaders': 'director of operations' })) if (has(phrase)) add(i.titles, t);

  for (const [w, code] of Object.entries({ owner: 'owner', owners: 'owner', founder: 'founder', founders: 'founder', ceo: 'c_suite', cfo: 'c_suite', coo: 'c_suite', 'c-suite': 'c_suite', 'c suite': 'c_suite', executives: 'c_suite', executive: 'c_suite', vp: 'vp', vps: 'vp', 'vice president': 'vp', 'head of': 'head', 'heads of': 'head', director: 'director', directors: 'director', manager: 'manager', managers: 'manager' })) if (has(w)) add(i.seniorities, code);
  if (has('decision makers') || has('leaders')) for (const c of ['c_suite', 'vp', 'head', 'director']) add(i.seniorities, c);

  for (const [w, code] of Object.entries({ 'supply chain': 'supply_chain', logistics: 'logistics', quality: 'quality_management', operations: 'master_operations', engineering: 'master_engineering_technical', finance: 'master_finance', sales: 'master_sales', marketing: 'master_marketing' })) if (has(w)) add(i.departments, code);

  const inds = [...INDUSTRIES, ...(profile?.industries || []).map((x) => x.toLowerCase())];
  for (const k of inds) if (has(k) || has(k.replace(/s$/, '')) || has(k + 's')) add(i.industry_keywords, k);
  for (const [w, k] of Object.entries(ALIASES)) if (has(w)) add(i.industry_keywords, k);
  const mm = lc.matchAll(/\b([a-z]+) (?:makers|manufacturers|producers|companies|suppliers|oems)\b/g);
  for (const m of mm) {
    const w = m[1];
    const map: Record<string, string> = { valve: 'industrial valves', pump: 'pumps', casting: 'castings', electrical: 'electrical', packaging: 'packaging', automotive: 'automotive', aerospace: 'aerospace', medical: 'medical devices', mining: 'mining', steel: 'steel', plastics: 'plastics', furniture: 'furniture', hotel: 'hotels', software: 'software' };
    if (map[w]) add(i.industry_keywords, map[w]);
  }
  if (i.industry_keywords.includes('industrial valves')) i.industry_keywords = i.industry_keywords.filter((k) => k !== 'valves');

  const locs: string[] = [];
  for (const st of STATES) if (has(st)) locs.push(st.replace(/\b\w/g, (c) => c.toUpperCase()) + ', US');
  for (const [w, name] of Object.entries(COUNTRIES)) if (has(w) && !locs.includes(name)) locs.push(name);
  for (const m of q.matchAll(/\b(?:in|from|around|near) ([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)?)/g)) {
    const city = m[1], cl = city.toLowerCase();
    if (!STATES.includes(cl) && !COUNTRIES[cl] && !['us', 'usa'].includes(cl)) locs.push(city);
  }

  const ranges = Object.keys(EMPLOYEE_RANGES);
  const bounds = (code: string) => code.split(',').map(Number) as [number, number];
  let m;
  if ((m = lc.match(/(\d[\d,]*)\s*(?:to|-|–|and)\s*(\d[\d,]*)\s*(?:employees|people|staff|headcount)/))) {
    const lo = Number(m[1].replace(/,/g, '')), hi = Number(m[2].replace(/,/g, ''));
    i.employee_ranges = ranges.filter((c) => { const [a, b] = bounds(c); return b >= lo && a <= hi; });
  } else if ((m = lc.match(/(\d[\d,]*)\s*\+\s*(?:employees|people|staff)|(?:over|more than|above|at least)\s*(\d[\d,]*)\s*(?:employees|people|staff)/))) {
    const lo = Number((m[1] || m[2]).replace(/,/g, ''));
    i.employee_ranges = ranges.filter((c) => bounds(c)[1] > lo);
  } else if ((m = lc.match(/(?:under|less than|below|up to)\s*(\d[\d,]*)\s*(?:employees|people|staff)/))) {
    const hi = Number(m[1].replace(/,/g, ''));
    i.employee_ranges = ranges.filter((c) => bounds(c)[0] <= hi);
  } else if (has('small')) i.employee_ranges = ['1,10', '11,20', '21,50', '51,100', '101,200'];
  else if (has('mid-size') || has('midsize') || has('medium')) i.employee_ranges = ['201,500', '501,1000', '1001,2000'];
  else if (has('large') || has('enterprise')) i.employee_ranges = ['2001,5000', '5001,10000', '10001,1000000'];

  const money = (s: string) => { const mm2 = s.match(/\$?\s*(\d+(?:\.\d+)?)\s*(m|million|b|billion|k)?/i); if (!mm2) return 0; const n = Number(mm2[1]); const u = (mm2[2] || '').toLowerCase(); return Math.round(n * (u === 'b' || u === 'billion' ? 1e9 : u === 'm' || u === 'million' ? 1e6 : u === 'k' ? 1e3 : 1)); };
  if ((m = q.match(/(\$\s*[\d.]+\s*(?:m|b|k|million|billion)?)\s*(?:to|-|–|and)\s*(\$?\s*[\d.]+\s*(?:m|b|k|million|billion)?)\s*(?:in )?(?:revenue|sales|turnover)/i))) { i.revenue_min = money(m[1]); i.revenue_max = money(m[2]); }
  else if ((m = q.match(/(?:over|above|more than|at least)\s*(\$\s*[\d.]+\s*(?:m|b|k|million|billion)?)\s*(?:in )?(?:revenue|sales)/i))) i.revenue_min = money(m[1]);
  else if ((m = q.match(/(?:under|below|less than)\s*(\$\s*[\d.]+\s*(?:m|b|k|million|billion)?)\s*(?:in )?(?:revenue|sales)/i))) i.revenue_max = money(m[1]);

  const roleWords = i.titles.length > 0 || i.seniorities.length > 0 || has('people') || has('contacts') || has('buyers') || has('leads') || has('decision makers') || has('who ');
  const firmWords = has('companies') || has('company') || has('manufacturers') || has('makers') || has('firms') || has('suppliers') || has('oems') || has('industry') || has('industries') || has('market') || has('foundries') || has('dealers') || has('distributors');
  i.kind = firmWords && !roleWords ? 'companies' : 'people';
  if (i.kind === 'companies') { i.company_locations = locs; i.departments = []; } else i.person_locations = locs;
  if (!i.titles.length && !i.industry_keywords.length && !locs.length && !i.seniorities.length && !i.employee_ranges.length) i.keywords = q.trim();
  i.titles = i.titles.filter((t) => !i.titles.some((o) => o !== t && o.includes(t)));
  i.summary = intentSummary(i);
  return cleanIntent(i);
}

export function cleanIntent(raw: Partial<Intent>): Intent {
  const i = { ...blankIntent(), ...raw };
  const list = (v: unknown, allowed?: string[], cap = 20) => { const out: string[] = []; for (const x of Array.isArray(v) ? v : []) { const s = String(x).trim(); if (!s || (allowed && !allowed.includes(s)) || out.some((o) => o.toLowerCase() === s.toLowerCase())) continue; out.push(s); } return out.slice(0, cap); };
  i.kind = i.kind === 'companies' ? 'companies' : 'people';
  i.titles = list(i.titles); i.titles = i.titles.filter((t) => !i.titles.some((o) => o !== t && o.includes(t))); i.seniorities = list(i.seniorities, Object.keys(SENIORITY)); i.departments = list(i.departments, DEP_CODES);
  i.person_locations = list(i.person_locations); i.company_locations = list(i.company_locations); i.exclude_locations = list(i.exclude_locations);
  i.industry_keywords = list(i.industry_keywords); i.company_domains = list(i.company_domains).map(normDomain).filter(Boolean);
  i.company_name = String(i.company_name || '').trim(); i.employee_ranges = list(i.employee_ranges, Object.keys(EMPLOYEE_RANGES));
  i.revenue_min = Math.max(0, Number(i.revenue_min || 0)); i.revenue_max = Math.max(0, Number(i.revenue_max || 0));
  i.technologies = list(i.technologies); i.keywords = String(i.keywords || '').trim(); i.summary = String(i.summary || '').trim();
  return i;
}

export function normDomain(d: string): string {
  return String(d).trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '').toLowerCase();
}

export function intentSummary(i: Intent): string {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (i.keywords && !i.titles.length && !i.industry_keywords.length) return `${cap(i.kind)} matching "${i.keywords}"`;
  const who = i.titles.length ? i.titles.slice(0, 3).map(cap).join(', ') : i.kind === 'companies' ? 'Companies' : 'People';
  const sen = i.seniorities.length && !i.titles.length ? ` (${i.seniorities.map((s) => SENIORITY[s] || s).join('/')})` : '';
  const ind = i.industry_keywords.length ? ` in ${i.industry_keywords.slice(0, 3).join(', ')}` : '';
  const locs = [...i.person_locations, ...i.company_locations];
  const where = locs.length ? ` · ${locs.slice(0, 3).join(', ')}` : '';
  let size = '';
  if (i.employee_ranges.length) { const a = i.employee_ranges[0].split(','); const b = i.employee_ranges[i.employee_ranges.length - 1].split(','); size = ` · ${Number(a[0]).toLocaleString()}${Number(b[1]) >= 1000000 ? '+' : '–' + Number(b[1]).toLocaleString()} employees`; }
  let rev = '';
  if (i.revenue_min || i.revenue_max) rev = ` · revenue ${i.revenue_min ? money(i.revenue_min) : ''}${i.revenue_min && i.revenue_max ? '–' : i.revenue_max ? 'up to ' : '+'}${i.revenue_max ? money(i.revenue_max) : ''}`;
  return `${who}${sen}${ind}${where}${size}${rev}`;
}

export function money(n: number): string {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e4) return '$' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return '$' + Math.round(n).toLocaleString();
}

export function emptyFilters(): Filters {
  return { titles: [], similar: true, not_titles: [], name: '', kw: '', sen: [], dep: [], ploc: [], pnot: [], oloc: [], onot: [], domains: [], okw: [], oname: '', size: [], rev_min: '', rev_max: '', tech: [], fund: [], founded_min: '', founded_max: '', email: [], oids: [] };
}

export function intentFilters(i: Intent): Filters {
  return { ...emptyFilters(), titles: i.titles, kw: i.keywords, sen: i.seniorities, dep: i.departments, ploc: i.person_locations, oloc: i.company_locations, onot: i.exclude_locations, domains: i.company_domains, okw: i.industry_keywords, oname: i.company_name, size: i.employee_ranges, rev_min: i.revenue_min ? String(i.revenue_min) : '', rev_max: i.revenue_max ? String(i.revenue_max) : '', tech: i.technologies };
}

/** Filters from an untrusted body (the People / Companies tabs post these). */
export function cleanFilters(raw: Partial<Record<keyof Filters, unknown>>): Filters {
  const f = emptyFilters();
  const list = (v: unknown, allowed?: string[], cap = 30) => { const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split('|') : []; const out: string[] = []; for (const x of arr) { const s = String(x).trim().slice(0, 80); if (!s || (allowed && !allowed.includes(s)) || out.some((o) => o.toLowerCase() === s.toLowerCase())) continue; out.push(s); } return out.slice(0, cap); };
  const num = (v: unknown) => { const s = String(v ?? '').replace(/[^0-9]/g, ''); return s && s !== '0' ? String(Number(s)) : ''; };
  f.titles = list(raw.titles); f.similar = raw.similar !== false && raw.similar !== 'false' && raw.similar !== '0'; f.not_titles = list(raw.not_titles);
  f.name = String(raw.name ?? '').trim().slice(0, 80); f.kw = String(raw.kw ?? '').trim().slice(0, 120);
  f.sen = list(raw.sen, Object.keys(SENIORITY)); f.dep = list(raw.dep, DEP_CODES); f.ploc = list(raw.ploc); f.pnot = list(raw.pnot); f.oloc = list(raw.oloc); f.onot = list(raw.onot);
  f.domains = list(raw.domains).map(normDomain).filter(Boolean); f.okw = list(raw.okw); f.oname = String(raw.oname ?? '').trim().slice(0, 80);
  f.size = list(raw.size, Object.keys(EMPLOYEE_RANGES)); f.rev_min = num(raw.rev_min); f.rev_max = num(raw.rev_max); f.tech = list(raw.tech); f.fund = list(raw.fund, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13']);
  f.founded_min = num(raw.founded_min); f.founded_max = num(raw.founded_max); f.email = list(raw.email, ['verified', 'likely to engage', 'unverified', 'unavailable']);
  f.oids = list(raw.oids, undefined, 100).filter((v) => /^[a-z0-9]{1,32}$/i.test(v));
  return f;
}

export function filtersActive(f: Filters): boolean {
  return (Object.keys(f) as (keyof Filters)[]).some((k) => k !== 'similar' && (Array.isArray(f[k]) ? (f[k] as string[]).length > 0 : !!f[k]));
}
