import path from 'node:path';
import { appendLine, clientDir, readLines } from './store.js';
import { agencySettings, getClient, saveClient } from './clients.js';
import type { Client, CreditEntry } from './types.js';
import { logActivity } from './activity.js';

/**
 * Monthly credits. Searching is free; one credit is spent for each lead that
 * lands in Launchpad as a new contact with a work email. Every client gets a
 * monthly allowance (1,000 by default) that resets on the 1st in the client's
 * timezone; the agency can raise the allowance or add bonus credits for the
 * current month. Every change is appended to credits.jsonl.
 */

export const DEFAULT_MONTHLY = 1000;

/** "2026-10" in the client's timezone. */
export function currentPeriod(timeZone: string, now = Date.now()): string {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit' }).formatToParts(new Date(now)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}`;
  } catch {
    const d = new Date(now);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
}

/** The first day of the next month, as "2026-11-01" and as "Nov 1, 2026". */
export function resetDate(timeZone: string, now = Date.now()): { iso: string; label: string } {
  const [y, m] = currentPeriod(timeZone, now).split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const iso = `${ny}-${String(nm).padStart(2, '0')}-01`;
  const label = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(Date.UTC(ny, nm - 1, 1)));
  return { iso, label };
}

export const creditsTotal = (c: Client): number => Math.max(0, (c.credits?.monthly || 0) + (c.credits?.extra || 0));
export const creditsLeft = (c: Client): number => Math.max(0, creditsTotal(c) - (c.credits?.used || 0));

const file = (slug: string) => path.join(clientDir(slug), 'credits.jsonl');

/** New month: the counter starts again. Called whenever a client record is read. Returns true when it rolled over. */
export function rollover(c: Client, save = true): boolean {
  const period = currentPeriod(c.launchpad?.timezone || 'UTC');
  if (c.credits.period === period) return false;
  const had = c.credits.period;
  c.credits = { ...c.credits, used: 0, extra: 0, period };
  if (save) {
    saveClient(c);
    if (had) {
      appendLine(file(c.slug), { t: Date.now(), delta: 0, reason: `monthly reset (${period}): ${c.credits.monthly.toLocaleString('en-US')} credits`, by: 'system', left: creditsLeft(c) } satisfies CreditEntry);
      logActivity(c.slug, { kind: 'credits', title: 'Monthly credits reset', detail: `${c.credits.monthly.toLocaleString('en-US')} credits for ${period}`, by: 'system', ok: true });
    }
  }
  return true;
}

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

/** Bonus credits for the current month only (they vanish at the reset). */
export function addCredits(client: Client, n: number, reason: string, by = 'admin'): Client {
  const c = fresh(client);
  c.credits.extra = Math.max(0, (c.credits.extra || 0) + Math.round(n));
  saveClient(c);
  appendLine(file(c.slug), { t: Date.now(), delta: Math.round(n), reason: `${reason} (this month)`, by, left: creditsLeft(c) } satisfies CreditEntry);
  logActivity(c.slug, { kind: 'credits', title: n > 0 ? `${Math.round(n).toLocaleString('en-US')} bonus credits added for this month` : `${Math.abs(Math.round(n)).toLocaleString('en-US')} credits removed for this month`, detail: `${creditsLeft(c).toLocaleString('en-US')} left`, by: by as 'admin', ok: true });
  return c;
}

/** The allowance every month from now on. */
export function setMonthly(client: Client, monthly: number, by = 'admin'): Client {
  const c = fresh(client);
  const next = Math.max(0, Math.round(monthly));
  const delta = next - c.credits.monthly;
  if (delta === 0) return c;
  c.credits.monthly = next;
  saveClient(c);
  appendLine(file(c.slug), { t: Date.now(), delta, reason: `monthly allowance set to ${next.toLocaleString('en-US')}`, by, left: creditsLeft(c) } satisfies CreditEntry);
  logActivity(c.slug, { kind: 'credits', title: `Monthly allowance set to ${next.toLocaleString('en-US')}`, detail: `${creditsLeft(c).toLocaleString('en-US')} left this month`, by: by as 'admin', ok: true });
  return c;
}

/** Back to 100% of the monthly allowance: used goes to zero, this month's bonus is cleared. */
export function restoreFull(client: Client, by = 'admin'): Client {
  const c = fresh(client);
  const before = creditsLeft(c);
  c.credits.used = 0;
  c.credits.extra = 0;
  saveClient(c);
  const delta = creditsLeft(c) - before;
  appendLine(file(c.slug), { t: Date.now(), delta, reason: `restored to the full monthly allowance (${c.credits.monthly.toLocaleString('en-US')})`, by, left: creditsLeft(c) } satisfies CreditEntry);
  logActivity(c.slug, { kind: 'credits', title: `Credits restored to the full monthly allowance (${c.credits.monthly.toLocaleString('en-US')})`, detail: `${delta >= 0 ? '+' : ''}${delta.toLocaleString('en-US')} · ${creditsLeft(c).toLocaleString('en-US')} left this month`, by: by as 'admin', ok: true });
  return c;
}

export function creditLedger(slug: string, limit = 60): CreditEntry[] {
  return readLines<CreditEntry>(file(slug), () => true).slice(-limit).reverse();
}

/** What a client sees about their credits. */
export function creditsView(c: Client) {
  const r = resetDate(c.launchpad.timezone);
  return { monthly: c.credits.monthly, extra: c.credits.extra || 0, used: c.credits.used, total: creditsTotal(c), left: creditsLeft(c), period: c.credits.period, resets_on: r.iso, resets_label: r.label };
}

/** The out-of-credits line, as Tabish asked for it: the reset date and who to email for a bigger plan. */
export function outOfCreditsText(c: Client): string {
  const r = resetDate(c.launchpad.timezone);
  const support = agencySettings().support_email;
  return `You are out of credits. Your ${c.credits.monthly.toLocaleString('en-US')} monthly credits reset on ${r.label}.${support ? ` To upgrade your plan, email ${support}.` : ' Contact your Launchpad team to upgrade your plan.'}`;
}

/** The message a client sees when a push would need more credits than are left ('' when fine). */
export function creditCheck(client: Client, need: number): string {
  const left = creditsLeft(client);
  if (left <= 0) return outOfCreditsText(client);
  if (need > left) return `Only ${left} credit${left === 1 ? '' : 's'} left this month and ${need} of the ticked leads have an email. Untick ${need - left}, or wait for the reset on ${resetDate(client.launchpad.timezone).label}.`;
  return '';
}
