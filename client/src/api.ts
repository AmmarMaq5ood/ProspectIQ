/** The one fetch wrapper, plus the small formatting helpers every page uses. */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let sampleFlag = false;
export const setSample = (on: boolean) => { sampleFlag = on; };
export const isSample = () => sampleFlag;

type Query = Record<string, string | number | boolean | undefined | null>;

export async function api<T>(path: string, opts: { method?: string; body?: unknown; query?: Query } = {}): Promise<T> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query || {})) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  if (sampleFlag) q.set('sample', '1');
  const qs = q.toString() ? `?${q}` : '';
  const method = opts.method || (opts.body !== undefined ? 'POST' : 'GET');
  const r = await fetch(`/api${path}${qs}`, {
    method,
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const text = await r.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 200) || `Request failed (${r.status})` }; }
  if (!r.ok) throw new ApiError(String(data.error || `Request failed (${r.status})`), r.status);
  return data as T;
}

export const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/* ---- numbers and dates ---- */

export const nf = (n: number | string | undefined | null): string => Number(n || 0).toLocaleString('en-US');

export function fmtN(n: number): string {
  if (n >= 1_000_000) return `${trim1(n / 1_000_000)}M`;
  if (n >= 10_000) return `${trim1(n / 1_000)}K`;
  return nf(Math.round(n));
}
const trim1 = (v: number) => v.toFixed(1).replace(/\.0$/, '');

export const money = (n: number): string => `$${fmtN(n)}`;

/** Dollars with enough decimals to show sub-cent GPT costs. */
export function usd(v: number): string {
  if (v === 0) return '$0.00';
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v < 1) return `$${v.toFixed(3)}`;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ago(ms: number): string {
  const d = Math.round((Date.now() - ms) / 1000);
  if (d < 90) return 'just now';
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) { const h = Math.round(d / 3600); return `${h} ${h === 1 ? 'hour' : 'hours'} ago`; }
  const days = Math.round(d / 86400);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function fmtWhen(ms: number, tz: string, withDay = false): string {
  if (!ms) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', ...(withDay ? { weekday: 'short' } : {}), month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

export function todayIn(tz: string): string {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/* ---- people cards ---- */

export function initials(first: string, last: string): string {
  return ((first.trim()[0] || '') + (last.replace(/\*/g, '').trim()[0] || '')).toUpperCase();
}

export function hue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export const fullName = (p: { first: string; last: string }) => `${p.first} ${p.last}`.trim();

export const hq = (c: { city?: string; state?: string; country?: string }) => [c.city, c.state, c.country === 'United States' ? 'US' : c.country].filter(Boolean).join(', ');

export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The People tab, limited to one company's buyers. */
export const peopleAtHref = (domain: string) => `/people?domains=${encodeURIComponent(domain)}&sen=${encodeURIComponent('owner|c_suite|vp|head|director|manager')}`;

export const ctxLabel = (c: string): string => {
  const map: Record<string, string> = { 'research:ask': 'Ask', 'research:people': 'People', 'research:companies': 'Companies', 'research:industries': 'Industries', 'research:lookup': 'Company lookup', usage: 'Usage page', 'admin:draft': 'Admin · profile draft', me: 'Sign-in' };
  if (map[c]) return map[c];
  if (c.startsWith('finder:')) return `Finder · ${c.slice(7)}`;
  return c;
};
