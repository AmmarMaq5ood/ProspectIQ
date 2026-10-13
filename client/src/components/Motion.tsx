import { useEffect, useRef, useState } from 'react';

/** Small motion helpers: numbers that count up, the credits ring, the thin progress bar. All respect prefers-reduced-motion. */

const reduce = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useCountUp(target: number, ms = 900): number {
  const [v, setV] = useState(() => (reduce() ? target : 0));
  const from = useRef(reduce() ? target : 0);
  useEffect(() => {
    if (reduce()) { setV(target); from.current = target; return; }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const cur = Math.round(start + (target - start) * e);
      setV(cur);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = target; };
  }, [target, ms]);
  return v;
}

export function Num({ value, format }: { value: number; format?: (n: number) => string }) {
  const v = useCountUp(value);
  return <>{format ? format(v) : v.toLocaleString('en-US')}</>;
}

/** The credits pill: a ring that empties as credits are used, the number counting to the current balance. */
export function CreditsRing({ total, used, left, big, resets }: { total: number; used: number; left: number; big?: boolean; resets?: string }) {
  const pct = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const r = 15;
  const C = 2 * Math.PI * r;
  const v = useCountUp(left);
  const state = left <= 0 ? ' out' : pct < 0.15 ? ' low' : '';
  return (
    <span className={`credits${state}${big ? ' big' : ''}`} title={`${used.toLocaleString('en-US')} used of ${total.toLocaleString('en-US')} this month${resets ? `, resets on ${resets}` : ''}`} role="status">
      <svg viewBox="0 0 36 36" className="ring" aria-hidden="true">
        <circle className="bg" cx="18" cy="18" r={r} />
        <circle className="fg" cx="18" cy="18" r={r} style={{ strokeDasharray: C, strokeDashoffset: C * (1 - pct) }} />
      </svg>
      <b>{v.toLocaleString('en-US')}</b>
      <span>{left === 1 ? 'credit left' : 'credits left'}{big && resets ? <><br /><small>of {total.toLocaleString('en-US')} · resets {resets}</small></> : null}</span>
    </span>
  );
}

export function TopProgress({ active }: { active: boolean }) {
  return <div className={`topprog${active ? ' on' : ''}`} aria-hidden="true" />;
}

/** An on/off switch that looks like Launchpad's. */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="toggle-row" onClick={() => onChange(!on)}>
      <span className={`switch${on ? ' on' : ''}`} />
      <span>{label}</span>
    </button>
  );
}
