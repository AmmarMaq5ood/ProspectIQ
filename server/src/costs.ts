import path from 'node:path';
import { clientDir, readLines } from './store.js';
import type { UsageRow } from './types.js';

/**
 * The agency's cost report: what every client's research-database and GPT
 * calls cost, month by month, and for one month by account, by feature, by
 * model and by day. Built from each client's usage.jsonl (every call is
 * logged there with its tokens, credits and, when the model has a price,
 * its dollar cost). Research credits are priced with the agency's
 * per-credit rate from Settings (0 = not set, counts only).
 */

const SEARCH_EPS = ['/mixed_people/api_search', '/mixed_companies/search'];
const LOOKUP_EPS = ['/people/match', '/organizations/enrich', '/organizations/bulk_enrich'];

export interface CostLine { gpt: number; gpt_known: boolean; credits: number; research: number; total: number; searches: number; lookups: number; gpt_calls: number; tokens: number; errors: number }
export interface CostReport {
  months: ({ month: string; label: string } & CostLine)[];
  selected: string;
  label: string;
  credit_cost: number;
  totals: CostLine & { clients_active: number; top_client: string; top_share: number; calls: number };
  clients: ({ slug: string; name: string; share: number; by_feature: Record<string, CostLine> } & CostLine)[];
  features: ({ feature: string; share: number } & CostLine)[];
  models: { model: string; calls: number; in: number; out: number; cost: number; known: boolean }[];
  days: ({ day: string } & CostLine)[];
}

export interface ClientUsage { slug: string; name: string; timezone: string; rows: UsageRow[] }

export const emptyLine = (): CostLine => ({ gpt: 0, gpt_known: true, credits: 0, research: 0, total: 0, searches: 0, lookups: 0, gpt_calls: 0, tokens: 0, errors: 0 });

/** YYYY-MM of a moment in a timezone. */
export function monthKey(ms: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).format(new Date(ms)).slice(0, 7);
  } catch {
    return new Date(ms).toISOString().slice(0, 7);
  }
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, (m || 1) - 1, 1)));
}

/** The last n month keys, oldest first, ending with the current month (UTC calendar). */
export function lastMonths(n: number, now = Date.now()): string[] {
  const d = new Date(now);
  let y = d.getUTCFullYear(), m = d.getUTCMonth();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m + 1).padStart(2, '0')}`);
    m--; if (m < 0) { m = 11; y--; }
  }
  return out;
}

/** Which feature a logged call belongs to, in the words the admin uses. */
export function featureOf(ctx: string): string {
  const map: Record<string, string> = { 'research:ask': 'Ask', 'research:people': 'People tab', 'research:companies': 'Companies tab', 'research:industries': 'Industries tab', 'research:lookup': 'Company lookup', 'admin:draft': 'Admin: profile draft', usage: 'Usage page', me: 'Sign-in' };
  if (map[ctx]) return map[ctx];
  if (ctx.startsWith('finder:')) return 'Daily finders';
  return 'Other';
}

export function addRow(line: CostLine, r: UsageRow, creditCost: number): void {
  if (r.p === 'apollo') {
    if (!r.ok) { line.errors++; return; }
    const ep = r.ep || '';
    if (SEARCH_EPS.includes(ep)) line.searches++;
    else if (LOOKUP_EPS.includes(ep)) line.lookups++;
    const credit = r.credit || 0;
    line.credits += credit;
    line.research += credit * creditCost;
  } else if (r.p === 'openai') {
    line.gpt_calls++;
    if (!r.ok) { line.errors++; return; }
    line.tokens += (r.in || 0) + (r.out || 0);
    if (r.cost != null) line.gpt += r.cost;
    else line.gpt_known = false;
  }
  line.total = line.gpt + line.research;
}

const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

export function costReport(clients: ClientUsage[], opts: { months?: number; selected?: string; creditCost?: number; now?: number } = {}): CostReport {
  const now = opts.now ?? Date.now();
  const keys = lastMonths(Math.max(1, Math.min(24, opts.months || 12)), now);
  const selected = opts.selected && /^\d{4}-\d{2}$/.test(opts.selected) ? opts.selected : keys[keys.length - 1];
  const cc = Math.max(0, opts.creditCost || 0);

  const months = new Map<string, { month: string; label: string } & CostLine>();
  for (const k of keys) months.set(k, { month: k, label: monthLabel(k), ...emptyLine() });
  const perClient: CostReport['clients'] = [];
  const features = new Map<string, { feature: string; share: number } & CostLine>();
  const models = new Map<string, CostReport['models'][number]>();
  const days = new Map<string, { day: string } & CostLine>();
  const totals = { ...emptyLine(), clients_active: 0, top_client: '', top_share: 0, calls: 0 };
  const dayLabel = (ms: number, tz: string) => new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' }).format(new Date(ms));

  for (const c of clients) {
    const line: CostReport['clients'][number] = { slug: c.slug, name: c.name, share: 0, by_feature: {}, ...emptyLine() };
    let active = false;
    for (const r of c.rows) {
      const mk = monthKey(r.t, c.timezone);
      const m = months.get(mk);
      if (m) addRow(m, r, cc);
      if (mk !== selected) continue;
      active = true;
      totals.calls++;
      addRow(line, r, cc);
      addRow(totals, r, cc);
      const fk = featureOf(r.ctx || '');
      addRow(line.by_feature[fk] ||= emptyLine(), r, cc);
      const f = features.get(fk) || (() => { const v = { feature: fk, share: 0, ...emptyLine() }; features.set(fk, v); return v; })();
      addRow(f, r, cc);
      const dk = dayLabel(r.t, c.timezone);
      const d = days.get(dk) || (() => { const v = { day: dk, ...emptyLine() }; days.set(dk, v); return v; })();
      addRow(d, r, cc);
      if (r.p === 'openai' && r.ok) {
        const mk2 = r.model || '(unknown model)';
        const mo = models.get(mk2) || (() => { const v = { model: mk2, calls: 0, in: 0, out: 0, cost: 0, known: true }; models.set(mk2, v); return v; })();
        mo.calls++; mo.in += r.in || 0; mo.out += r.out || 0;
        if (r.cost != null) mo.cost += r.cost; else mo.known = false;
      }
    }
    if (active) { totals.clients_active++; perClient.push(line); }
  }
  for (const l of perClient) l.share = share(l.total, totals.total);
  perClient.sort((a, b) => b.total - a.total || b.credits - a.credits || b.gpt_calls - a.gpt_calls);
  const feats = [...features.values()];
  for (const f of feats) f.share = share(f.total, totals.total);
  feats.sort((a, b) => b.total - a.total || (b.searches + b.lookups + b.gpt_calls) - (a.searches + a.lookups + a.gpt_calls));
  if (perClient.length) { totals.top_client = perClient[0].name; totals.top_share = perClient[0].share; }
  // days in the order they happened (labels are per-client-timezone day names within the month)
  const dayRows = [...days.values()];
  return {
    months: [...months.values()],
    selected,
    label: monthLabel(selected),
    credit_cost: cc,
    totals,
    clients: perClient,
    features: feats,
    models: [...models.values()].sort((a, b) => b.cost - a.cost || b.calls - a.calls),
    days: dayRows,
  };
}

/** Every logged call for a client since a moment (the report reads a year back). */
export function usageReadSince(slug: string, sinceMs: number): UsageRow[] {
  return readLines<UsageRow>(path.join(clientDir(slug), 'usage.jsonl'), (r) => (r.t || 0) >= sinceMs);
}
