import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errText, fmtWhen, nf } from '../api';
import { Icon } from '../components/Icon';
import { Num } from '../components/Motion';
import { Errors } from '../components/ui';
import type { Overview } from '../types';

/** The agency's front page: the numbers that matter across every client, and what happened last. */
export default function AdminOverview() {
  const nav = useNavigate();
  const [d, setD] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api<Overview>('/admin/overview').then(setD).catch((e) => setErr(errText(e))); }, []);
  if (err) return <Errors errors={[err]} />;
  if (!d) return <p className="empty">Loading…</p>;
  const t = d.totals;
  return (
    <>
      <div className="page-head">
        <h1>Overview</h1>
        <Link className="btn sm" to="/admin/clients"><Icon name="plus" />New client</Link>
        <p className="sub">All clients, this month. Credits reset on the 1st in each client's timezone.</p>
      </div>
      <section className="kpis" aria-label="Totals">
        <div className="kpi hero"><div className="l">Clients</div><div className="v"><Num value={t.clients} /></div><div className="n">{nf(t.connected)} connected to Launchpad</div></div>
        <div className="kpi"><div className="l">Leads added this month</div><div className="v"><Num value={t.pushed_month} /></div><div className="n">pushes and finder runs</div></div>
        <div className="kpi"><div className="l">Credits used this month</div><div className="v"><Num value={t.credits_used} /></div><div className="n">of {nf(t.credits_total)} across all clients</div></div>
        <div className="kpi"><div className="l">Credits left</div><div className="v"><Num value={t.credits_left} /></div><div className="n">{t.clients_out ? <span className="od">{t.clients_out} client{t.clients_out === 1 ? '' : 's'} at zero</span> : 'nobody at zero'}</div></div>
        <div className="kpi"><div className="l">Finder runs today</div><div className="v"><Num value={t.finder_runs_today} /></div><div className="n">{nf(t.finders)} finders scheduled</div></div>
        <div className="kpi"><div className="l">Searches this month</div><div className="v"><Num value={t.searches_month} /></div><div className="n">free</div></div>
      </section>

      <section className="grid two" aria-label="Clients and activity">
        <div className="card">
          <h2>Clients</h2>
          <p className="sub">Click one to manage it.</p>
          {d.clients.length ? (
            <table className="clients">
              <thead><tr><th scope="col">Client</th><th scope="col">Launchpad</th><th scope="col" className="num">Credits left</th><th scope="col">Last activity</th></tr></thead>
              <tbody>
                {d.clients.map((c) => (
                  <tr key={c.slug} onClick={() => nav(`/admin/clients/${c.slug}`)}>
                    <td><span className="nm">{c.name}{!c.enabled && <span className="pill bad" style={{ marginLeft: 8 }}>disabled</span>}</span><span className="st">{c.slug}</span></td>
                    <td>{c.connected ? <span className="pill good">connected</span> : <span className="pill bad">not connected</span>}</td>
                    <td className="num">{nf(c.credits.left)} <span className="status">/ {nf(c.credits.total)}</span></td>
                    <td>{c.last ? <><span className="nm">{c.last.title}</span><span className="st">{fmtWhen(c.last.t, 'UTC')} UTC</span></> : <span className="status">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="empty">No clients yet. <Link to="/admin/clients">Create the first one.</Link></p>}
        </div>
        <div className="card">
          <h2>Latest activity</h2>
          <p className="sub">Across every client, newest first.</p>
          {d.recent.length ? (
            <ul className="feed compact">
              {d.recent.map((r, i) => (
                <li className={`ev ev-${r.kind}${r.ok ? '' : ' failed'}`} key={i}>
                  <span className="ev-icon"><Icon name={({ finder: 'calendar', push: 'push', search: 'search', lookup: 'link', credits: 'chart', system: 'settings' } as Record<string, string>)[r.kind] || 'clock'} /></span>
                  <div className="ev-body">
                    <div className="ev-title"><Link to={`/admin/clients/${r.slug}`}>{r.client}</Link> · {r.title}</div>
                    {r.detail && <div className="ev-detail">{r.detail}</div>}
                  </div>
                  <div className="ev-meta"><div className="ev-when">{fmtWhen(r.t, 'UTC')}</div>{r.credits ? <div className="ev-credits">−{nf(r.credits)}</div> : null}</div>
                </li>
              ))}
            </ul>
          ) : <p className="empty">Nothing yet.</p>}
        </div>
      </section>
    </>
  );
}
