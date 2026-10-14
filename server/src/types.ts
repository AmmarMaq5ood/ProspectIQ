/** Shapes shared across the server (the client mirrors the ones it needs). */

export type Kind = 'people' | 'companies';

export interface Intent {
  kind: Kind;
  titles: string[];
  seniorities: string[];
  departments: string[];
  person_locations: string[];
  company_locations: string[];
  exclude_locations: string[];
  industry_keywords: string[];
  company_domains: string[];
  company_name: string;
  employee_ranges: string[];
  revenue_min: number;
  revenue_max: number;
  technologies: string[];
  keywords: string;
  summary: string;
  source?: 'gpt' | 'rules';
  error?: string;
}

/** The filter set every search understands (the People / Companies tabs edit it directly). */
export interface Filters {
  titles: string[];
  similar: boolean;
  not_titles: string[];
  name: string;
  kw: string;
  sen: string[];
  dep: string[];
  ploc: string[];
  pnot: string[];
  oloc: string[];
  onot: string[];
  domains: string[];
  okw: string[];
  oname: string;
  size: string[];
  rev_min: string;
  rev_max: string;
  tech: string[];
  fund: string[];
  founded_min: string;
  founded_max: string;
  email: string[];
  oids: string[];
}

export interface Person {
  id: string;
  first: string;
  last: string;
  last_obf: boolean;
  title: string;
  seniority: string;
  linkedin: string;
  email: string;
  has_email: boolean;
  has_phone: boolean;
  city: string;
  has_city: boolean;
  company: string;
  company_id: string;
  domain: string;
  departments: string[];
  role?: string;
  tags?: string[];
  org?: Org;
  /** Set when this person is already a Launchpad contact (pushed before, or found by name + company). */
  in_lp?: { id: string; name: string };
}

export interface Org {
  id: string;
  name: string;
  domain: string;
  website: string;
  industry: string;
  industries: string[];
  employees: number;
  city: string;
  state: string;
  country: string;
  phone: string;
  linkedin: string;
  logo: string;
  founded: number;
  revenue: string;
  revenue_n: number;
  growth12: number | null;
  sic: string[];
  naics: string[];
  description: string;
  keywords: string[];
  enriched: boolean;
}

export interface SearchResult<T> {
  rows: T[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

/** What a client sells, to whom, and how ProspectIQ should talk about it. */
export interface Profile {
  company: string;
  sells: string;
  sells_to: string;
  industries: string[];
  roles: string[];
  angles: { match: string; what: string; why: string }[];
  templates: Record<string, string[]>;
  default_titles: string[];
}

export interface Client {
  slug: string;
  name: string;
  access_key: string;
  enabled: boolean;
  created: number;
  launchpad: {
    location_id: string;
    token: string;
    app_url: string;
    pipeline: string;
    quote_stage: string;
    owner: string;
    timezone: string;
    users: Record<string, string>;
  };
  keys: {
    openai: string;
    openai_model: string;
    apollo: string;
    /** treg.to (email waterfall), stored for when it is wired in. */
    treg: string;
  };
  /** Monthly credits: one per lead added to Launchpad with a work email. `monthly` resets `used` on the 1st; `extra` is this month's bonus. */
  credits: { monthly: number; used: number; period: string; extra: number };
  flags: { show_usage: boolean; show_activity: boolean };
  /** Daily cap on what the finders push, across all of them: `used` counts leads pushed on `day` (client's timezone). */
  auto_push: { daily: number; day: string; used: number };
  profile: Profile;
}

export interface CreditEntry { t: number; delta: number; reason: string; by: string; left: number }

export interface Finder {
  id: string;
  name: string;
  q: string;
  intent: Intent;
  per_run: number;
  hour: number;
  minute: number;
  start: number;
  repeat: 'daily' | 'weekdays' | 'weekly';
  notify: boolean;
  enabled: boolean;
  created: number;
  last_run: number;
  last_result: string;
  seen: string[];
}

export interface RecentSearch {
  q: string;
  kind: Kind;
  total: number;
  t: number;
}

export interface UsageRow {
  t: number;
  ctx: string;
  p: 'apollo' | 'openai';
  ok: 0 | 1;
  ms: number;
  ep?: string;
  n?: number;
  credit?: number;
  model?: string;
  kind?: string;
  in?: number;
  out?: number;
  cost?: number | null;
  err?: string;
}

export interface PushResult {
  company: { name: string; id: string };
  contacts: { name: string; role: string; id: string; new: boolean; email: string }[];
  note_added: boolean;
  opportunity: { id: string; name: string; created: boolean };
  log: string[];
}
