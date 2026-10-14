import { useEffect, useState } from 'react';
import { api, ctxLabel, errText, fmtN, fmtWhen, nf, usd } from '../api';
import { useApp } from '../App';
import { Icon } from '../components/Icon';
import { Errors } from '../components/ui';
import { CreditsRing, Num } from '../components/Motion';
import type { CreditEntry, Credits, PlanRow, UsageSummary } from '../types';

interface UsageRes { summary: UsageSummary; plan?: PlanRow[]; prices?: Record<string, [number, number]>; show_cost?: boolean; credits?: Credits; ledger?: CreditEntry[] }

/** Research-database and GPT consumption. Client view at /usage; the admin sees any client's with adminSlug. */
export default function Usage({ adminSlug, timezone }: { adminSlug?: string; timezone?: string } = {}) {
  const { me } = useApp();
  const tz = timezone || me.client?.timezone || 'UTC';
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UsageRes | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setErr('');
    api<UsageRes>(adminSlug ? `/admin/clients/${encodeURIComponent(adminSlug)}/usage` : '/usage', { query: { days } }).then(setData).catch((e) => setErr(errText(e)));
  }, [days, adminSlug, tick]);

  if (err) return <Errors errors={[err]} />;
  if (!data) return <p className="empty">Loading…</p>;
  const s = data.summary;
  const t = s.totals;
  const plan = data.plan || [];
  const showCost = data.show_cost !== false;
  const credits = data.credits;

  return (
    <>
      {!adminSlug && (
        <header className="top" style={{ position: 'static', paddingTop: 0 }}>
          <div className="ttl">
            <h1 style={{ fontSize: 18 }}>Usage</h1>
            <p className="sub">Research database and GPT consumption from this app's own log · last {s.days} days · {nf(s.rows)} calls logged</p>
          </div>
          <div className="ctrls">
            <span className="selwrap"><Icon name="calendar" /><select className="sel" aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select><Icon name="chevron" /></span>
            <button className="btn secondary refresh" type="button" onClick={() => setTick((x) => x + 1)}><Icon name="refresh" /><span>Refresh</span></button>
          </div>
        </header>
      )}
      {adminSlug && (
        <div className="rowtools">
          <span className="selwrap"><Icon name="calendar" /><select className="sel" aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select><Icon name="chevron" /></span>
          <span className="hint">{nf(s.rows)} calls logged in the period</span>
        </div>
      )}

      <section className="kpis" aria-label="Totals">
        <div className="kpi hero"><div className="l">Research searches</div><div className="v"><Num value={t.searches} /></div><div className="n">{nf(t.results)} results returned · free</div></div>
        <div className="kpi"><div className="l">Lookups</div><div className="v"><Num value={t.lookups} /></div><div className="n">person and company lookups</div></div>
        <div className="kpi"><div className="l">{showCost ? 'Lookup credits spent' : 'Leads added with email'}</div><div className="v"><Num value={showCost ? t.credits : (credits?.used ?? t.credits)} /></div><div className="n">{showCost ? 'one per revealed work email' : 'one credit each'}</div></div>
        <div className="kpi"><div className="l">GPT calls</div><div className="v"><Num value={t.gpt_calls} /></div><div className="n">requests read and fit lines written</div></div>
        <div className="kpi"><div className="l">GPT tokens</div><div className="v"><Num value={t.tokens_in + t.tokens_out} format={fmtN} /></div><div className="n">{fmtN(t.tokens_in)} in · {fmtN(t.tokens_out)} out</div></div>
        {showCost
          ? <div className="kpi"><div className="l">GPT cost</div><div className="v">{t.gpt_calls ? usd(t.cost) : '—'}</div><div className="n">{t.cost_known ? 'from the model prices on the server' : 'some models have no price set'}{t.apollo_errors + t.gpt_errors > 0 && <> · <span className="od">{nf(t.apollo_errors + t.gpt_errors)} failed calls</span></>}</div></div>
          : <div className="kpi"><div className="l">Credits left</div><div className="v"><Num value={credits?.left ?? 0} /></div><div className="n">{nf(credits?.used ?? 0)} used of {nf(credits?.total ?? 0)} · resets {credits?.resets_label ?? ''}</div></div>}
      </section>

      {!showCost && credits && (
        <section className="grid one" aria-label="Credits">
          <div className="card">
            <h2>Credits</h2>
            <p className="sub">Searching is free. One credit is used for each lead added to Launchpad as a new contact with a work email. Your {nf(credits.monthly)} monthly credits reset on {credits.resets_label}.</p>
            <div className="credits-card">
              <CreditsRing big total={credits.total} used={credits.used} left={credits.left} resets={credits.resets_label} />
              {data.ledger && data.ledger.length > 0 && (
                <div className="scroll" style={{ flex: 1, minWidth: 280 }}>
                  <table className="ledger" style={{ minWidth: 0 }}>
                    <thead><tr><th scope="col">When</th><th scope="col" className="num">Change</th><th scope="col">What</th><th scope="col" className="num">Left</th></tr></thead>
                    <tbody>{data.ledger.slice(0, 8).map((e, i) => <tr key={i}><td>{fmtWhen(e.t, tz)}</td><td className={`num ${e.delta < 0 ? 'neg' : 'pos'}`}>{e.delta > 0 ? '+' : ''}{nf(e.delta)}</td><td>{e.reason}</td><td className="num">{nf(e.left)}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="grid two" aria-label="By day">
        <div className="card">
          <h2>Lookup credits by day</h2>
          <p className="sub">Credits are the only research cost: one per work email revealed on push or by a finder.</p>
          <Bars rows={s.by_day.map((d) => [d.day, d.credits])} cls="c-single" empty="No credits spent in this period." dimZero />
        </div>
        <div className="card">
          <h2>GPT tokens by day</h2>
          <p className="sub">Input plus output tokens across all models.</p>
          <Bars rows={s.by_day.map((d) => [d.day, d.tokens])} cls="c-associates" empty="No GPT calls in this period." dimZero />
        </div>
      </section>

      <section className="grid two" aria-label="By feature and model">
        <div className="card">
          <h2>By feature</h2>
          <p className="sub">Where the calls came from.</p>
          {Object.keys(s.by_ctx).length ? (
            <table>
              <thead><tr><th scope="col">Feature</th><th scope="col" className="num">Searches</th><th scope="col" className="num">Lookups</th><th scope="col" className="num">Credits</th><th scope="col" className="num">GPT calls</th><th scope="col" className="num">Tokens</th>{showCost && <th scope="col" className="num">GPT cost</th>}</tr></thead>
              <tbody>
                {Object.entries(s.by_ctx).map(([k, v]) => <tr key={k}><td>{ctxLabel(k)}</td><td className="num">{nf(v.searches)}</td><td className="num">{nf(v.lookups)}</td><td className="num">{nf(v.credits)}</td><td className="num">{nf(v.gpt_calls)}</td><td className="num">{fmtN(v.tokens)}</td>{showCost && <td className="num">{v.gpt_calls ? usd(v.cost) : '—'}</td>}</tr>)}
              </tbody>
            </table>
          ) : <p className="empty">Nothing logged in this period.</p>}
        </div>
        <div className="card">
          <h2>GPT by model</h2>
          <p className="sub">{showCost ? 'Prices per million tokens are set on the server.' : 'Requests read and fit lines written, by model.'}</p>
          {Object.keys(s.by_model).length ? (
            <table>
              <thead><tr><th scope="col">Model</th><th scope="col" className="num">Calls</th><th scope="col" className="num">Tokens in</th><th scope="col" className="num">Tokens out</th>{showCost && <th scope="col" className="num">Cost</th>}</tr></thead>
              <tbody>
                {Object.entries(s.by_model).map(([m, v]) => <tr key={m}><td>{m}</td><td className="num">{nf(v.calls)}</td><td className="num">{nf(v.in)}</td><td className="num">{nf(v.out)}</td>{showCost && <td className="num">{v.known ? usd(v.cost) : <span className="status">no price set</span>}</td>}</tr>)}
              </tbody>
            </table>
          ) : <p className="empty">No GPT calls in this period.</p>}
          <h2 style={{ marginTop: 18 }}>Research calls by endpoint</h2>
          {Object.keys(s.by_ep).length ? <Bars rows={Object.entries(s.by_ep).slice(0, 8)} cls="c-single" /> : <p className="empty">No research calls in this period.</p>}
        </div>
      </section>

      <section className="grid two" aria-label="Plan limits and recent calls">
        {!adminSlug && showCost && (
          <div className="card">
            <h2>Research plan limits today</h2>
            <p className="sub">Straight from the research service: calls allowed and used per day, hour and minute for the endpoints this app uses.</p>
            {plan.length ? (
              <table>
                <thead><tr><th scope="col">Endpoint</th><th scope="col" className="num">Today</th><th scope="col" className="num">This hour</th><th scope="col" className="num">This minute</th></tr></thead>
                <tbody>
                  {plan.map((p) => <tr key={p.label}><td>{p.label}</td>{(['day', 'hour', 'minute'] as const).map((w) => <td className="num" key={w}>{p[w] ? `${nf(p[w]!.consumed)} / ${nf(p[w]!.limit)}` : '—'}</td>)}</tr>)}
                </tbody>
              </table>
            ) : <p className="empty">{me.sample ? 'Not fetched in sample mode.' : 'Not available: no research key, or the service did not answer.'}</p>}
          </div>
        )}
        <div className="card">
          <h2>Recent calls</h2>
          <p className="sub">Newest first, up to 60.</p>
          {s.recent.length ? (
            <div className="scroll">
              <table>
                <thead><tr><th scope="col">When</th><th scope="col">Service</th><th scope="col">Call</th><th scope="col">Feature</th><th scope="col" className="num">Credits / tokens</th><th scope="col" className="num">ms</th><th scope="col">Result</th></tr></thead>
                <tbody>
                  {s.recent.map((r, i) => (
                    <tr key={i}>
                      <td className="num" style={{ textAlign: 'left' }}>{fmtWhen(r.t, tz)}</td>
                      <td>{r.p === 'openai' ? 'GPT' : r.p === 'treg' ? 'Email waterfall' : 'Research'}</td>
                      <td>{r.p === 'openai' ? `${r.model || ''}${r.kind ? ` · ${r.kind}` : ''}` : r.p === 'treg' ? (r.n ? `email found (${r.model || 'unverified'})` : 'no email found') : r.ep || ''}</td>
                      <td>{ctxLabel(r.ctx)}</td>
                      <td className="num">{r.p === 'openai' ? `${nf(r.in || 0)} + ${nf(r.out || 0)}` : r.credit ? `${r.credit} credit` : r.n != null ? `${nf(r.n)} results` : '—'}</td>
                      <td className="num">{nf(r.ms)}</td>
                      <td>{r.ok ? <span className="pill good">ok</span> : <span className="pill bad" title={r.err || ''}>failed</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty">Nothing logged yet. Calls are recorded from the moment the app is installed.</p>}
        </div>
      </section>
      {!adminSlug && showCost && <p className="foot">Searches are free; a credit is logged on a person lookup that returns a work email. GPT cost is tokens × the per-million prices set on the server. The research service's own limits are read live and cached for five minutes.</p>}
      {!adminSlug && !showCost && <p className="foot">Searches are free. One credit is used for each lead added to Launchpad as a new contact with a work email; leads already in Launchpad are skipped and cost nothing.</p>}
    </>
  );
}

export function Bars({ rows, cls, empty = 'Nothing in this period yet.', dimZero, format }: { rows: [string, number][]; cls: string; empty?: string; dimZero?: boolean; format?: (n: number) => string }) {
  if (!rows.length) return <p className="empty">{empty}</p>;
  const fmt = format || fmtN;
  const max = Math.max(format ? 0.0001 : 1, ...rows.map((r) => r[1]));
  return (
    <>
      <div className="bars">
        {rows.map(([label, value]) => (
          <div className={`row static${dimZero && value <= 0 ? ' zero' : ''}`} key={label} aria-label={`${label}: ${value}`}>
            <span className="lbl">{label}</span>
            <span className="track"><span className={`bar ${cls}`} style={{ width: `${Math.max(2, Math.round((value / max) * 100))}%` }} /><span className="val">{fmt(value)}</span></span>
          </div>
        ))}
      </div>
      <details className="tbl"><summary>Table</summary><table><thead><tr><th scope="col">Category</th><th scope="col" className="num">Count</th></tr></thead><tbody>{rows.map(([l, v]) => <tr key={l}><td>{l}</td><td className="num">{format ? format(v) : nf(v)}</td></tr>)}</tbody></table></details>
    </>
  );
}
