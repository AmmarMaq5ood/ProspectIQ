import path from 'node:path';
import { cached, clientDir, readJson, writeJson } from './store.js';
import { contactsAtCompany, contactsWithTag, lpOf, lpReady, type LpContact } from './launchpad.js';
import type { Client, Person } from './types.js';

/**
 * "Already in Launchpad": three layers, cheapest first.
 *  1. pushed.json: research id → contact id for everything this app pushed (exact).
 *  2. Every contact tagged "research" in the sub-account (what any version of
 *     the tool pushed), cached ten minutes, matched by name + company.
 *  3. Contacts at the same company, by company name, for people added by hand.
 * A masked surname ("Wh***d") still matches on its visible letters.
 */

export interface PushedEntry { id: string; name: string; t: number }

const pushedFile = (slug: string) => path.join(clientDir(slug), 'pushed.json');

export function pushedIndex(slug: string): Record<string, PushedEntry> {
  return readJson<Record<string, PushedEntry>>(pushedFile(slug), {});
}

export function markPushed(slug: string, entries: { researchId: string; lpId: string; name: string }[]): void {
  const idx = pushedIndex(slug);
  let changed = false;
  for (const e of entries) {
    if (!e.researchId || !e.lpId) continue;
    idx[e.researchId] = { id: e.lpId, name: e.name, t: Date.now() };
    changed = true;
  }
  if (changed) writeJson(pushedFile(slug), idx);
}

/** Company names as people write them differ ("Crane Pumps & Systems Inc."): compare the core words. */
export function normCo(s: string): string {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|gmbh|sa|srl|plc|holdings|group|the)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Does this Launchpad contact look like this (possibly masked) research result? */
export function matchesPerson(c: LpContact, p: Person): boolean {
  if (p.email && c.email && p.email.toLowerCase() === c.email) return true;
  const first = p.first.trim().toLowerCase();
  if (!first || c.first.trim().toLowerCase() !== first) return false;
  const last = p.last.trim().toLowerCase();
  const cl = c.last.trim().toLowerCase();
  if (p.last_obf || last.includes('*')) {
    const m = /^([a-z'-]*)\*+([a-z'-]*)$/.exec(last);
    if (!m) return false;
    if (!cl.startsWith(m[1]) || !cl.endsWith(m[2]) || cl.length < m[1].length + m[2].length) return false;
  } else if (last && cl !== last) {
    return false;
  }
  const coOk = !!(p.company && c.company) && normCo(c.company) === normCo(p.company);
  const domOk = !!(p.domain && c.email) && c.email.endsWith(`@${p.domain.toLowerCase()}`);
  return coOk || domOk;
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const x = items[i++];
      try { await fn(x); } catch { /* best effort */ }
    }
  }));
}

/** Tag the people who are already Launchpad contacts. Mutates and returns the rows. */
export async function annotateInLaunchpad(client: Client, people: Person[], live: boolean): Promise<Person[]> {
  const idx = pushedIndex(client.slug);
  for (const p of people) {
    const hit = idx[p.id];
    if (hit) p.in_lp = { id: hit.id, name: hit.name };
  }
  const lp = lpOf(client);
  if (!live || !lpReady(lp) || people.every((p) => p.in_lp)) return people;
  try {
    const tagged = await cached(client.slug, 'lp-tagged-research', 600, () => contactsWithTag(lp, 'research'));
    for (const p of people) {
      if (p.in_lp) continue;
      const hit = tagged.find((c) => matchesPerson(c, p));
      if (hit) p.in_lp = { id: hit.id, name: `${hit.first} ${hit.last}`.trim() };
    }
  } catch { /* the tag index is best effort */ }
  const companies = [...new Set(people.filter((p) => !p.in_lp && p.company).map((p) => p.company))].slice(0, 40);
  await pool(companies, 5, async (co) => {
    const rows = await cached(client.slug, `lp-co:${normCo(co)}`, 600, () => contactsAtCompany(lp, co));
    for (const p of people) {
      if (p.in_lp || p.company !== co) continue;
      const hit = rows.find((c) => matchesPerson(c, p));
      if (hit) p.in_lp = { id: hit.id, name: `${hit.first} ${hit.last}`.trim() };
    }
  });
  return people;
}
