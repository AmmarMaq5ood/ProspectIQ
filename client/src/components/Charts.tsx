import { useState, type ReactNode } from 'react';
import { nf } from '../api';

/**
 * The charts in the reference's language, built as plain HTML so they share
 * the theme tokens and dark mode: dot-matrix columns for a count per day, thin
 * stacked bars for cost by month, a delta chip for a stat tile, a two-tone
 * progress bar. One hover layer each (tooltip on the column or bar), a table
 * view alongside, and no colour that is not also written out.
 */

export const CHART = { violet: 'violet', mint: 'mint', amber: 'amber', rose: 'rose' } as const;
export type ChartColor = keyof typeof CHART;

export interface DotPoint { label: string; value: number; filled?: number; sub?: string }

/** Which x labels to show: one every `every` columns, plus the highlighted column, with the neighbours of the highlighted one hidden so nothing collides. */
function axisLabels(n: number, every: number, focus: number): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < n; i += every) out.add(i);
  if (n > 1 && !out.has(n - 1) && (n - 1) % every >= Math.ceil(every / 2)) out.add(n - 1);
  if (focus >= 0 && focus < n) {
    for (const i of [...out]) if (i !== focus && Math.abs(i - focus) < Math.max(2, Math.ceil(every / 2))) out.delete(i);
    out.add(focus);
  }
  return out;
}

/** Tooltips near either edge anchor to that edge instead of centring, so they stay inside the card. */
const tipSide = (i: number, n: number): string => (n < 4 ? '' : i < n * 0.2 ? ' tip-l' : i > n * 0.8 ? ' tip-r' : '');

/** Columns of dots: the tallest column gets `maxDots`, the rest scale. `filled` (optional) draws that many dots solid and the rest hollow, e.g. found vs tried. */
export function DotColumns({ data, color = 'mint', maxDots = 12, format = nf, selected, onSelect, labelEvery, empty = 'Nothing in this period yet.', title }: { data: DotPoint[]; color?: ChartColor; maxDots?: number; format?: (n: number) => string; selected?: string; onSelect?: (label: string) => void; labelEvery?: number; empty?: string; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length || !data.some((d) => d.value > 0)) return <p className="empty">{empty}</p>;
  const max = Math.max(...data.map((d) => d.value));
  const every = labelEvery || Math.max(1, Math.ceil(data.length / 8));
  const maxIdx = data.findIndex((d) => d.value === max);
  const onIdx = selected ? data.findIndex((d) => d.label === selected) : maxIdx;
  const dotsFor = (v: number) => (v <= 0 ? 0 : Math.max(1, Math.round((v / max) * maxDots)));
  const labels = axisLabels(data.length, every, hover ?? onIdx);
  return (
    <div className={`dots c-${color}`} role="img" aria-label={title}>
      <div className="dots-plot" style={{ ['--rows' as string]: maxDots }}>
        {data.map((d, i) => {
          const n = dotsFor(d.value);
          const fill = d.filled == null ? n : Math.min(n, Math.round((d.filled / max) * maxDots));
          const on = i === onIdx;
          const show = hover === i || (hover == null && on && d.value > 0);
          return (
            <button type="button" className={`dots-col${on ? ' on' : ''}${hover === i ? ' hov' : ''}`} key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => onSelect?.(d.label)} aria-label={`${d.label}: ${format(d.value)}${d.sub ? `, ${d.sub}` : ''}`}>
              {show && <span className={`dots-tip${tipSide(i, data.length)}`}><b>{d.filled == null ? format(d.value) : <>{format(d.filled)} <span className="of">of {format(d.value)}</span></>}</b><small>{d.label}{d.sub ? ` · ${d.sub}` : ''}</small></span>}
              <span className="dots-stack">
                {Array.from({ length: n }, (_, k) => <i key={k} className={`dot${k >= fill ? ' off' : ''}`} />)}
              </span>
              <span className={`dots-x${labels.has(i) ? '' : ' quiet'}`}>{d.label.replace(/ \d{4}$/, '')}</span>
            </button>
          );
        })}
      </div>
      <details className="tbl"><summary>Table</summary>
        <table><thead><tr><th scope="col">When</th><th scope="col" className="num">Value</th>{data.some((d) => d.filled != null) && <th scope="col" className="num">Of which</th>}</tr></thead>
          <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td className="num">{format(d.value)}</td>{data.some((x) => x.filled != null) && <td className="num">{d.filled == null ? '—' : format(d.filled)}</td>}</tr>)}</tbody></table>
      </details>
    </div>
  );
}

export interface Series { key: string; label: string; color: ChartColor }
export interface StackPoint { label: string; parts: Record<string, number>; total: number; note?: string }

/** Thin stacked columns with a 2px gap between segments, a legend (two or more series), the selected and tallest columns labelled, a tooltip on hover. */
export function StackedBars({ data, series, format, selected, onSelect, title, empty = 'Nothing in this period yet.' }: { data: StackPoint[]; series: Series[]; format: (n: number) => string; selected?: string; onSelect?: (label: string) => void; title: string; empty?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length || !data.some((d) => d.total > 0)) return <p className="empty">{empty}</p>;
  const max = Math.max(...data.map((d) => d.total));
  const maxIdx = data.findIndex((d) => d.total === max);
  const onIdx = selected ? data.findIndex((d) => d.label === selected) : maxIdx;
  return (
    <div className="sbars" role="img" aria-label={title}>
      {series.length > 1 && <div className="legend-chips">{series.map((s) => <span key={s.key} className={`lg c-${s.color}`}><i />{s.label}</span>)}</div>}
      <div className="sbars-plot">
        {data.map((d, i) => {
          const on = i === onIdx;
          const show = hover === i || (hover == null && on && d.total > 0);
          return (
            <button type="button" className={`sbar${on ? ' on' : ''}${hover === i ? ' hov' : ''}`} key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => onSelect?.(d.label)} aria-label={`${d.label}: ${format(d.total)}`}>
              {show && (
                <span className={`dots-tip wide${tipSide(i, data.length)}`}><b>{format(d.total)}</b>
                  {series.filter((s) => (d.parts[s.key] || 0) > 0).map((s) => <span key={s.key} className={`lg c-${s.color}`}><i />{s.label} {format(d.parts[s.key] || 0)}</span>)}
                  <small>{d.label}{d.note ? ` · ${d.note}` : ''}</small>
                </span>
              )}
              <span className="sbar-stack">
                {series.map((s) => { const v = d.parts[s.key] || 0; return v > 0 ? <i key={s.key} className={`seg c-${s.color}`} style={{ height: `${(v / max) * 100}%` }} /> : null; })}
              </span>
              <span className="dots-x">{d.label.replace(/ \d{4}$/, '')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "+12% vs the previous 30 days": the change between two totals, as a chip. `invert` makes a fall the good direction (costs). */
export function Delta({ now, prev, than = 'the period before', invert, format }: { now: number; prev?: number | null; than?: string; invert?: boolean; format?: (n: number) => string }) {
  if (prev == null) return null;
  if (!prev && !now) return <span className="tr">no change</span>;
  if (!prev) return <span className="tr good">new this period</span>;
  const pct = Math.round(((now - prev) / prev) * 100);
  const up = now >= prev;
  const good = invert ? !up : up;
  const same = pct === 0;
  return <span className={`tr ${same ? '' : good ? 'good' : 'bad'}`} title={`${format ? format(prev) : nf(prev)} ${than}`}>{same ? 'level' : `${up ? '+' : ''}${pct}%`} <span className="was">vs {than}</span></span>;
}

/** A two-tone bar with the two numbers under it: used and left, signed and open, found and missed. */
export function Progress({ a, b, aLabel, bLabel, color = 'mint', format = nf, children }: { a: number; b: number; aLabel: string; bLabel: string; color?: ChartColor; format?: (n: number) => string; children?: ReactNode }) {
  const total = a + b;
  const pct = total > 0 ? Math.round((a / total) * 100) : 0;
  return (
    <div className={`prog c-${color}`}>
      <div className="prog-bar" role="img" aria-label={`${aLabel} ${format(a)}, ${bLabel} ${format(b)}`}><span className="prog-a" style={{ width: `${pct}%` }} /><span className="prog-mark" style={{ left: `${pct}%` }} /></div>
      <div className="prog-nums">
        <div><b>{format(a)}</b><span>{aLabel}</span></div>
        <div className="r"><b>{format(b)}</b><span>{bLabel}</span></div>
      </div>
      {children}
    </div>
  );
}
