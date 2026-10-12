import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errText, fmtWhen } from '../api';
import { useApp } from '../App';
import type { FinderView, PeoplePushed } from '../types';
import { useBusy } from './Busy';
import { Icon } from './Icon';
import { Notice } from './ui';

interface RunResult { ok: boolean; text: string; pushed: { name: string; company: string; id: string; fit: string }[]; credits: number; links: string[] }

/** The saved finders: what runs on its own, with Run now / Pause / Remove. */
export function FindersList({ refreshKey = 0, onChange }: { refreshKey?: number; onChange?: (n: number) => void }) {
  const { me } = useApp();
  const busy = useBusy();
  const nav = useNavigate();
  const tz = me.client?.timezone || 'UTC';
  const [finders, setFinders] = useState<FinderView[] | null>(null);
  const [err, setErr] = useState('');
  const [run, setRun] = useState<RunResult | null>(null);

  const load = () => api<{ finders: FinderView[] }>('/finders').then((r) => { setFinders(r.finders); onChange?.(r.finders.length); }).catch((e) => setErr(errText(e)));
  useEffect(() => { load(); }, [refreshKey]);

  const act = async (what: string, fn: () => Promise<unknown>) => {
    setErr('');
    try { await fn(); await load(); } catch (e) { setErr(`${what}: ${errText(e)}`); }
  };

  if (finders === null) return <p className="empty">Loading…</p>;
  return (
    <>
      {err && <Notice kind="err"><p>{err}</p></Notice>}
      {run && (
        <Notice kind={run.ok ? 'ok' : 'err'}>
          <p><strong>{run.text}</strong></p>
          {run.pushed.length > 0 && (
            <ul className="items">
              {run.pushed.map((p, i) => (
                <li key={i}>
                  <div className="t">{run.links[i] ? <a className="lp" href={run.links[i]} target="_blank" rel="noopener">{p.name} <Icon name="external" /></a> : p.name}</div>
                  <div className="m">{p.company}{p.fit ? ` · ${p.fit}` : ''}</div>
                </li>
              ))}
            </ul>
          )}
        </Notice>
      )}
      {finders.length === 0 ? (
        <p className="empty">None yet. Search on the Ask tab, then "Save as a daily finder" under the results.</p>
      ) : (
        <div className="finders">
          {finders.map((f) => (
            <div className="finder" key={f.id}>
              <div>
                <div className="nm">{f.name} <span className={`pill ${f.enabled ? 'good' : ''}`}>{f.enabled ? 'on' : 'paused'}</span></div>
                <div className="st">{f.intent.kind === 'people' ? 'People' : 'Companies'} · {f.when} · {f.last_run ? `last run ${fmtWhen(f.last_run, tz)}` : 'never run'} · next {fmtWhen(f.next, tz, true)}</div>
                {f.last_result && <div className="st">{f.last_result}</div>}
                {f.q && <div className="st"><a onClick={() => nav(`/?q=${encodeURIComponent(f.q)}`)} style={{ cursor: 'pointer' }}>open this search</a></div>}
              </div>
              <div className="rowtools" style={{ margin: 0 }}>
                <button className="btn sm" type="button" onClick={() => act('Run', () => busy.run('Running the finder… searching, looking leads up and writing them into Launchpad', async () => { const r = await api<RunResult & { seen?: unknown }>(`/finders/${f.id}/run`, { body: {} }); setRun(r); }))}><Icon name="refresh" />Run now</button>
                <button className="btn secondary sm" type="button" onClick={() => act('Toggle', () => api(`/finders/${f.id}/toggle`, { body: {} }))}>{f.enabled ? 'Pause' : 'Resume'}</button>
                <button className="btn ghost sm" type="button" onClick={() => { if (confirm('Remove this finder?')) act('Remove', () => api(`/finders/${f.id}`, { method: 'DELETE' })); }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="hint" style={{ marginTop: 12 }}>Finders run on their own at their scheduled time. "Run now" pulls a batch immediately.</p>
    </>
  );
}

export type { PeoplePushed };
