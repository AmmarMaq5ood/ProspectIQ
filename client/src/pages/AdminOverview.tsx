import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errText, fmtWhen, nf } from '../api';
import { Icon } from '../components/Icon';
import { Num } from '../components/Motion';
import { Errors, Pager, PerPage } from '../components/ui';
import type { AdminActivityPage, Overview } from '../types';
import { Progress } from '../components/Charts';

const KINDS: [string, string][] = [['', 'Everything'], ['finder', 'Finder runs'], ['push', 'Pushes'], ['search', 'Searches'], ['lookup', 'Lookups'], ['credits', 'Credits']];
const ICON: Record<string, string> = { finder: 'calendar', push: 'push', search: 'search', lookup: 'link', credits: 'chart', system: 'settings' };

/** The agency's front page: the numbers that matter across every client, and what happened last. */
export default function AdminOverview() {
  const nav = useNavigate();
  const [d, setD] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  const [feed, setFeed] = useState<AdminActivityPage | null>(null);
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(10);
  const [kind, setKind] = useState('');
  const [who, setWho] = useState('');
  useEffect(() => { api<Overview>('/admin/overview').then(setD).catch((e) => setErr(errText(e))); }, []);
  useEffect(() => { api<AdminActivityPage>('/admin/activity', { query: { page, per, kind, client: who } }).then(setFeed).catch((e) => setErr(errText(e))); }, [page, per, kind, who]);
  const pick = (next: { kind?: string; who?: string; per?: number }) => { if (next.kind !== undefined) setKind(next.kind); if (next.who !== undefined) setWho(next.who); if (next.per !== undefined) setPer(next.per); setPage(1); };
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

      <section className="card" aria-label="Credits across clients">
        <h2>Credits this month</h2>
        <p className="sub">Used against left, every client together. Credits reset on the 1st in each client's timezone.</p>
        <Progress a={t.credits_used} b={t.credits_left} aLabel="used this month" bLabel={`left of ${nf(t.credits_total)}`} color="mint" />
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
          <p className="sub">Across every client, newest first. Times in UTC.</p>
          <div className="feed-tools">
            <div className="sugg" style={{ margin: 0 }}>
              {KINDS.map(([k, label]) => <button type="button" key={k} className={k === kind ? 'on' : ''} onClick={() => pick({ kind: k })}>{label}</button>)}
            </div>
            <div className="feed-tools-r">
              {d.clients.length > 1 && <select className="in" aria-label="Client" value={who} onChange={(e) => pick({ who: e.target.value })}><option value="">All clients</option>{d.clients.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>}
              <PerPage value={per} options={[10, 25, 50]} onChange={(n) => pick({ per: n })} />
            </div>
          </div>
          {!feed ? <p className="empty">Loading…</p> : feed.rows.length ? (
            <>
              <ul className="feed compact">
                {feed.rows.map((r, i) => (
                  <li className={`ev ev-${r.kind}${r.ok ? '' : ' failed'}`} key={`${r.t}-${i}`}>
                    <span className="ev-icon"><Icon name={ICON[r.kind] || 'clock'} /></span>
                    <div className="ev-body">
                      <div className="ev-title"><Link to={`/admin/clients/${r.slug}`}>{r.client}</Link> · {r.title}</div>
                      {r.detail && <div className="ev-detail">{r.detail}</div>}
                    </div>
                    <div className="ev-meta"><div className="ev-when">{fmtWhen(r.t, 'UTC')}</div>{r.credits ? <div className="ev-credits">−{nf(r.credits)}</div> : null}</div>
                  </li>
                ))}
              </ul>
              <Pager res={{ rows: feed.rows, total: feed.total, page: feed.page, per_page: feed.per, pages: feed.pages }} onPage={setPage} />
            </>
          ) : <p className="empty">{kind || who ? 'Nothing of that kind yet.' : 'Nothing yet.'}</p>}
        </div>
      </section>
    </>
  );
}
