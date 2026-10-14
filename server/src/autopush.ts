import { agencySettings, getClient, saveClient } from './clients.js';
import type { Client } from './types.js';

/**
 * The daily cap on automatic pushes: how many leads the finders may add to
 * Launchpad per calendar day (client's timezone), across all of a client's
 * finders together. Default 50; the agency raises it per client in admin.
 * Manual pushes from the research tabs are not counted (credits limit those).
 */

export const DEFAULT_AUTO_PUSH_DAILY = 50;

/** YYYY-MM-DD for "now" in a timezone. */
export function dayKeyIn(timeZone: string, now = Date.now()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  } catch {
    return new Date(now).toISOString().slice(0, 10);
  }
}

export interface AutoPushView { daily: number; used: number; left: number; day: string; timezone: string }

/** Today's state. A new day starts the count again (not saved here; spending saves). */
export function autoPushState(c: Client, now = Date.now()): AutoPushView {
  const tz = c.launchpad.timezone || 'UTC';
  const day = dayKeyIn(tz, now);
  const ap = c.auto_push || { daily: DEFAULT_AUTO_PUSH_DAILY, day: '', used: 0 };
  const used = ap.day === day ? ap.used : 0;
  const daily = Math.max(0, ap.daily);
  return { daily, used, left: Math.max(0, daily - used), day, timezone: tz };
}

/** Count leads a finder just pushed. Re-reads the record first so two runs never overwrite each other. */
export function autoPushSpend(client: Client, n: number, now = Date.now()): AutoPushView {
  if (n <= 0) return autoPushState(client, now);
  const c = getClient(client.slug) || client;
  const st = autoPushState(c, now);
  c.auto_push = { daily: st.daily, day: st.day, used: st.used + n };
  saveClient(c);
  client.auto_push = c.auto_push;
  return autoPushState(c, now);
}

export function setAutoPushDaily(client: Client, daily: number): Client {
  const c = getClient(client.slug) || client;
  const st = autoPushState(c);
  c.auto_push = { daily: Math.max(0, Math.round(daily)), day: st.day, used: st.used };
  saveClient(c);
  return c;
}

/** What the client reads when the finders have hit today's cap. */
export function autoPushLimitText(c: Client): string {
  const st = autoPushState(c);
  const email = agencySettings().support_email || '';
  return `Today's limit of ${st.daily} automatic push${st.daily === 1 ? '' : 'es'} is reached, so the finders pause until tomorrow.${email ? ` To raise the limit, email ${email}.` : ''}`;
}
