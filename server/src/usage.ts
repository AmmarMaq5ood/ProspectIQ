import path from 'node:path';
import { appendLine, readLines, clientDir } from './store.js';
import { config } from './config.js';
import type { UsageRow } from './types.js';

/** Every research-database and GPT call is appended to the client's usage.jsonl. */

const SEARCH_EPS = ['/mixed_people/api_search', '/mixed_companies/search'];
const LOOKUP_EPS = ['/people/match', '/organizations/enrich', '/organizations/bulk_enrich'];

export function usageLog(slug: string, ctx: string, row: Omit<UsageRow, 't' | 'ctx'>): void {
  try {
    appendLine(path.join(clientDir(slug), 'usage.jsonl'), { t: Date.now(), ctx, ...row });
  } catch {
    // logging never breaks a search
  }
}

export function priceFor(model: string): [number, number] | null {
  for (const [prefix, p] of Object.entries(config.openaiPrices)) {
    if (model === prefix || model.startsWith(prefix)) return p;
  }
  return null;
}

export function usageRead(slug: string, days: number): UsageRow[] {
  const since = Date.now() - days * 86400000;
  return readLines<UsageRow>(path.join(clientDir(slug), 'usage.jsonl'), (r) => (r.t || 0) >= since);
}

export interface UsageSummary {
  days: number;
  rows: number;
  totals: {
    searches: number; lookups: number; credits: number; results: number;
    apollo_calls: number; apollo_errors: number; gpt_calls: number; gpt_errors: number;
    tokens_in: number; tokens_out: number; cost: number; cost_known: boolean;
    waterfall_calls: number; waterfall_found: number; waterfall_cost: number;
    maps_calls: number; maps_results: number;
  };
  by_day: { day: string; searches: number; credits: number; tokens: number; cost: number }[];
  by_ctx: Record<string, { searches: number; lookups: number; credits: number; gpt_calls: number; tokens: number; cost: number }>;
  by_model: Record<string, { calls: number; in: number; out: number; cost: number; known: boolean }>;
  by_ep: Record<string, number>;
  recent: UsageRow[];
}

export function usageCompute(rows: UsageRow[], days: number, timeZone: string): UsageSummary {
  const t = { searches: 0, lookups: 0, credits: 0, results: 0, apollo_calls: 0, apollo_errors: 0, gpt_calls: 0, gpt_errors: 0, tokens_in: 0, tokens_out: 0, cost: 0, cost_known: true, waterfall_calls: 0, waterfall_found: 0, waterfall_cost: 0, maps_calls: 0, maps_results: 0 };
  const dayKey = (ms: number) => new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(new Date(ms));
  const byDay = new Map<string, { day: string; searches: number; credits: number; tokens: number; cost: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(Date.now() - i * 86400000);
    byDay.set(k, { day: k, searches: 0, credits: 0, tokens: 0, cost: 0 });
  }
  const byCtx: UsageSummary['by_ctx'] = {};
  const byModel: UsageSummary['by_model'] = {};
  const byEp: Record<string, number> = {};
  for (const r of rows) {
    const d = byDay.get(dayKey(r.t)) || (() => { const v = { day: dayKey(r.t), searches: 0, credits: 0, tokens: 0, cost: 0 }; byDay.set(v.day, v); return v; })();
    const ctx = r.ctx || '(other)';
    const c = (byCtx[ctx] ||= { searches: 0, lookups: 0, credits: 0, gpt_calls: 0, tokens: 0, cost: 0 });
    if (r.p === 'apollo') {
      t.apollo_calls++;
      const ep = r.ep || '';
      byEp[ep] = (byEp[ep] || 0) + 1;
      if (!r.ok) { t.apollo_errors++; continue; }
      const credit = r.credit || 0;
      if (SEARCH_EPS.includes(ep)) { t.searches++; d.searches++; c.searches++; t.results += r.n || 0; }
      else if (LOOKUP_EPS.includes(ep)) { t.lookups++; c.lookups++; }
      t.credits += credit; d.credits += credit; c.credits += credit;
    } else if (r.p === 'serpapi' || r.p === 'gmaps') {
      t.maps_calls++;
      if (r.ok) { t.searches++; d.searches++; c.searches++; t.maps_results += r.n || 0; }
    } else if (r.p === 'treg') {
      t.waterfall_calls++;
      if (r.ok) { t.waterfall_found += r.n || 0; t.waterfall_cost += r.cost || 0; }
    } else if (r.p === 'openai') {
      t.gpt_calls++; c.gpt_calls++;
      if (!r.ok) { t.gpt_errors++; continue; }
      const inn = r.in || 0, out = r.out || 0, m = r.model || '';
      t.tokens_in += inn; t.tokens_out += out; d.tokens += inn + out; c.tokens += inn + out;
      const bm = (byModel[m] ||= { calls: 0, in: 0, out: 0, cost: 0, known: true });
      bm.calls++; bm.in += inn; bm.out += out;
      if (r.cost != null) { t.cost += r.cost; d.cost += r.cost; c.cost += r.cost; bm.cost += r.cost; }
      else { t.cost_known = false; bm.known = false; }
    }
  }
  return {
    days, rows: rows.length, totals: t,
    by_day: [...byDay.values()],
    by_ctx: Object.fromEntries(Object.entries(byCtx).sort((a, b) => (b[1].searches + b[1].lookups + b[1].gpt_calls) - (a[1].searches + a[1].lookups + a[1].gpt_calls))),
    by_model: byModel,
    by_ep: Object.fromEntries(Object.entries(byEp).sort((a, b) => b[1] - a[1])),
    recent: rows.slice().reverse().slice(0, 60),
  };
}
