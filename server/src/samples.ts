import type { Filters, Org, Person, SearchResult } from './types.js';

/** Deterministic canned results for demo mode (no research key) and tests. */

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const seedOf = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

const NAMES = ['Gulf Flow Systems', 'Northline Pumps', 'Lakeshore Castings', 'Meridian Equipment', 'Keystone Automation', 'Vertex Energy Products', 'Brightwater Utilities', 'Summit Medical Devices', 'Delta Packaging Machinery', 'Harbor Transport Equipment', 'Sierra Water Co.', 'Bayfront Electrical', 'Andes Power Group', 'Pacific Valve Works', 'Redstone Foundry', 'Cascade Actuators', 'Ironbridge Fittings', 'Prairie Agri-Equipment', 'Bluegrass Hydraulics', 'Tidewater Marine Pumps', 'Granite Peak Mining Supply', 'Cobalt Aerospace Components', 'Evergreen HVAC Systems', 'Copperline Conduit', 'Maple Automation'];
const INDS = ['machinery', 'industrial automation', 'oil & energy', 'electrical equipment', 'medical devices', 'packaging', 'mining & metals', 'utilities'];
const CITIES: [string, string][] = [['Houston', 'Texas'], ['Minneapolis', 'Minnesota'], ['Cleveland', 'Ohio'], ['Charlotte', 'North Carolina'], ['Phoenix', 'Arizona'], ['Denver', 'Colorado'], ['Tampa', 'Florida'], ['Milwaukee', 'Wisconsin']];
const FIRST = ['Dana', 'Marcus', 'Priya', 'Tom', 'Elena', 'Sam', 'Jane', 'Carlos', 'Luis', 'Emma', 'Diego', 'Sofía', 'Mark', 'Ana', 'Grace', 'Javier', 'Nina', 'Omar', 'Valeria', 'Chris'];
const LAST = ['Wh***d', 'Re***s', 'Na***n', 'Be***k', 'Or***z', 'Ok***r', 'Me***n', 'Ha***d', 'Li***t', 'So***o', 'Fi***r', 'Du***e', 'Cl***e', 'Pa***l', 'Ro***s'];
const FULL: Record<string, string> = { 'Wh***d': 'Whitfield', 'Re***s': 'Reyes', 'Na***n': 'Narayan', 'Be***k': 'Becker', 'Or***z': 'Ortiz', 'Ok***r': 'Okafor', 'Me***n': 'Melton', 'Ha***d': 'Haddad', 'Li***t': 'Lindqvist', 'So***o': 'Soto', 'Fi***r': 'Fischer', 'Du***e': 'Dunne', 'Cl***e': 'Clarke', 'Pa***l': 'Patel', 'Ro***s': 'Rojas' };

export function sampleCompanies(f: Partial<Filters>, page: number, perPage: number): SearchResult<Org> {
  const seed = seedOf(JSON.stringify([f.okw, f.oloc, f.size, f.oname]));
  const total = 137;
  const rows: Org[] = [];
  for (let i = (page - 1) * perPage; i < Math.min(total, page * perPage); i++) {
    const r = rng(seed + i);
    const n = NAMES[i % NAMES.length] + (i >= NAMES.length ? ' ' + String.fromCharCode(65 + Math.floor(i / NAMES.length)) : '');
    const c = CITIES[Math.floor(r() * CITIES.length)];
    const emp = [24, 60, 140, 320, 650, 1200, 2800][Math.floor(r() * 7)];
    const rev = emp * (120 + Math.floor(r() * 140)) * 1000;
    const dom = n.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.example.com';
    rows.push({ id: 'sc' + i, name: n, domain: dom, website: 'https://' + dom, industry: INDS[Math.floor(r() * INDS.length)], industries: [], employees: emp, city: c[0], state: c[1], country: 'United States', phone: `+1 ${200 + Math.floor(r() * 789)}-555-0${100 + Math.floor(r() * 99)}`, linkedin: 'https://www.linkedin.com/company/' + n.toLowerCase().replace(/[^a-z0-9]+/g, '-'), logo: '', founded: 1952 + Math.floor(r() * 63), revenue: rev >= 1e9 ? (rev / 1e9).toFixed(1) + 'B' : (rev / 1e6).toFixed(1) + 'M', revenue_n: rev, growth12: (Math.floor(r() * 33) - 8) / 100, sic: [String(3400 + Math.floor(r() * 199))], naics: [String(332000 + Math.floor(r() * 1999))], description: `${n} manufactures ${f.okw?.[0] || 'industrial components'} for OEM and MRO customers in North America.`, keywords: [...new Set([...(f.okw || []), 'manufacturing', 'OEM'])], enriched: true });
  }
  return { rows, total, page, per_page: perPage, pages: Math.ceil(total / perPage) };
}

export function samplePeople(f: Partial<Filters>, page: number, perPage: number): SearchResult<Person> {
  const titles = f.titles?.length ? f.titles : ['Purchasing Manager', 'Director of Supply Chain', 'VP Operations', 'Plant Manager', 'Sourcing Manager', 'Engineering Manager', 'Chief Operating Officer', 'Senior Buyer', 'Quality Manager', 'Logistics Manager'];
  const cos = sampleCompanies(f, 1, 25).rows;
  const seed = seedOf(JSON.stringify([f.titles, f.sen, f.ploc, f.domains, f.okw]));
  const total = f.domains?.length ? 9 : 412;
  const rows: Person[] = [];
  for (let i = (page - 1) * perPage; i < Math.min(total, page * perPage); i++) {
    const r = rng(seed + i);
    const co = cos[i % cos.length];
    const t = titles[Math.floor(r() * titles.length)];
    rows.push({ id: 'sp' + i, first: FIRST[i % FIRST.length], last: LAST[Math.floor(r() * LAST.length)], last_obf: true, title: t.replace(/\b\w/g, (c) => c.toUpperCase()), seniority: '', linkedin: '', email: '', has_email: r() < 0.7, has_phone: r() < 0.4, city: '', has_city: r() < 0.8, company: f.domains?.length ? 'Gulf Flow Systems' : co.name, company_id: f.domains?.length ? 'sorg1' : co.id, domain: f.domains?.length ? f.domains[0] : co.domain, departments: [] });
  }
  return { rows, total, page, per_page: perPage, pages: Math.ceil(total / perPage) };
}

export function sampleEnrich(p: Person): Person {
  const last = FULL[p.last] || p.last.replace(/\*/g, '');
  const org = sampleCompanies({}, 1, 25).rows.find((c) => c.domain === p.domain) || sampleOrg(p.domain);
  return { ...p, last, last_obf: false, linkedin: `https://www.linkedin.com/in/${(p.first + '-' + last).toLowerCase()}-example`, email: p.has_email ? `${p.first}.${last}`.toLowerCase() + '@' + p.domain : '', org };
}

export function sampleOrg(domain: string): Org {
  return { id: 'sorg1', name: 'Gulf Flow Systems', domain: domain || 'gulfflowsystems.example.com', website: 'https://gulfflowsystems.example.com', industry: 'Industrial Machinery & Equipment', industries: ['machinery'], employees: 320, city: 'Houston', state: 'Texas', country: 'United States', phone: '', linkedin: 'https://www.linkedin.com/company/gulf-flow-systems-example', logo: '', founded: 1994, revenue: '48.0M', revenue_n: 48000000, growth12: 0.06, sic: ['3491'], naics: ['332911'], description: 'Gulf Flow Systems designs and manufactures industrial valves and flow-control assemblies for oil and gas, water and process customers across the Gulf Coast.', keywords: ['valves', 'flow control', 'actuators', 'oil and gas', 'manufacturing'], enriched: true };
}

export function sampleLookup(domain: string): { org: Org; people: Person[] } {
  const org = sampleOrg(domain);
  const rows: [string, string, string, string, boolean][] = [['s1', 'Dana', 'Wh***d', 'Purchasing Manager', true], ['s2', 'Marcus', 'Re***s', 'Director of Supply Chain', true], ['s3', 'Priya', 'Na***n', 'VP Operations', false], ['s4', 'Tom', 'Be***k', 'Engineering Manager', true], ['s5', 'Elena', 'Or***z', 'Chief Executive Officer', false], ['s6', 'Sam', 'Ok***r', 'Quality Manager', false]];
  return { org, people: rows.map(([id, first, last, title, has]) => ({ id, first, last, last_obf: true, title, seniority: '', linkedin: '', email: '', has_email: has, has_phone: has, city: '', has_city: true, company: org.name, company_id: org.id, domain: org.domain, departments: [] })) };
}
