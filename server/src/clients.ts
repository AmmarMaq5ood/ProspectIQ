import { autoPushState } from './autopush.js';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { clientDir, readJson, writeJson, ensureDir } from './store.js';
import type { Client, Profile } from './types.js';
import { creditsView, rollover } from './credits.js';
import fs from 'node:fs';

const INDEX = () => path.join(config.dataDir, 'clients.json');

/** Artmark's profile: the seed for the first client and the example for new ones. */
export const ARTMARK_PROFILE: Profile = {
  company: 'Artmark',
  sells: 'industrial sourcing and distribution: cast and machined components, valves, pumps, electrical products, conduit and fittings, stock programs from a Miami free-trade-zone warehouse',
  sells_to: 'manufacturers and OEMs in the Americas, bought by purchasing, supply chain, operations and engineering leaders',
  industries: ['industrial valves', 'pumps', 'flow control', 'castings', 'foundry', 'forgings', 'machining', 'oil and gas equipment', 'water treatment', 'HVAC', 'electrical equipment', 'conduit and fittings', 'automotive parts', 'aerospace components', 'packaging machinery', 'material handling', 'mining equipment', 'agricultural equipment', 'medical devices', 'industrial automation'],
  roles: ['Purchasing', 'Supply chain', 'Operations', 'Engineering', 'Executive', 'Other'],
  angles: [
    { match: 'valve|pump|flow|actuator|fitting|hydraulic|fluid', what: 'cast and machined components (valve bodies, trim, pump housings)', why: 'Miami FTZ + Stock & Release cuts landed cost and on-hand stock; Taiwan/China foundries already ISO 9001 vetted.' },
    { match: 'electric|conduit|cable|wire|utility|power|lighting', what: 'electrical components, conduit and fittings', why: 'Doral consolidation and export documentation in one shipment; financing options for project orders.' },
    { match: 'packag|automation|convey|robot', what: 'machined and stamped assemblies for packaging lines', why: 'Blanket orders released from Miami stock keep lines running without the overseas lead time.' },
    { match: 'medical|device|instrument', what: 'precision machined and molded components to drawing', why: 'ISO 9001 supply base with first-article and inspection reports on every lot.' },
    { match: '.', what: 'industrial components and assemblies to drawing', why: 'Vetted Taiwan/China supply base, Miami FTZ stock programs, and one responsible supplier instead of many.' },
  ],
  templates: {
    'Valves & pumps': [
      'Purchasing and supply chain managers at valve and pump makers in Texas, 100 to 1,000 employees',
      'Industrial valve manufacturers in Ohio and Pennsylvania',
      'Plant managers at pump manufacturers in the US with 200 to 2,000 employees',
    ],
    'Castings & foundry': [
      'Plant managers and operations directors at castings and foundry companies in the US and Mexico',
      'Foundries in Mexico with over 100 employees',
      'Sourcing managers at forgings and machining companies in the Midwest',
    ],
    Electrical: [
      'Owners and executives of electrical equipment manufacturers with $10M to $200M revenue',
      'Electrical equipment manufacturers in Texas with 50 to 500 employees',
      'Buyers at conduit and fittings distributors in Florida',
    ],
    'Packaging & automation': [
      'Buyers at packaging machinery OEMs in the Midwest',
      'Industrial automation companies in the US with 100 to 1,000 employees',
    ],
    'Medical & aerospace': [
      'Medical device companies in Florida with 50 to 500 employees',
      'Quality managers at aerospace component manufacturers in the US',
    ],
  },
  default_titles: ['purchasing', 'procurement', 'buyer', 'sourcing', 'supply chain', 'logistics', 'operations', 'plant manager', 'engineering', 'quality', 'CEO', 'president', 'owner', 'vice president'],
};

export function blankProfile(company = ''): Profile {
  return { company, sells: '', sells_to: '', industries: [], roles: ['Purchasing', 'Operations', 'Executive', 'Other'], angles: [], templates: {}, default_titles: ['purchasing', 'operations', 'owner', 'CEO', 'president'] };
}

export function newKey(): string {
  return crypto.randomBytes(18).toString('base64url');
}

export function listClients(): Client[] {
  const slugs = readJson<string[]>(INDEX(), []);
  return slugs.map((s) => getClient(s)).filter((c): c is Client => !!c);
}

export function getClient(slug: string): Client | null {
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return null;
  const file = path.join(config.dataDir, 'clients', slug, 'client.json');
  const c = readJson<Client | null>(file, null);
  if (!c) return null;
  normalize(c);
  rollover(c);
  return c;
}

/** Records written by older versions get the newer fields. */
function normalize(c: Client): Client {
  const raw = c as Client & { limits?: unknown };
  const old = c.credits as unknown as { total?: number; monthly?: number; used?: number; period?: string; extra?: number } | undefined;
  if (!old || typeof old.monthly !== 'number') c.credits = { monthly: typeof old?.total === 'number' ? old.total : 1000, used: old?.used || 0, period: '', extra: 0 };
  if (!c.flags) c.flags = { show_usage: false, show_activity: true };
  if (typeof c.flags.show_activity !== 'boolean') c.flags.show_activity = true;
  if (!c.auto_push || typeof c.auto_push.daily !== 'number') c.auto_push = { daily: 50, day: '', used: 0 };
  delete raw.limits;
  return c;
}

/** The client whose Launchpad sub-account this is (for the one dynamic menu link). */
export function getClientByLocation(locationId: string): Client | null {
  const id = locationId.trim();
  if (!id) return null;
  return listClients().find((c) => c.enabled && c.launchpad.location_id === id) || null;
}

/* ---- agency-wide settings: the secret inside the universal menu link ---- */

const SETTINGS = () => path.join(config.dataDir, 'settings.json');

export interface AgencySettings { link_secret: string; support_email: string }

export function agencySettings(): AgencySettings {
  const s = readJson<Partial<AgencySettings>>(SETTINGS(), {});
  if (!s.link_secret) {
    s.link_secret = newKey();
    writeJson(SETTINGS(), s);
  }
  if (typeof s.support_email !== 'string') s.support_email = '';
  return s as AgencySettings;
}

export function saveAgencySettings(patch: Partial<AgencySettings>): AgencySettings {
  const s = { ...agencySettings(), ...patch };
  writeJson(SETTINGS(), s);
  return s;
}

export function rotateLinkSecret(): AgencySettings {
  const s = { ...agencySettings(), link_secret: newKey() };
  writeJson(SETTINGS(), s);
  return s;
}

/** The one link that works in every sub-account: Launchpad fills in {{location.id}} when the menu item is opened. */
export function universalLink(): string {
  return `${config.publicUrl}/?loc={{location.id}}&k=${encodeURIComponent(agencySettings().link_secret)}`;
}

export function getClientByKey(key: string): Client | null {
  if (!key) return null;
  for (const c of listClients()) {
    if (c.enabled && c.access_key && timingSafeEqual(c.access_key, key)) return c;
  }
  return null;
}

export function saveClient(client: Client): Client {
  const dir = clientDir(client.slug);
  writeJson(path.join(dir, 'client.json'), client);
  const slugs = readJson<string[]>(INDEX(), []);
  if (!slugs.includes(client.slug)) {
    slugs.push(client.slug);
    writeJson(INDEX(), slugs);
  }
  return client;
}

export function deleteClient(slug: string): void {
  const slugs = readJson<string[]>(INDEX(), []).filter((s) => s !== slug);
  writeJson(INDEX(), slugs);
  const dir = path.join(config.dataDir, 'clients', slug);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

export function createClient(input: { slug: string; name: string; profile?: Partial<Profile> }): Client {
  const slug = input.slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  if (slug.length < 2) throw new Error('Slug needs at least two letters or digits.');
  if (getClient(slug)) throw new Error(`A client with slug "${slug}" already exists.`);
  const client: Client = {
    slug,
    name: input.name.trim() || slug,
    access_key: newKey(),
    enabled: true,
    created: Date.now(),
    launchpad: { location_id: '', token: '', app_url: config.launchpadApp, pipeline: 'Business Development', quote_stage: 'Quoted', owner: '', timezone: 'America/New_York', users: {} },
    keys: { openai: '', openai_model: '', apollo: '' },
    credits: { monthly: 1000, used: 0, period: '', extra: 0 },
    flags: { show_usage: false, show_activity: true },
    auto_push: { daily: 50, day: '', used: 0 },
    profile: { ...blankProfile(input.name.trim()), ...(input.profile || {}) },
  };
  return saveClient(client);
}

/** Effective keys: the client's own, else the agency's from the environment. */
export function effectiveKeys(client: Client): { openai: string; openaiModel: string; apollo: string } {
  return {
    openai: client.keys.openai || config.openaiKey,
    openaiModel: client.keys.openai_model || config.openaiModel,
    apollo: client.keys.apollo || config.apolloKey,
  };
}

/** Public view of a client for the app shell (no secrets). */
export function publicClient(client: Client) {
  const keys = effectiveKeys(client);
  return {
    slug: client.slug,
    name: client.name,
    profile: client.profile,
    timezone: client.launchpad.timezone,
    launchpad_app: client.launchpad.app_url,
    location_id: client.launchpad.location_id,
    pipeline: client.launchpad.pipeline,
    has_openai: !!keys.openai,
    has_apollo: !!keys.apollo,
    has_launchpad: !!(client.launchpad.token && client.launchpad.location_id),
    credits: creditsView(client),
    show_usage: !!client.flags.show_usage,
    show_activity: client.flags.show_activity !== false,
    support_email: agencySettings().support_email || '',
    auto_push: autoPushState(client),
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** First run: make sure the data folder exists. */
export function initData(): void {
  ensureDir(path.join(config.dataDir, 'clients'));
  if (!fs.existsSync(INDEX())) writeJson(INDEX(), []);
  agencySettings();
}
