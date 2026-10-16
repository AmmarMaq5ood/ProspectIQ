import type { Client, Org, Person, Profile, PushResult } from './types.js';
import { PRIORITY } from './icp.js';
import { cached } from './store.js';

/**
 * Launchpad (white-labelled GoHighLevel) writes: company records, contacts
 * bound to them with roles, notes, the outreach opportunity at the first
 * stage of the client's business-development pipeline, and the company ↔
 * opportunity relation. Plus the lookups the finder needs for de-duplication.
 */

const API = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

export class LaunchpadError extends Error {}

export interface LP { locationId: string; token: string; pipeline: string; owner: string }

export function lpOf(client: Client): LP {
  return { locationId: client.launchpad.location_id, token: client.launchpad.token, pipeline: client.launchpad.pipeline, owner: client.launchpad.owner };
}

export function lpReady(lp: LP): boolean {
  return !!(lp.locationId && lp.token);
}

async function req(lp: LP, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, query?: Record<string, string>): Promise<Record<string, any>> {
  if (!lpReady(lp)) throw new LaunchpadError('Launchpad is not connected for this client (location id and token).');
  const url = `${API}${path}${query ? '?' + new URLSearchParams(query) : ''}`;
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { authorization: `Bearer ${lp.token}`, version: VERSION, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(40000) });
  } catch (e) {
    throw new LaunchpadError(`Launchpad ${path}: ${(e as Error).message}`);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) {
    const msg = Array.isArray(json.message) ? json.message.join('; ') : json.message || json.error || `HTTP ${res.status}`;
    throw new LaunchpadError(`Launchpad ${path}: ${msg}`);
  }
  return json;
}

export function lpUrl(client: Client, kind: 'contact' | 'opportunity' | 'business' | 'pipeline', id = ''): string {
  const app = (client.launchpad.app_url || 'https://app.launchpadinnovations.ai').replace(/\/$/, '');
  const loc = encodeURIComponent(client.launchpad.location_id);
  const routes: Record<string, string> = { contact: `/v2/location/${loc}/contacts/detail/${encodeURIComponent(id)}`, opportunity: `/v2/location/${loc}/opportunities/list/${encodeURIComponent(id)}`, business: `/v2/location/${loc}/contacts/businesses/${encodeURIComponent(id)}`, pipeline: `/v2/location/${loc}/opportunities/list` };
  if (!routes[kind] || (!id && kind !== 'pipeline')) return '';
  return app + routes[kind];
}

/** Connection test for the admin panel: the pipelines the token can see. */
export async function testConnection(lp: LP): Promise<{ ok: boolean; pipelines: { id: string; name: string; stages: string[] }[]; error?: string }> {
  try {
    const r = await req(lp, 'GET', '/opportunities/pipelines', undefined, { locationId: lp.locationId });
    return { ok: true, pipelines: (r.pipelines || []).map((p: any) => ({ id: String(p.id), name: String(p.name), stages: (p.stages || []).sort((a: any, b: any) => (a.position || 0) - (b.position || 0)).map((s: any) => String(s.name)) })) };
  } catch (e) {
    return { ok: false, pipelines: [], error: (e as Error).message };
  }
}

export async function findContactByEmail(lp: LP, email: string): Promise<string> {
  if (!email) return '';
  const r = await req(lp, 'GET', '/contacts/', undefined, { locationId: lp.locationId, query: email, limit: '5' });
  const hit = (r.contacts || []).find((c: any) => String(c.email || '').toLowerCase() === email.toLowerCase());
  return hit ? String(hit.id) : '';
}

export async function findContactByName(lp: LP, first: string, last: string, company: string): Promise<string> {
  const q = `${first} ${last}`.trim();
  if (!q) return '';
  const r = await req(lp, 'GET', '/contacts/', undefined, { locationId: lp.locationId, query: q, limit: '10' });
  const hit = (r.contacts || []).find((c: any) => `${c.firstName || ''} ${c.lastName || ''}`.trim().toLowerCase() === q.toLowerCase() && (!company || String(c.companyName || '').toLowerCase() === company.toLowerCase()));
  return hit ? String(hit.id) : '';
}

export interface LpContact { id: string; first: string; last: string; company: string; email: string }

function shapeContact(c: Record<string, any>): LpContact {
  return { id: String(c.id || ''), first: String(c.firstName || ''), last: String(c.lastName || ''), company: String(c.companyName || ''), email: String(c.email || '').toLowerCase() };
}

/** Contacts matching the given search filters (paged, capped). */
export async function searchContacts(lp: LP, filters: Record<string, unknown>[], max = 500): Promise<LpContact[]> {
  const out: LpContact[] = [];
  for (let page = 1; page <= 20 && out.length < max; page++) {
    const r = await req(lp, 'POST', '/contacts/search', { locationId: lp.locationId, pageLimit: 100, page, filters });
    const rows = (r.contacts || []).map(shapeContact);
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out.slice(0, max);
}

export const contactsWithTag = (lp: LP, tag: string) => searchContacts(lp, [{ field: 'tags', operator: 'contains', value: tag }], 3000);
export const contactsAtCompany = (lp: LP, company: string) => searchContacts(lp, [{ field: 'companyName', operator: 'eq', value: company }], 100);

export async function pushCompany(lp: LP, co: { name: string; website?: string; city?: string; state?: string; country?: string; phone?: string; description?: string }): Promise<string> {
  try {
    const list = await req(lp, 'GET', '/businesses/', undefined, { locationId: lp.locationId });
    const hit = (list.businesses || []).find((b: any) => String(b.name || '').toLowerCase() === co.name.toLowerCase());
    if (hit) return String(hit.id);
  } catch {
    // create below
  }
  const body: Record<string, string> = { locationId: lp.locationId, name: co.name };
  for (const k of ['website', 'city', 'state', 'country', 'description', 'phone'] as const) if (co[k]) body[k] = String(co[k]);
  const res = await req(lp, 'POST', '/businesses/', body);
  const b = res.buiseness || res.business || {};
  return String(b.id || '');
}

export async function pushContact(lp: LP, c: Person, companyName: string, bizId: string, extra: Record<string, string>): Promise<[string, boolean]> {
  const fields: { key: string; field_value: string }[] = [{ key: 'role', field_value: c.role || '' }, { key: 'title', field_value: c.title }];
  for (const [k, v] of Object.entries(extra)) if (v) fields.push({ key: k, field_value: v });
  if (c.linkedin) fields.push({ key: 'linkedin_url', field_value: c.linkedin });
  if (c.icp) fields.push({ key: 'icp_match', field_value: PRIORITY[c.icp.level].field }, { key: 'lead_priority', field_value: PRIORITY[c.icp.level].priority });
  if (c.summary) fields.push({ key: 'research_summary', field_value: c.summary.slice(0, 2000) });
  const body: Record<string, unknown> = { locationId: lp.locationId, firstName: c.first, lastName: c.last, companyName, source: 'ProspectIQ', tags: [...new Set(['bd', 'linkedin', 'research', ...(c.tags || [])])], customFields: fields };
  if (c.email) body.email = c.email;
  if (lp.owner) body.assignedTo = lp.owner;
  let id = '', isNew = false;
  if (c.email) {
    const res = await req(lp, 'POST', '/contacts/upsert', body);
    id = String(res.contact?.id || ''); isNew = !!res.new;
  } else {
    id = await findContactByName(lp, c.first, c.last, companyName);
    if (id) { const upd = { ...body }; delete upd.locationId; await req(lp, 'PUT', `/contacts/${encodeURIComponent(id)}`, upd); }
    else { const res = await req(lp, 'POST', '/contacts/', body); id = String(res.contact?.id || ''); isNew = true; }
  }
  if (id && bizId) { try { await req(lp, 'PUT', `/contacts/${encodeURIComponent(id)}`, { businessId: bizId }); } catch { /* grouped by name instead */ } }
  return [id, isNew];
}

export async function pushNote(lp: LP, contactId: string, body: string): Promise<boolean> {
  try {
    const have = await req(lp, 'GET', `/contacts/${encodeURIComponent(contactId)}/notes`);
    if ((have.notes || []).some((n: any) => String(n.body || '').trim() === body.trim())) return false;
  } catch { /* add anyway */ }
  await req(lp, 'POST', `/contacts/${encodeURIComponent(contactId)}/notes`, { body });
  return true;
}

export async function pushOutreach(lp: LP, contactId: string, companyName: string): Promise<[string, boolean]> {
  const pipes = await req(lp, 'GET', '/opportunities/pipelines', undefined, { locationId: lp.locationId });
  const bd = (pipes.pipelines || []).find((p: any) => String(p.id) === lp.pipeline || String(p.name || '').toLowerCase().includes(lp.pipeline.toLowerCase()));
  if (!bd) throw new LaunchpadError(`no pipeline matches "${lp.pipeline}"`);
  const stages = [...(bd.stages || [])].sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
  const existing = await req(lp, 'GET', '/opportunities/search', undefined, { location_id: lp.locationId, pipeline_id: String(bd.id), contact_id: contactId, status: 'all', limit: '20' });
  const hit = (existing.opportunities || []).find((o: any) => String(o.name || '').toLowerCase().includes('outreach'));
  if (hit) return [String(hit.id), false];
  const body: Record<string, unknown> = { locationId: lp.locationId, pipelineId: String(bd.id), pipelineStageId: String(stages[0]?.id || ''), name: `${companyName} — outreach`, status: 'open', contactId, monetaryValue: 0 };
  if (lp.owner) body.assignedTo = lp.owner;
  const res = await req(lp, 'POST', '/opportunities/', body);
  return [String(res.opportunity?.id || ''), true];
}

export async function relate(lp: LP, bizId: string, oppId: string): Promise<boolean> {
  if (!bizId || !oppId) return false;
  try {
    const assoc = await req(lp, 'GET', '/associations/', undefined, { locationId: lp.locationId, limit: '50', skip: '0' });
    const a = (assoc.associations || []).find((x: any) => x.key === 'BUSINESSES_OPPORTUNITIES_ASSOCIATION');
    if (!a) return false;
    await req(lp, 'POST', '/associations/relations', { locationId: lp.locationId, associationId: String(a.id), firstRecordId: bizId, secondRecordId: oppId });
    return true;
  } catch {
    return false;
  }
}

export function roleFromTitle(title: string, roles: string[]): string {
  const t = title.toLowerCase();
  const pick = (name: string) => roles.find((r) => r.toLowerCase() === name.toLowerCase()) || '';
  if (/purchas|procure|buyer|sourcing|commodity/.test(t)) return pick('Purchasing') || roles[0];
  if (/supply chain|logistic|materials|planning|inventory/.test(t)) return pick('Supply chain') || pick('Operations') || roles[0];
  if (/chief executive|\bceo\b|\bcoo\b|\bcfo\b|president|owner|founder|managing director|general manager|\bvp\b|vice president|chief/.test(t)) return pick('Executive') || roles[0];
  if (/operation|plant|production|manufactur|facilit/.test(t)) return pick('Operations') || roles[0];
  if (/engineer|technical|quality|r&d|design|product|architect/.test(t)) return pick('Engineering') || pick('Design') || roles[0];
  if (/marketing|brand|communications/.test(t)) return pick('Marketing') || pick('Other') || roles[roles.length - 1];
  return pick('Other') || roles[roles.length - 1];
}

export function sizeBucket(employees: number): string {
  if (employees <= 0) return '';
  if (employees < 50) return '1-50';
  if (employees < 200) return '50-200';
  if (employees < 500) return '200-500';
  if (employees < 1000) return '500-1000';
  return '1000+';
}

export function angleFor(profile: Profile, org: Org): { what: string; why: string } {
  const blob = `${org.industry} ${org.description} ${org.keywords.join(' ')}`.toLowerCase();
  for (const a of profile.angles) { try { if (new RegExp(a.match, 'i').test(blob)) return a; } catch { /* bad regex */ } }
  return { what: profile.sells || 'what we offer', why: '' };
}

export function draftNote(profile: Profile, org: Org, people: Person[], imports = ''): [string, string] {
  const { what, why } = angleFor(profile, org);
  const lines: string[] = ['RESEARCH (ProspectIQ + ImportGenius + LinkedIn)'];
  const hq = [org.city, org.state, org.country].filter(Boolean).join(', ');
  lines.push(`- ${org.name}${org.industry ? ' — ' + org.industry : ''}${org.employees ? ', ~' + org.employees.toLocaleString() + ' employees' : ''}${hq ? ', ' + hq : ''}${org.website ? '. ' + org.website : ''}`);
  if (org.description) lines.push('- ' + (org.description.length > 260 ? org.description.slice(0, 257) + '…' : org.description));
  lines.push('- Imports: ' + (imports.trim() || 'not researched yet (ImportGenius).'));
  if (people.length) lines.push('- Contacts: ' + people.map((p) => `${p.first} ${p.last}`.trim() + ` (${p.title})`).join('; ') + '.');
  lines.push(`- Angle: ${what}.${why ? ' ' + why : ''}`);
  const first = people[0]?.first || 'there';
  const who = (profile.sells_to ? profile.sells_to.split(/[,.;]/)[0].trim() : '') || 'companies';
  const msg = `Hi ${first} — ${profile.company || 'we'} help${profile.company ? 's' : ''} ${who} like ${org.name} with ${what}.${why ? ' ' + why : ''} Worth a 15-minute look?`;
  return [lines.join('\n'), msg];
}

/** The whole push for one company: record, contacts, note on the first, outreach deal, relation. */
export async function pushProspect(lp: LP, p: { company: { name: string; website: string; city: string; state: string; country: string; phone: string; description: string; industry: string; size: string }; contacts: Person[]; note: string; message: string }): Promise<PushResult> {
  const log: string[] = [];
  const biz = await pushCompany(lp, p.company);
  const out: PushResult = { log, company: { name: p.company.name, id: biz }, contacts: [], note_added: false, opportunity: { id: '', name: '', created: false } };
  log.push(`Company: ${p.company.name}${biz ? ` (${biz})` : ' (not created)'}`);
  const ids: string[] = [];
  for (const c of p.contacts) {
    const [id, isNew] = await pushContact(lp, c, p.company.name, biz, { industry: p.company.industry, company_size: p.company.size, follow_up_cadence: 'two weeks' });
    ids.push(id);
    out.contacts.push({ name: `${c.first} ${c.last}`.trim(), role: c.role || '', id, new: isNew, email: c.email || '', priority: c.icp ? PRIORITY[c.icp.level].priority : undefined, icp: c.icp?.level, email_source: c.email ? c.email_source || 'research' : undefined, email_verified: c.email_source === 'waterfall' ? !!c.email_verified : undefined });
    log.push(`Contact: ${c.first} ${c.last} (${c.role}) ${isNew ? 'created' : 'updated'}`);
  }
  if (ids[0]) {
    const note = p.note + (p.message.trim() ? `\n\nCONNECTION NOTE (drafted):\n${p.message.trim()}` : '');
    out.note_added = await pushNote(lp, ids[0], note);
    const [opp, created] = await pushOutreach(lp, ids[0], p.company.name);
    out.opportunity = { id: opp, name: `${p.company.name} — outreach`, created };
    if (await relate(lp, biz, opp)) log.push('Related the opportunity to the company record');
  }
  return out;
}

/* ---- the three lead fields the targeting fills, created once per sub-account ---- */

const LEAD_FIELDS: { key: string; name: string; dataType: string; options?: string[]; placeholder?: string }[] = [
  { key: 'icp_match', name: 'ICP Match', dataType: 'SINGLE_OPTIONS', options: ['ICP match', 'Target match', 'No match'] },
  { key: 'lead_priority', name: 'Lead Priority', dataType: 'SINGLE_OPTIONS', options: ['Hot', 'High', 'Normal'] },
  { key: 'research_summary', name: 'Research Summary', dataType: 'LARGE_TEXT', placeholder: 'Written by ProspectIQ when the lead was pushed' },
];

/** Makes sure ICP Match, Lead Priority and Research Summary exist on the sub-account's contacts. Checked once a day per client; returns the keys it had to create. */
export async function ensureLeadFields(lp: LP, slug: string): Promise<string[]> {
  return cached<string[]>(slug, `lead-fields|${lp.locationId}`, 86400, async () => {
    const have = await req(lp, 'GET', `/locations/${encodeURIComponent(lp.locationId)}/customFields`);
    const keys = new Set((have.customFields || []).map((f: any) => String(f.fieldKey || '').replace(/^contact\./, '')));
    const made: string[] = [];
    for (const f of LEAD_FIELDS) {
      if (keys.has(f.key)) continue;
      const body: Record<string, unknown> = { name: f.name, dataType: f.dataType, model: 'contact' };
      if (f.options) body.options = f.options;
      if (f.placeholder) body.placeholder = f.placeholder;
      await req(lp, 'POST', `/locations/${encodeURIComponent(lp.locationId)}/customFields`, body);
      made.push(f.key);
    }
    return made;
  });
}
