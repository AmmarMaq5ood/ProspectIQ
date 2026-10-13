import path from 'node:path';
import { appendLine, clientDir, readLines } from './store.js';
import { getClient, saveClient } from './clients.js';
import type { Client, CreditEntry } from './types.js';

/**
 * The credit pool. Searching is free; one credit is spent for each lead that
 * lands in Launchpad as a new contact with a work email. The pool is one-time:
 * the agency tops it up in the admin panel. Every change is appended to the
 * client's credits.jsonl so the admin can see where they went.
 */

export const creditsLeft = (c: Client): number => Math.max(0, (c.credits?.total || 0) - (c.credits?.used || 0));

const file = (slug: string) => path.join(clientDir(slug), 'credits.jsonl');

/** Re-read the record first so two pushes in flight never overwrite each other's counter. */
function fresh(client: Client): Client {
  return getClient(client.slug) || client;
}

export function spendCredits(client: Client, n: number, reason: string, by = 'client'): number {
  if (n <= 0) return creditsLeft(client);
  const c = fresh(client);
  c.credits.used += n;
  saveClient(c);
  client.credits = c.credits;
  appendLine(file(c.slug), { t: Date.now(), delta: -n, reason, by, left: creditsLeft(c) } satisfies CreditEntry);
  return creditsLeft(c);
}

export function addCredits(client: Client, n: number, reason: string, by = 'admin'): Client {
  const c = fresh(client);
  c.credits.total = Math.max(0, c.credits.total + Math.round(n));
  saveClient(c);
  appendLine(file(c.slug), { t: Date.now(), delta: Math.round(n), reason, by, left: creditsLeft(c) } satisfies CreditEntry);
  return c;
}

export function setCreditsTotal(client: Client, total: number, by = 'admin'): Client {
  const c = fresh(client);
  const next = Math.max(0, Math.round(total));
  const delta = next - c.credits.total;
  if (delta === 0) return c;
  c.credits.total = next;
  saveClient(c);
  appendLine(file(c.slug), { t: Date.now(), delta, reason: 'pool set in admin', by, left: creditsLeft(c) } satisfies CreditEntry);
  return c;
}

export function creditLedger(slug: string, limit = 60): CreditEntry[] {
  return readLines<CreditEntry>(file(slug), () => true).slice(-limit).reverse();
}

/** The message a client sees when a push would need more credits than are left. */
export function creditCheck(client: Client, need: number): string {
  const left = creditsLeft(client);
  if (left <= 0) return 'No credits left. Ask your Launchpad team to top up before pushing more leads.';
  if (need > left) return `Only ${left} credit${left === 1 ? '' : 's'} left and ${need} of the ticked leads have an email. Untick ${need - left} or ask your Launchpad team to top up.`;
  return '';
}
