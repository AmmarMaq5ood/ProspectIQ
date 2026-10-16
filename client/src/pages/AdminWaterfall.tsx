import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ago, api, errText, nf, usd } from '../api';
import { Icon } from '../components/Icon';
import { Num } from '../components/Motion';
import { Errors, Help, Notice } from '../components/ui';
import type { WaterfallReport, WaterfallSearchTest, WaterfallTestRow } from '../types';

/**
 * The email waterfall, for the agency: how it has done (every lookup the app
 * made, from the usage log) and a tester that runs it on a pasted list or on
 * a Scout search without pushing anything, so the hit rate, the verified
 * share and the cost per email can be judged before clients get it.
 */
export default function AdminWaterfall() {
  const [days, setDays] = useState(30);
  const [d, setD] = useState<WaterfallReport | null>(null);
  const [err, setErr] = useState('');
  const [bump, setBump] = useState(0);
  useEffect(() => { setErr(''); api<WaterfallReport>('/admin/waterfall', { query: { days } }).then(setD).catch((e) => setErr(errText(e))); }, [days, bump]);

  /* the tester */
  const [who, setWho] = useState('');
  const [mode, setMode] = useState<'list' | 'search'>('list');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [n, setN] = useState(10);
  const [running, setRunning] = useState(false);
  const [runErr, setRunErr] = useState('');
  const [run, setRun] = useState<{ rows: WaterfallTestRow[]; note: string } | null>(null);
  useEffect(() => { if (d && !who && d.clients.length) setWho((d.clients.find((c) => c.has_apollo) || d.clients[0]).slug); }, [d, who]);

  const go = async (e: FormEvent) => {
    e.preventDefault();
    setRunErr(''); setRun(null); setRunning(true);
    try {
      if (mode === 'list') {
        const r = await api<{ rows: WaterfallTestRow[] }>('/admin/waterfall/test', { body: { client: who, text } });
        const found = r.rows.filter((x) => x.status === 'found');
        setRun({ rows: r.rows, note: `${nf(r.rows.length)} looked up · ${nf(found.length)} emails found · ${nf(found.filter((x) => x.verified).length)} verified · ${usd(found.reduce((s, x) => s + x.cost, 0))}` });
      } else {
        const r = await api<WaterfallSearchTest>('/admin/waterfall/search', { body: { client: who, q, n } });
        const tried = r.rows.filter((x) => x.status === 'found' || x.status === 'none');
        const found = r.rows.filter((x) => x.status === 'found');
        setRun({ rows: r.rows, note: `"${r.summary}" · ${nf(r.total)} people match · ${nf(r.rows.length)} checked · ${nf(r.db_emails)} had an email in the research database · waterfall tried ${nf(tried.length)}, found ${nf(found.length)} (${nf(found.filter((x) => x.verified).length)} verified) for ${usd(found.reduce((s, x) => s + x.cost, 0))}` });
      }
      setBump((b) => b + 1);
    } catch (x) {
      setRunErr(errText(x));
    } finally {
      setRunning(false);
    }
  };

  if (err) return <Errors errors={[err]} />;
  if (!d) return <p className="empty">Loading…</p>;
  const t = d.totals;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  return (
    <>
      <div className="page-head">
        <h1>Email waterfall</h1>
        <span className="selwrap"><Icon name="calendar" /><select className="sel" aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option></select><Icon name="chevron" /></span>
        <p className="sub">Every lookup the waterfall made, from pushes, daily finders and the tester below. {d.key_set ? 'The key is set in Settings.' : <>No key yet: add it under <Link to="/admin/settings">Settings</Link>.</>} It runs for {nf(d.clients.filter((c) => c.waterfall).length)} of {nf(d.clients.length)} clients.</p>
      </div>

      <section className="kpis" aria-label="Waterfall totals">
        <div className="kpi hero"><div className="l">Emails found</div><div className="v"><Num value={t.found} /></div><div className="n">{t.tried ? `${pct(t.hit_rate)} of ${nf(t.tried - t.errors)} lookups` : 'no lookups yet'}</div></div>
        <div className="kpi"><div className="l">Verified</div><div className="v">{t.found ? pct(t.verified_share) : '—'}</div><div className="n">{nf(t.verified)} of the emails found</div></div>
        <div className="kpi"><div className="l">Cost per email</div><div className="v">{t.found ? usd(t.cost_per_email) : '—'}</div><div className="n">{usd(t.cost)} in total</div></div>
        <div className="kpi"><div className="l">Lookups</div><div className="v"><Num value={t.tried} /></div><div className="n">{t.errors ? <span className="od">{nf(t.errors)} errors</span> : 'no errors'}</div></div>
        <div className="kpi"><div className="l">Speed</div><div className="v">{t.tried ? secs(t.ms_avg) : '—'}</div><div className="n">average per lookup</div></div>
        <div className="kpi"><div className="l">Budget fit</div><div className="v">{t.tried ? (t.ms_avg <= 10000 ? 'Yes' : 'Tight') : '—'}</div><div className="n">30s per manual push, 90s per finder run</div></div>
      </section>

      <section className="card" aria-label="Try the waterfall">
        <h2>Try it</h2>
        <p className="sub">Runs the real lookups and logs them like any other. Nothing is pushed to Launchpad and no client is charged credits. Each found email costs a cent or two from the waterfall key.</p>
        <nav className="ptabs" role="tablist" style={{ marginBottom: 12 }}>
          <button type="button" className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')} role="tab">Paste people</button>
          <button type="button" className={mode === 'search' ? 'on' : ''} onClick={() => setMode('search')} role="tab">From a Scout search</button>
        </nav>
        <form className="form-grid" onSubmit={go}>
          <div><label className="f" htmlFor="wfc">Log under client</label><select className="in" id="wfc" value={who} onChange={(e) => setWho(e.target.value)}>{d.clients.map((c) => <option key={c.slug} value={c.slug}>{c.name}{mode === 'search' && !c.has_apollo ? ' (no research key)' : ''}</option>)}</select></div>
          {mode === 'list' ? (
            <>
              <div />
              <div className="full"><label className="f" htmlFor="wft">People, one per line: name and company domain, or a LinkedIn URL</label><textarea id="wft" className="wf-list" value={text} onChange={(e) => setText(e.target.value)} placeholder={'Jane Smith, acme.com\nJohn Doe acme.com\nhttps://www.linkedin.com/in/someone\n\nMary Jones\nhttps://www.example.com\nhttps://www.linkedin.com/in/mary'} /></div>
              <div className="full actions"><button className="btn" type="submit" disabled={running || !text.trim() || !who}>{running ? <span className="spin" /> : <Icon name="search" />}Find emails</button><span className="hint">Up to 20 people per run. A name followed by its website and LinkedIn lines counts as one person. A name on its own is skipped.</span></div>
            </>
          ) : (
            <>
              <div><label className="f" htmlFor="wfn">People to check</label><input type="number" id="wfn" value={n} min={1} max={10} onChange={(e) => setN(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} /></div>
              <div className="full"><label className="f" htmlFor="wfq">Request, as a client would type it on Scout</label><input type="text" id="wfq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="purchasing managers at valve makers in Texas with 100 to 1,000 employees" /></div>
              <div className="full actions"><button className="btn" type="submit" disabled={running || !q.trim() || !who}>{running ? <span className="spin" /> : <Icon name="search" />}Search, reveal, then waterfall</button><span className="hint">Mirrors a push: each person is revealed first (a research credit is used only when the database returns their email), then the waterfall runs for the rest.</span></div>
            </>
          )}
        </form>
        {running && <p className="sub" style={{ marginTop: 10 }}>Looking up… each lookup can take up to 30 seconds.</p>}
        <Errors errors={runErr ? [runErr] : []} />
        {run && (
          <>
            <Notice kind="ok"><p>{run.note}</p></Notice>
            <TestTable rows={run.rows} />
          </>
        )}
      </section>

      <section className="grid two" aria-label="By source and by client">
        <div className="card">
          <h2>By source</h2>
          <p className="sub">Where the lookups came from.</p>
          <Lines rows={d.by_source.map((s) => ({ label: s.source, ...s }))} />
        </div>
        <div className="card">
          <h2>By client</h2>
          <p className="sub">Which accounts the lookups were logged under.</p>
          <Lines rows={d.by_client.map((c) => ({ label: c.name, ...c }))} />
        </div>
      </section>

      <section className="card" aria-label="By day">
        <h2>By day</h2>
        <Lines rows={d.by_day.map((x) => ({ label: x.day, ...x }))} empty="No lookups in this period." />
      </section>

      <section className="card" aria-label="Test history">
        <h2>Test history</h2>
        <p className="sub">The last {nf(d.tests.length)} people run through the tester, newest first.</p>
        <TestTable rows={d.tests} empty="No tests yet. Paste a few people above." />
      </section>

      <section className="card" aria-label="Recent lookups">
        <h2>Recent lookups</h2>
        <p className="sub">Every call, newest first, without names.</p>
        {d.recent.length ? (
          <div className="xscroll"><table>
            <thead><tr><th scope="col">When</th><th scope="col">Client</th><th scope="col">Source</th><th scope="col">Result</th><th scope="col">Provider</th><th scope="col" className="num">Cost</th><th scope="col" className="num">Seconds</th></tr></thead>
            <tbody>{d.recent.map((r, i) => (
              <tr key={i}><td>{ago(r.t)}</td><td>{r.client}</td><td>{r.source}</td><td>{!r.ok ? <span className="pill bad" title={r.err}>error</span> : r.found ? <span className={`pill ${r.verified ? 'good' : ''}`}>{r.verified ? 'found · verified' : 'found · unverified'}</span> : <span className="pill">no email</span>}</td><td>{r.provider || '—'}</td><td className="num">{usd(r.cost)}</td><td className="num">{secs(r.ms)}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <p className="empty">No lookups in this period.</p>}
      </section>

      <Help title="What good looks like" more="admin-guide#email-waterfall">
        <p>The waterfall only runs for people the research database had no email for, so judge it on those: how many it finds (the hit rate), how many of those come back verified (deliverable, safe to send to), what each found email costs, and whether a lookup fits inside a push, which gives it 30 seconds in total.</p>
        <p>The tester's "From a Scout search" mode is the fairest test: it is exactly what a push does, minus the push. "Paste people" is for names whose real email you already know, to check accuracy.</p>
      </Help>
    </>
  );
}

function Lines({ rows, empty = 'Nothing yet.' }: { rows: ({ label: string } & { tried: number; found: number; verified: number; errors: number; cost: number; ms: number })[]; empty?: string }) {
  if (!rows.length) return <p className="empty">{empty}</p>;
  return (
    <div className="xscroll"><table>
      <thead><tr><th scope="col"></th><th scope="col" className="num">Lookups</th><th scope="col" className="num">Found</th><th scope="col" className="num">Hit rate</th><th scope="col" className="num">Verified</th><th scope="col" className="num">Errors</th><th scope="col" className="num">Cost</th><th scope="col" className="num">Avg s</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="num">{nf(r.tried)}</td><td className="num">{nf(r.found)}</td><td className="num">{r.tried - r.errors ? `${Math.round((r.found / (r.tried - r.errors)) * 100)}%` : '—'}</td><td className="num">{nf(r.verified)}</td><td className="num">{nf(r.errors)}</td><td className="num">{usd(r.cost)}</td><td className="num">{r.tried ? (r.ms / r.tried / 1000).toFixed(1) : '—'}</td></tr>)}</tbody>
    </table></div>
  );
}

const STATUS: Record<WaterfallTestRow['status'], [string, string]> = { found: ['found', 'good'], none: ['no email', ''], error: ['error', 'bad'], had_email: ['in the research database', 'blue'], skipped: ['skipped', ''] };

function TestTable({ rows, empty = 'Nothing to show.' }: { rows: WaterfallTestRow[]; empty?: string }) {
  if (!rows.length) return <p className="empty">{empty}</p>;
  return (
    <div className="xscroll"><table className="wf-tests">
      <thead><tr><th scope="col">Person</th><th scope="col">Company</th><th scope="col">Email</th><th scope="col">Result</th><th scope="col">Provider</th><th scope="col" className="num">Cost</th><th scope="col" className="num">Seconds</th></tr></thead>
      <tbody>{rows.map((r, i) => {
        const [label, cls] = STATUS[r.status] || [r.status, ''];
        return (
          <tr key={`${r.t}-${i}`}>
            <td><div className="t">{r.first} {r.last}</div>{r.title && <div className="m">{r.title}</div>}</td>
            <td><div className="t">{r.company || r.domain}</div>{r.company && r.domain && <div className="m">{r.domain}</div>}</td>
            <td>{r.email || r.db_email || '—'}</td>
            <td><span className={`pill ${cls}`} title={r.err || ''}>{label}{r.status === 'found' ? (r.verified ? ' · verified' : ' · unverified') : ''}</span>{r.err && r.status !== 'error' && <div className="m">{r.err}</div>}</td>
            <td>{r.provider || '—'}</td>
            <td className="num">{r.cost ? usd(r.cost) : '—'}</td>
            <td className="num">{(r.ms / 1000).toFixed(1)}</td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}
