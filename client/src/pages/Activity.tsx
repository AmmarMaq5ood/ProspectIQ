import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errText, fmtWhen, lpContactHref, nf } from '../api';
import { useApp } from '../App';
import { Icon } from '../components/Icon';
import { Errors, Pager, PerPage } from '../components/ui';
import type { Activity as Act, ActivityPage } from '../types';

const KINDS: [string, string][] = [['', 'Everything'], ['finder', 'Finder runs'], ['push', 'Pushes'], ['search', 'Searches'], ['lookup', 'Lookups'], ['credits', 'Credits']];
const ICON: Record<string, string> = { finder: 'calendar', push: 'push', search: 'search', lookup: 'link', credits: 'chart', system: 'settings' };
const LABEL: Record<string, string> = { finder: 'finder run', push: 'push', search: 'search', lookup: 'lookup', credits: 'credits', system: 'system' };
const BY: Record<string, string> = { client: 'by you', finder: 'scheduled', admin: 'by the agency', system: 'automatic' };

/**
 * The activity log: every finder run, push, search and credit change, newest
 * first, with the people involved and the credits each one used. Clients see
 * it on their Activity tab (when switched on); the admin sees any client's.
 */
export default function Activity({ adminSlug, timezone, client }: { adminSlug?: string; timezone?: string; client?: { launchpad_app: string; location_id: string } } = {}) {
  const { me } = useApp();
  const tz = timezone || me.client?.timezone || 'UTC';
  const lp = client || me.client || null;
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const per = [10, 25, 50, 100].includes(Number(params.get('per'))) ? Number(params.get('per')) : 25;
  const kind = params.get('kind') || '';
  const ref = params.get('ref') || '';
  const [data, setData] = useState<ActivityPage | null>(null);
  const [err, setErr] = useState('');
  const go = (over: Record<string, string>) => { const p: Record<string, string> = { ...(kind ? { kind } : {}), ...(ref ? { ref } : {}), ...(per !== 25 ? { per: String(per) } : {}), ...over }; for (const k of Object.keys(p)) if (!p[k] || (k === 'page' && p[k] === '1')) delete p[k]; setParams(p); };

  useEffect(() => {
    setErr('');
    api<ActivityPage>(adminSlug ? `/admin/clients/${encodeURIComponent(adminSlug)}/activity` : '/activity', { query: { page, per, kind, ref } }).then(setData).catch((e) => { setErr(errText(e)); setData(null); });
  }, [adminSlug, page, per, kind, ref]);

  return (
    <>
      <Errors errors={err ? [err] : []} />
      <section className="card">
        <div className="rsum">
          <span><b>{data ? nf(data.total) : '…'}</b> {kind ? LABEL[kind] + (data && data.total === 1 ? '' : 's') : 'events'}{ref && <> · one finder <a onClick={() => go({ ref: '', page: '' })} style={{ cursor: 'pointer' }}>(show all)</a></>}</span>
          <PerPage value={per} options={[10, 25, 50, 100]} onChange={(n) => go({ per: String(n), page: '' })} />
        </div>
        <div className="sugg" style={{ margin: '0 0 14px' }}>
          {KINDS.map(([k, label]) => <button type="button" key={k} className={k === kind ? 'on' : ''} onClick={() => go({ kind: k, page: '' })}>{label}</button>)}
        </div>
        {!data ? <p className="empty">Loading…</p> : data.rows.length === 0 ? (
          <p className="empty">{kind || ref ? 'Nothing of that kind yet.' : 'Nothing yet. Searches, pushes and finder runs will show up here as they happen.'}</p>
        ) : (
          <ul className="feed">
            {data.rows.map((r, i) => <Event key={`${r.t}-${i}`} r={r} tz={tz} lp={lp} />)}
          </ul>
        )}
        {data && data.pages > 1 && <Pager res={{ rows: data.rows, total: data.total, page: data.page, per_page: data.per, pages: data.pages }} onPage={(p) => go({ page: String(p) })} />}
      </section>
      {!adminSlug && <p className="foot">Credits are used only when a lead is added to Launchpad as a new contact with a work email. Searches, lookups and leads already in Launchpad use none.</p>}
    </>
  );
}

function Event({ r, tz, lp }: { r: Act; tz: string; lp: { launchpad_app: string; location_id: string } | null }) {
  const items = r.items || [];
  return (
    <li className={`ev ev-${r.kind}${r.ok ? '' : ' failed'}`}>
      <span className="ev-icon"><Icon name={ICON[r.kind] || 'clock'} /></span>
      <div className="ev-body">
        <div className="ev-title">{r.title} <span className="pill">{LABEL[r.kind] || r.kind}</span>{!r.ok && <span className="pill bad">failed</span>}</div>
        {r.detail && <div className="ev-detail">{r.detail}</div>}
        {items.length > 0 && (
          <details className="ev-items">
            <summary>{items.length} {r.kind === 'push' && /compan/.test(r.title) ? (items.length === 1 ? 'company' : 'companies') : items.length === 1 ? 'person' : 'people'}</summary>
            <ul className="items">
              {items.map((it, j) => {
                const href = lp && it.id && !/compan/.test(r.title) ? lpContactHref(lp, it.id) : '';
                return <li key={j}><div className="t">{href ? <a className="lp" href={href} target="_blank" rel="noopener">{it.name} <Icon name="external" /></a> : it.name}</div><div className="m">{[it.company, it.email].filter(Boolean).join(' · ')}</div></li>;
              })}
            </ul>
          </details>
        )}
      </div>
      <div className="ev-meta">
        <div className="ev-when">{fmtWhen(r.t, tz)}</div>
        {r.credits ? <div className="ev-credits">−{nf(r.credits)} credit{r.credits === 1 ? '' : 's'}</div> : r.kind === 'push' || r.kind === 'finder' ? <div className="hint">no credits used</div> : null}
        <div className="hint">{BY[r.by] || r.by}</div>
      </div>
    </li>
  );
}
