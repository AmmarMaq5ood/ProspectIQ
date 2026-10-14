import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errText, fmtN, nf, usd } from '../api';
import { Icon } from '../components/Icon';
import { Num } from '../components/Motion';
import { Errors } from '../components/ui';
import { Bars } from './Usage';
import type { CostLine, CostReport } from '../types';

/**
 * The agency's cost report: every client's research-database and GPT spend,
 * month by month, and one month broken down by account, feature, model and
 * day. Research credits turn into dollars with the per-credit rate from
 * Settings; until that is set, the credit counts stand on their own.
 */
export default function AdminCosts() {
  const [month, setMonth] = useState('');
  const [d, setD] = useState<CostReport | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setErr('');
    api<CostReport>('/admin/costs', { query: { month, months: 12 } }).then(setD).catch((e) => setErr(errText(e)));
  }, [month]);
  if (err) return <Errors errors={[err]} />;
  if (!d) return <p className="empty">Loading…</p>;
  const t = d.totals;
  const priced = d.credit_cost > 0;
  const max = Math.max(0.0001, ...d.months.map((m) => m.total));
  const maxKey = d.months.reduce((best, m) => (m.total > best.total ? m : best), d.months[0]).month;

  return (
    <>
      <div className="page-head">
        <h1>Costs</h1>
        <span className="selwrap"><Icon name="calendar" /><select className="sel" aria-label="Month" value={d.selected} onChange={(e) => setMonth(e.target.value)}>{[...d.months].reverse().map((m) => <option key={m.month} value={m.month}>{m.label}</option>)}</select><Icon name="chevron" /></span>
        <p className="sub">What the research database and GPT cost us, from this app's own call log. GPT is priced per model on the server; research credits use the rate in <Link to="/admin/settings">Settings</Link>{priced ? ` (${usd(d.credit_cost)} a credit)` : ' (not set yet, so counts only)'}.</p>
      </div>

      <section className="kpis" aria-label={`Totals for ${d.label}`}>
        <div className="kpi hero"><div className="l">Total cost · {d.label}</div><div className="v">{usd(t.total)}</div><div className="n">{priced ? `${usd(t.gpt)} GPT + ${usd(t.research)} research` : `${usd(t.gpt)} GPT · research credits not priced`}{!t.gpt_known && <> · <span className="od">some GPT calls have no price</span></>}</div></div>
        <div className="kpi"><div className="l">GPT cost</div><div className="v">{usd(t.gpt)}</div><div className="n">{nf(t.gpt_calls)} calls · {fmtN(t.tokens)} tokens</div></div>
        <div className="kpi"><div className="l">Research credits</div><div className="v"><Num value={t.credits} /></div><div className="n">{priced ? `${usd(t.research)} at ${usd(d.credit_cost)} each` : 'one per revealed work email'}</div></div>
        <div className="kpi"><div className="l">Lookups</div><div className="v"><Num value={t.lookups} /></div><div className="n">person and company lookups</div></div>
        <div className="kpi"><div className="l">Searches</div><div className="v"><Num value={t.searches} /></div><div className="n">free</div></div>
        <div className="kpi"><div className="l">Biggest account</div><div className="v" style={{ fontSize: 22 }}>{t.top_client || '—'}</div><div className="n">{t.top_client ? `${t.top_share}% of the month · ${nf(t.clients_active)} account${t.clients_active === 1 ? '' : 's'} active` : 'nothing logged this month'}</div></div>
      </section>

      <section className="card" style={{ marginBottom: 12 }} aria-label="Cost by month">
        <h2>By month</h2>
        <p className="sub">The last twelve months across every account. Click a month to see it below.</p>
        <div className="legend"><span><i className="sw-gpt" />GPT</span><span><i className="sw-research" />Research credits{priced ? '' : ' (not priced)'}</span></div>
        <div className="ctrend" role="img" aria-label="Monthly cost, GPT and research stacked">
          {d.months.map((m) => {
            const on = m.month === d.selected;
            const label = on || m.month === maxKey;
            return (
              <button type="button" className={`ctrend-col${on ? ' on' : ''}`} key={m.month} onClick={() => setMonth(m.month)} title={`${m.label}: ${usd(m.total)} total · GPT ${usd(m.gpt)} · ${nf(m.credits)} research credits${priced ? ` (${usd(m.research)})` : ''}`}>
                <span className="ctrend-val">{label && m.total > 0 ? usd(m.total) : ''}</span>
                <span className="ctrend-stack">
                  <span className="ctrend-seg research" style={{ height: `${(m.research / max) * 100}%` }} />
                  <span className="ctrend-seg gpt" style={{ height: `${(m.gpt / max) * 100}%` }} />
                </span>
                <span className="ctrend-lbl">{m.label.replace(/ \d{4}$/, '')}</span>
              </button>
            );
          })}
        </div>
        <details className="tbl"><summary>Table</summary>
          <table>
            <thead><tr><th scope="col">Month</th><th scope="col" className="num">Searches</th><th scope="col" className="num">Lookups</th><th scope="col" className="num">Credits</th><th scope="col" className="num">GPT calls</th><th scope="col" className="num">Tokens</th><th scope="col" className="num">GPT</th><th scope="col" className="num">Research</th><th scope="col" className="num">Total</th></tr></thead>
            <tbody>{[...d.months].reverse().map((m) => <tr key={m.month}><td>{m.label}</td><Cells l={m} priced={priced} /></tr>)}</tbody>
          </table>
        </details>
      </section>

      <section className="grid two" aria-label="By account and by feature">
        <div className="card">
          <h2>By account · {d.label}</h2>
          <p className="sub">Which client's use cost what. Open an account for the split by feature.</p>
          {d.clients.length ? (
            <div className="xscroll"><table>
              <thead><tr><th scope="col">Account</th><th scope="col" className="num">Credits</th><th scope="col" className="num">GPT calls</th><th scope="col" className="num">GPT</th>{priced && <th scope="col" className="num">Research</th>}<th scope="col" className="num">Total</th><th scope="col">Share</th></tr></thead>
              <tbody>
                {d.clients.map((c) => (
                  <tr key={c.slug}>
                    <td>
                      <details className="drow">
                        <summary><span className="lbl"><Link to={`/admin/clients/${c.slug}`}>{c.name}</Link></span></summary>
                        <div className="dpanel">
                          <ul className="mini">{Object.entries(c.by_feature).sort((a, b) => b[1].total - a[1].total || b[1].credits - a[1].credits).map(([f, l]) => <li key={f}><span>{f} · {nf(l.searches)} searches, {nf(l.lookups)} lookups</span><b>{priced || l.gpt ? usd(l.total) : `${nf(l.credits)} cr`}</b></li>)}</ul>
                        </div>
                      </details>
                    </td>
                    <td className="num">{nf(c.credits)}</td>
                    <td className="num">{nf(c.gpt_calls)}</td>
                    <td className="num">{usd(c.gpt)}</td>
                    {priced && <td className="num">{usd(c.research)}</td>}
                    <td className="num"><b>{usd(c.total)}</b></td>
                    <td><span className="sharebar" title={`${c.share}%`}><span style={{ width: `${c.share}%` }} /></span><span className="status" style={{ marginLeft: 6 }}>{c.share}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <p className="empty">Nothing logged for {d.label}.</p>}
        </div>
        <div className="card">
          <h2>By feature · {d.label}</h2>
          <p className="sub">What drove the spend: finders, the Ask tab, the research tabs, company lookups.</p>
          {d.features.length ? (
            <div className="xscroll"><table>
              <thead><tr><th scope="col">Feature</th><th scope="col" className="num">Searches</th><th scope="col" className="num">Lookups</th><th scope="col" className="num">Credits</th><th scope="col" className="num">GPT calls</th><th scope="col" className="num">GPT</th>{priced && <th scope="col" className="num">Research</th>}<th scope="col" className="num">Total</th></tr></thead>
              <tbody>{d.features.map((f) => <tr key={f.feature}><td>{f.feature}</td><td className="num">{nf(f.searches)}</td><td className="num">{nf(f.lookups)}</td><td className="num">{nf(f.credits)}</td><td className="num">{nf(f.gpt_calls)}</td><td className="num">{usd(f.gpt)}</td>{priced && <td className="num">{usd(f.research)}</td>}<td className="num"><b>{usd(f.total)}</b></td></tr>)}</tbody>
            </table></div>
          ) : <p className="empty">Nothing logged for {d.label}.</p>}
        </div>
      </section>

      <section className="grid two" aria-label="By day and by model">
        <div className="card">
          <h2>Cost by day · {d.label}</h2>
          <p className="sub">GPT plus priced research credits, per day.</p>
          <Bars rows={d.days.map((x) => [x.day, x.total])} cls="c-single" empty={`Nothing logged for ${d.label}.`} format={usd} />
        </div>
        <div className="card">
          <h2>GPT by model · {d.label}</h2>
          <p className="sub">Prices per million tokens are set on the server; a model without one shows calls and tokens only.</p>
          {d.models.length ? (
            <table>
              <thead><tr><th scope="col">Model</th><th scope="col" className="num">Calls</th><th scope="col" className="num">Tokens in</th><th scope="col" className="num">Tokens out</th><th scope="col" className="num">Cost</th></tr></thead>
              <tbody>{d.models.map((m) => <tr key={m.model}><td>{m.model}</td><td className="num">{nf(m.calls)}</td><td className="num">{fmtN(m.in)}</td><td className="num">{fmtN(m.out)}</td><td className="num">{m.known ? usd(m.cost) : <span className="status">no price set</span>}</td></tr>)}</tbody>
            </table>
          ) : <p className="empty">No GPT calls in {d.label}.</p>}
          {t.errors > 0 && <p className="hint" style={{ marginTop: 10 }}>{nf(t.errors)} failed call{t.errors === 1 ? '' : 's'} this month are counted but cost nothing.</p>}
        </div>
      </section>
    </>
  );
}

function Cells({ l, priced }: { l: CostLine; priced: boolean }) {
  return (
    <>
      <td className="num">{nf(l.searches)}</td><td className="num">{nf(l.lookups)}</td><td className="num">{nf(l.credits)}</td><td className="num">{nf(l.gpt_calls)}</td><td className="num">{fmtN(l.tokens)}</td><td className="num">{usd(l.gpt)}</td><td className="num">{priced ? usd(l.research) : <span className="status">—</span>}</td><td className="num"><b>{usd(l.total)}</b></td>
    </>
  );
}
