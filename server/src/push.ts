import { enrichPerson, orgShape, type ApolloCtx } from './apollo.js';
import { draftNote, lpOf, lpReady, pushCompany, pushProspect, roleFromTitle, sizeBucket } from './launchpad.js';
import { sampleEnrich } from './samples.js';
import type { Client, Org, Person, PushResult } from './types.js';

/** Push flows shared by the Ask tab, the People/Companies tabs and the finders. */

export interface PushPeopleOpts { live: boolean; apollo: ApolloCtx; tags?: string[]; noteHeader?: string; fits?: Record<string, string> }

export async function pushPeople(client: Client, people: Person[], roles: Record<string, string>, opts: PushPeopleOpts): Promise<{ results: PushResult[]; errors: string[]; credits: number }> {
  const errors: string[] = [];
  const groups = new Map<string, { org: Org; contacts: Person[] }>();
  let credits = 0;
  for (let p of people) {
    const before = `${p.first} ${p.last}`.trim();
    p.role = client.profile.roles.includes(roles[p.id] || '') ? roles[p.id] : roleFromTitle(p.title, client.profile.roles);
    try {
      p = opts.live ? await enrichPerson(opts.apollo, p, p.domain) : sampleEnrich(p);
    } catch (e) {
      errors.push(`Could not look up ${before}: ${(e as Error).message}`);
      continue;
    }
    if (p.email) credits++;
    if (p.last_obf) p.last = '';
    if (opts.tags) p.tags = opts.tags;
    const org = p.org && p.org.name ? p.org : orgShape({ name: p.company }, p.domain);
    if (!org.name) org.name = org.domain || 'Unknown company';
    const key = (org.domain || org.name).toLowerCase();
    const g = groups.get(key) || { org, contacts: [] };
    g.contacts.push(p);
    groups.set(key, g);
  }
  const results: PushResult[] = [];
  if (!groups.size) return { results, errors: errors.length ? errors : ['None of the ticked people could be looked up.'], credits };
  if (!opts.live) {
    for (const g of groups.values()) results.push({ company: { name: g.org.name, id: '' }, contacts: g.contacts.map((c) => ({ name: `${c.first} ${c.last}`.trim(), role: c.role || '', id: '', new: true, email: c.email })), note_added: true, opportunity: { id: '', name: `${g.org.name} — outreach`, created: true }, log: ['sample mode: nothing written'] });
    return { results, errors, credits: 0 };
  }
  const lp = lpOf(client);
  if (!lpReady(lp)) return { results, errors: ['Launchpad is not connected for this client.'], credits };
  for (const g of groups.values()) {
    let [note, message] = draftNote(client.profile, g.org, g.contacts);
    if (opts.noteHeader) {
      const lines = [opts.noteHeader, ...g.contacts.map((c) => `- ${c.first} ${c.last} (${c.title}): ${opts.fits?.[c.id] || ''}`.trim())];
      note = lines.join('\n') + '\n\n' + note;
    }
    try {
      results.push(await pushProspect(lp, { company: { name: g.org.name, website: g.org.website, city: g.org.city, state: g.org.state, country: g.org.country, phone: g.org.phone, description: g.org.description, industry: g.org.industry, size: sizeBucket(g.org.employees) }, contacts: g.contacts, note, message }));
    } catch (e) {
      errors.push(`Launchpad, ${g.org.name}: ${(e as Error).message}`);
    }
  }
  return { results, errors, credits };
}

export async function pushCompanies(client: Client, companies: Org[], live: boolean, fits: Record<string, string> = {}, header = ''): Promise<{ results: { name: string; id: string; domain: string }[]; errors: string[] }> {
  const results: { name: string; id: string; domain: string }[] = [];
  const errors: string[] = [];
  if (!live) return { results: companies.map((c) => ({ name: c.name, id: '', domain: c.domain })), errors };
  const lp = lpOf(client);
  if (!lpReady(lp)) return { results, errors: ['Launchpad is not connected for this client.'] };
  for (const co of companies) {
    const facts = [co.industry && `Industry: ${co.industry}`, co.employees && `Size: ~${co.employees.toLocaleString()} employees`, co.revenue && `Revenue: $${co.revenue}`, co.founded && `Founded: ${co.founded}`].filter(Boolean).join(' · ');
    const desc = [co.description, facts, header && fits[co.id] ? `${header}: ${fits[co.id]}` : ''].filter(Boolean).join('\n\n');
    try {
      const id = await pushCompany(lp, { name: co.name, website: co.website, city: co.city, state: co.state, country: co.country, phone: co.phone, description: desc });
      results.push({ name: co.name, id, domain: co.domain });
    } catch (e) {
      errors.push(`Launchpad, ${co.name}: ${(e as Error).message}`);
    }
  }
  return { results, errors };
}
