import { enrichPerson, orgShape, type ApolloCtx } from './apollo.js';
import { draftNote, lpOf, lpReady, pushCompany, pushProspect, roleFromTitle, sizeBucket } from './launchpad.js';
import { sampleEnrich } from './samples.js';
import { markPushed } from './lpindex.js';
import { effectiveKeys } from './clients.js';
import { creditsLeft } from './credits.js';
import { waterfall, type TregCtx } from './treg.js';
import type { Client, Org, Person, PushResult } from './types.js';

/** Push flows shared by the Scout tab, the People/Companies tabs and the finders. */

export interface WaterfallPlan { ctx: TregCtx; budgetMs: number }
export interface PushPeopleOpts { live: boolean; apollo: ApolloCtx; tags?: string[]; noteHeader?: string; fits?: Record<string, string>; waterfall?: WaterfallPlan }
export interface WaterfallOutcome { tried: number; found: number }

/** The email waterfall for this client, when it is switched on and a key is set: manual pushes get a short budget, finders a longer one. */
export function waterfallPlan(client: Client, mode: 'manual' | 'finder', ctx: string): WaterfallPlan | undefined {
  const key = effectiveKeys(client).treg;
  if (!client.flags.email_waterfall || !key) return undefined;
  return { ctx: { slug: client.slug, key, ctx }, budgetMs: mode === 'manual' ? 30000 : 90000 };
}

/** Run the waterfall for the people still without an email, never past the credits the client has left. Mutates them. */
export async function fillEmails(client: Client, plan: WaterfallPlan | undefined, people: Person[]): Promise<WaterfallOutcome | undefined> {
  if (!plan || !people.some((p) => !p.email)) return undefined;
  const room = Math.max(0, creditsLeft(client) - people.filter((p) => p.email).length);
  if (room <= 0) return undefined;
  const r = await waterfall(plan.ctx, people, { budgetMs: plan.budgetMs, maxFinds: room });
  return { tried: r.tried, found: r.found };
}

/** `credits` = lookups that ended with an email; `spent` = leads that became new Launchpad contacts with an email (what the client's pool is charged); `waterfall` = how the email waterfall did, when it ran. */
export async function pushPeople(client: Client, people: Person[], roles: Record<string, string>, opts: PushPeopleOpts): Promise<{ results: PushResult[]; errors: string[]; credits: number; spent: number; waterfall?: WaterfallOutcome }> {
  const errors: string[] = [];
  const groups = new Map<string, { org: Org; contacts: Person[] }>();
  let credits = 0;
  // 1. the research lookup for everyone
  const enriched: Person[] = [];
  for (let p of people) {
    const before = `${p.first} ${p.last}`.trim();
    p.role = client.profile.roles.includes(roles[p.id] || '') ? roles[p.id] : roleFromTitle(p.title, client.profile.roles);
    try {
      p = opts.live ? await enrichPerson(opts.apollo, p, p.domain) : sampleEnrich(p);
    } catch (e) {
      errors.push(`Could not look up ${before}: ${(e as Error).message}`);
      continue;
    }
    if (p.email) p.email_source = 'research';
    enriched.push(p);
  }
  // 2. the email waterfall for those still without one
  const wf = opts.live ? await fillEmails(client, opts.waterfall, enriched) : undefined;
  // 3. credits, tags, grouping by company
  for (const p of enriched) {
    if (p.email) credits++;
    if (p.last_obf) p.last = '';
    if (opts.tags) p.tags = [...new Set([...opts.tags, ...(p.tags || []).filter((t) => t.startsWith('email-'))])];
    const org = p.org && p.org.name ? p.org : orgShape({ name: p.company }, p.domain);
    if (!org.name) org.name = org.domain || 'Unknown company';
    const key = (org.domain || org.name).toLowerCase();
    const g = groups.get(key) || { org, contacts: [] };
    g.contacts.push(p);
    groups.set(key, g);
  }
  const results: PushResult[] = [];
  if (!groups.size) return { results, errors: errors.length ? errors : ['None of the ticked people could be looked up.'], credits, spent: 0, waterfall: wf };
  if (!opts.live) {
    for (const g of groups.values()) results.push({ company: { name: g.org.name, id: '' }, contacts: g.contacts.map((c) => ({ name: `${c.first} ${c.last}`.trim(), role: c.role || '', id: '', new: true, email: c.email })), note_added: true, opportunity: { id: '', name: `${g.org.name} — outreach`, created: true }, log: ['sample mode: nothing written'] });
    return { results, errors, credits: 0, spent: 0, waterfall: wf };
  }
  const lp = lpOf(client);
  if (!lpReady(lp)) return { results, errors: ['Launchpad is not connected for this client.'], credits, spent: 0, waterfall: wf };
  let spent = 0;
  for (const g of groups.values()) {
    let [note, message] = draftNote(client.profile, g.org, g.contacts);
    if (opts.noteHeader) {
      const lines = [opts.noteHeader, ...g.contacts.map((c) => `- ${c.first} ${c.last} (${c.title}): ${opts.fits?.[c.id] || ''}`.trim())];
      note = lines.join('\n') + '\n\n' + note;
    }
    try {
      const r = await pushProspect(lp, { company: { name: g.org.name, website: g.org.website, city: g.org.city, state: g.org.state, country: g.org.country, phone: g.org.phone, description: g.org.description, industry: g.org.industry, size: sizeBucket(g.org.employees) }, contacts: g.contacts, note, message });
      results.push(r);
      spent += countSpent(r);
      markPushed(client.slug, r.contacts.map((c, i) => ({ researchId: g.contacts[i]?.id || '', lpId: c.id, name: c.name })));
    } catch (e) {
      errors.push(`Launchpad, ${g.org.name}: ${(e as Error).message}`);
    }
  }
  return { results, errors, credits, spent, waterfall: wf };
}

/** A credit per contact that was created in Launchpad with a work email. Updates of existing contacts are free. */
export function countSpent(r: PushResult): number {
  return r.contacts.filter((c) => c.id && c.new && c.email).length;
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
