/** Shapes the API returns (mirrors server/src/types.ts where the client needs them). */

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
  /** Set when this person is already a Launchpad contact. */
  in_lp?: { id: string; name: string };
  icp?: IcpMatch;
  summary?: string;
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

export interface Angle { match: string; what: string; why: string }

export interface Profile {
  company: string;
  sells: string;
  sells_to: string;
  industries: string[];
  roles: string[];
  angles: Angle[];
  templates: Record<string, string[]>;
  default_titles: string[];
}

/** The ideal customer profile. Empty lists mean "any". */
export interface Targeting {
  titles: string[];
  seniorities: string[];
  departments: string[];
  industries: string[];
  locations: string[];
  employee_ranges: string[];
  revenue_min: number;
  revenue_max: number;
  exclude: { titles: string[]; industries: string[]; locations: string[]; companies: string[] };
  finders_icp_only: boolean;
  updated: number;
}
export type MatchLevel = 'icp' | 'target' | 'none';
export interface IcpMatch { level: MatchLevel; hits: string[]; misses: string[]; unknown: string[]; of: number; excluded?: string; why: string[] }

export interface PublicClient {
  slug: string;
  name: string;
  profile: Profile;
  timezone: string;
  launchpad_app: string;
  location_id: string;
  pipeline: string;
  has_openai: boolean;
  has_apollo: boolean;
  /** A Google Maps key is set: the Local businesses tab returns live places. */
  has_maps: boolean;
  has_launchpad: boolean;
  credits: Credits;
  show_usage: boolean;
  show_activity: boolean;
  /** The email waterfall is on for this client (and a key is set): pushes may find emails the research database has none for. */
  email_waterfall: boolean;
  support_email: string;
  auto_push: AutoPush;
  targeting: Targeting;
}

/** The daily cap on what the finders push: used / left today, in the client's timezone. */
export interface AutoPush { daily: number; used: number; left: number; day: string; timezone: string; max_finders: number }

export interface Me { client: PublicClient | null; admin: boolean; sample: boolean }

export interface Options {
  seniority: Record<string, string>;
  departments: Record<string, Record<string, string>>;
  employee_ranges: Record<string, string>;
  email_status: Record<string, string>;
  funding: Record<string, string>;
  per_page: number[];
}

export interface FinderView {
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
  icp_only?: boolean;
  enabled: boolean;
  created: number;
  last_run: number;
  last_result: string;
  seen_count: number;
  when: string;
  next: number;
}

export interface RecentSearch { q: string; kind: Kind; total: number; t: number }

export interface AskResult {
  q: string;
  intent: Intent;
  filters: Filters;
  kind: Kind;
  result: SearchResult<Person | Org>;
  fits: Record<string, string>;
  icp?: Record<string, IcpMatch>;
  warnings: string[];
  sample: boolean;
}

export interface PushResult {
  company: { name: string; id: string };
  contacts: { name: string; role: string; id: string; new: boolean; email: string; email_source?: 'research' | 'waterfall'; email_verified?: boolean; priority?: string; icp?: string }[];
  note_added: boolean;
  opportunity: { id: string; name: string; created: boolean };
  log: string[];
}

export interface PushLinks { company: string; opportunity: string; contacts: string[] }

export interface PeoplePushed { results: PushResult[]; errors: string[]; credits?: number; credits_spent?: number; credits_left?: number; links: PushLinks[]; bd: string }

export interface CreditEntry { t: number; delta: number; reason: string; by: string; left: number }

export interface Credits { monthly: number; extra: number; used: number; total: number; left: number; period: string; resets_on: string; resets_label: string }

export interface CompaniesPushed { results: { name: string; id: string; domain: string }[]; errors: string[]; links: string[] }

/** A local business from Google Maps (the Local businesses tab). */
export interface Place {
  id: string;
  name: string;
  category: string;
  types: string[];
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  website: string;
  domain: string;
  rating: number | null;
  reviews: number;
  price: string;
  lat: number | null;
  lng: number | null;
  open_state: string;
  description: string;
  thumbnail: string;
  maps_url: string;
}

export interface PlacesRes { what: string; where: string; result: SearchResult<Place> & { more: boolean; next_token?: string }; sample: boolean; provider: 'google' | 'serpapi' | 'sample'; warnings: string[] }

export interface UsageRow {
  t: number;
  ctx: string;
  p: 'apollo' | 'openai' | 'treg' | 'serpapi' | 'gmaps';
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

export interface UsageSummary {
  days: number;
  rows: number;
  totals: {
    searches: number; lookups: number; credits: number; results: number;
    apollo_calls: number; apollo_errors: number; gpt_calls: number; gpt_errors: number;
    tokens_in: number; tokens_out: number; cost: number; cost_known: boolean;
    waterfall_calls?: number; waterfall_found?: number; waterfall_cost?: number;
  };
  by_day: { day: string; searches: number; credits: number; tokens: number; cost: number }[];
  by_ctx: Record<string, { searches: number; lookups: number; credits: number; gpt_calls: number; tokens: number; cost: number }>;
  by_model: Record<string, { calls: number; in: number; out: number; cost: number; known: boolean }>;
  by_ep: Record<string, number>;
  recent: UsageRow[];
}

export interface PlanRow { label: string; day?: { consumed: number; limit: number }; hour?: { consumed: number; limit: number }; minute?: { consumed: number; limit: number } }

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
  keys: { openai: string; openai_model: string; apollo: string; treg: string; serpapi?: string; gmaps?: string };
  /** Never the values: whether each secret is set, its last four characters, and where it comes from. */
  secrets?: Record<'openai' | 'apollo' | 'treg' | 'serpapi' | 'gmaps' | 'token', SecretState>;
  credits: { monthly: number; used: number; period: string; extra: number };
  flags: { show_usage: boolean; show_activity: boolean; email_waterfall: boolean };
  auto_push: { daily: number; day: string; used: number; max_finders?: number };
  profile: Profile;
  targeting: Targeting;
}

export interface ClientRow { slug: string; name: string; enabled: boolean; created: number; connected: boolean; has_openai: boolean; has_apollo: boolean; has_maps?: boolean; finders: number }

export interface MenuLink { label: string; url: string }

export type ActivityKind = 'finder' | 'push' | 'search' | 'lookup' | 'credits' | 'system';
export interface ActivityItem { name: string; company?: string; id?: string; email?: string }
export interface Activity { t: number; kind: ActivityKind; title: string; detail?: string; credits?: number; by: string; ok: boolean; n?: number; items?: ActivityItem[]; ref?: string }
export interface ActivityPage { rows: Activity[]; total: number; page: number; pages: number; per: number }

export interface SecretState { set: boolean; hint: string; source: 'client' | 'agency' | 'env' | 'none' }

export interface CostLine { gpt: number; gpt_known: boolean; credits: number; research: number; waterfall: number; waterfall_calls: number; waterfall_found: number; maps: number; maps_calls: number; total: number; searches: number; lookups: number; gpt_calls: number; tokens: number; errors: number }
export interface CostReport {
  months: ({ month: string; label: string } & CostLine)[];
  selected: string;
  label: string;
  credit_cost: number;
  maps_cost?: number;
  totals: CostLine & { clients_active: number; top_client: string; top_share: number; calls: number };
  clients: ({ slug: string; name: string; share: number; by_feature: Record<string, CostLine> } & CostLine)[];
  features: ({ feature: string; share: number } & CostLine)[];
  models: { model: string; calls: number; in: number; out: number; cost: number; known: boolean }[];
  days: ({ day: string } & CostLine)[];
}

export interface Overview {
  totals: { clients: number; connected: number; finders: number; credits_total: number; credits_used: number; credits_left: number; clients_out: number; pushed_month: number; searches_month: number; finder_runs_today: number };
  clients: { slug: string; name: string; enabled: boolean; connected: boolean; credits: Credits; finders: number; last: Activity | null }[];
}

export interface WaterfallLine { tried: number; found: number; verified: number; errors: number; cost: number; ms: number }
export interface WaterfallTestRow { t: number; client: string; mode: 'list' | 'search'; q?: string; first: string; last: string; domain: string; company?: string; title?: string; linkedin?: string; db_email?: string; email: string; verified: boolean; provider: string; cost: number; ms: number; status: 'found' | 'none' | 'error' | 'had_email' | 'skipped'; err?: string }
export interface WaterfallReport {
  days: number;
  totals: WaterfallLine & { hit_rate: number; verified_share: number; cost_per_email: number; ms_avg: number };
  by_day: ({ day: string } & WaterfallLine)[];
  by_client: ({ slug: string; name: string } & WaterfallLine)[];
  by_source: ({ source: string } & WaterfallLine)[];
  recent: { t: number; client: string; source: string; ok: boolean; found: boolean; verified: boolean; provider: string; cost: number; ms: number; err?: string }[];
  tests: WaterfallTestRow[];
  key_set: boolean;
  clients: { slug: string; name: string; waterfall: boolean; has_apollo: boolean }[];
}
export interface WaterfallSearchTest { summary: string; total: number; rows: WaterfallTestRow[]; db_emails: number }

export type AdminActivity = Omit<Activity, 'items'> & { client: string; slug: string };
export interface AdminActivityPage { rows: AdminActivity[]; total: number; page: number; pages: number; per: number }
