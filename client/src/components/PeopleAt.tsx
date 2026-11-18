import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, errText, fullName, hue, initials, markPushedRows, nf, outOfCredits, peopleAtHref } from '../api';
import { useApp } from '../App';
import { keepDrop, keepGet, keepKey, keepPut } from '../keep';
import { roleFromTitle } from '../roles';
import type { IcpMatch, PeoplePushed, Person, SearchResult } from '../types';
import { useBusy } from './Busy';
import { Icon } from './Icon';
import { EmptyState, Errors, IcpPill, InLp, Kept, PushedPeople } from './ui';

/**
 * "People at this company", without leaving the page: a side panel any
 * company row can open. It lists who is on file there, lets you tick and
 * push them, and closes back onto the search you were on.
 */

export interface PeopleAtTarget { name: string; domain: string; id?: string }

const Ctx = createContext<(t: PeopleAtTarget) => void>(() => undefined);
/** `const peopleAt = usePeopleAt(); peopleAt({ name, domain })` opens the panel. */
export const usePeopleAt = () => useContext(Ctx);

export function PeopleAtProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<PeopleAtTarget | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = useCallback((t: PeopleAtTarget) => { opener.current = document.activeElement as HTMLElement | null; setTarget(t); }, []);
  const close = useCallback(() => { setTarget(null); const el = opener.current; if (el && document.contains(el)) window.setTimeout(() => el.focus(), 0); }, []);
  return (
    <Ctx.Provider value={open}>
      {children}
      {target && <Panel key={`${target.domain}|${target.id || ''}`} target={target} onClose={close} />}
    </Ctx.Provider>
  );
}

const BUYERS = ['owner', 'c_suite', 'vp', 'head', 'director', 'manager'];
type Who = 'buyers' | 'everyone';
interface Snap { res: SearchResult<Person>; icp: Record<string, IcpMatch>; picks: string[]; roles: Record<string, string>; pushed: PeoplePushed | null }

function Panel({ target, onClose }: { target: PeopleAtTarget; onClose: () => void }) {
  const { me, reload } = useApp();
  const c = me.client!;
  const busy = useBusy();
  const [who, setWho] = useState<Who>('buyers');
  const [res, setRes] = useState<SearchResult<Person> | null>(null);
  const [icp, setIcp] = useState<Record<string, IcpMatch>>({});
  const [at, setAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [pushed, setPushed] = useState<PeoplePushed | null>(null);
  const [nonce, setNonce] = useState(0);
  const force = useRef(false);
  const loaded = useRef('');
  const closeBtn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  const key = keepKey('peopleat', c.slug, { d: target.domain, id: target.domain ? '' : target.id || '', who });

  useEffect(() => {
    setErr('');
    const hit = force.current ? null : keepGet<Snap>(key);
    force.current = false;
    if (hit) {
      loaded.current = key;
      setRes(hit.v.res); setIcp(hit.v.icp); setPicks(new Set(hit.v.picks)); setRoles(hit.v.roles); setPushed(hit.v.pushed); setAt(hit.t); setLoading(false);
      return;
    }
    let live = true;
    setLoading(true); setPushed(null); setPicks(new Set()); setRoles({});
    const filters = { ...(target.domain ? { domains: [target.domain] } : { oids: target.id ? [target.id] : [] }), ...(who === 'buyers' ? { sen: BUYERS } : {}) };
    api<{ result: SearchResult<Person> | null; icp?: Record<string, IcpMatch> }>('/search', { body: { kind: 'people', mode: 'people', filters, page: 1, pp: 25 } })
      .then((r) => { if (!live) return; loaded.current = key; setRes(r.result || { rows: [], total: 0, page: 1, per_page: 25, pages: 1 }); setIcp(r.icp || {}); setAt(Date.now()); })
      .catch((e) => { if (live) { setErr(errText(e)); setRes(null); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [key, nonce]);

  useEffect(() => {
    if (!res || loaded.current !== key) return;
    keepPut<Snap>(key, { res, icp, picks: [...picks], roles, pushed }, at || Date.now());
  }, [res, icp, picks, roles, pushed, at]);

  /* a dialog: Escape closes, Tab stays inside, the page behind does not scroll */
  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.busy-overlay')) { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const f = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])')].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, []);

  const rows = res?.rows || [];
  const withEmail = (p: Person) => !!p.has_email || !!p.email;
  const nSel = rows.filter((p) => picks.has(p.id)).length;
  const nEmail = rows.filter((p) => picks.has(p.id) && withEmail(p)).length;
  const upTo = c.email_waterfall ? nSel : nEmail;
  const left = c.credits.left;
  const blocked = left <= 0 || nEmail > left;
  const toggle = (id: string, on: boolean) => setPicks((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const pick = (m: 'all' | 'none' | 'email' | 'new') => setPicks(new Set(rows.filter((p) => m === 'all' || (m === 'email' && withEmail(p)) || (m === 'new' && !p.in_lp)).map((p) => p.id)));
  const refresh = () => { keepDrop(key); force.current = true; setNonce((n) => n + 1); };

  const push = async () => {
    setErr('');
    try {
      const r = await busy.run('Pushing to Launchpad… looking each person up, then creating the records', () => api<PeoplePushed>('/push/people', { body: { picks: [...picks], people: rows, roles } }));
      setPushed(r);
      setPicks(new Set());
      setRes((x) => (x ? { ...x, rows: markPushedRows(x.rows, r) } : x));
      await reload();
      panel.current?.querySelector('.drawer-b')?.scrollTo({ top: 0 });
    } catch (e) {
      setErr(errText(e));
    }
  };

  const title = target.name || target.domain;
  return (
    <div className="drawer-wrap" role="presentation">
      <div className="drawer-back" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`People at ${title}`} ref={panel}>
        <header className="drawer-h">
          <span className="ic"><Icon name="people" /></span>
          <div className="tt">
            <h2>People at {title}</h2>
            <span className="sub">{target.domain || 'From the research database'}{res ? ` · ${nf(res.total)} on file${who === 'buyers' ? ', managers and above' : ''}` : ''}</span>
          </div>
          <button type="button" className="drawer-x" onClick={onClose} aria-label="Close" ref={closeBtn}><Icon name="x" /></button>
        </header>

        <div className="drawer-tools">
          <span className="seg" role="group" aria-label="Who to show">
            <button type="button" className={who === 'buyers' ? 'on' : ''} aria-pressed={who === 'buyers'} onClick={() => setWho('buyers')}>Managers and above</button>
            <button type="button" className={who === 'everyone' ? 'on' : ''} aria-pressed={who === 'everyone'} onClick={() => setWho('everyone')}>Everyone</button>
          </span>
          {res && !loading && <Kept at={at} onRefresh={refresh} />}
        </div>

        <div className="drawer-b">
          {pushed && <PushedPeople data={pushed} />}
          <Errors errors={err ? [err] : []} />
          {loading ? (
            <div className="drawer-wait" role="status"><span className="spin dark" /> Finding the people at {title}…</div>
          ) : rows.length ? (
            <>
              <div className="selbar">
                <span className="lbl">Select</span>
                <span className="seg" role="group" aria-label="Select people">
                  <button type="button" onClick={() => pick('all')}>All</button>
                  <button type="button" onClick={() => pick('none')}>None</button>
                  <button type="button" onClick={() => pick('email')}>With an email</button>
                  {rows.some((p) => p.in_lp) && <button type="button" onClick={() => pick('new')}>New to Launchpad</button>}
                </span>
              </div>
              <ul className="plist">
                {rows.map((p) => (
                  <li key={p.id} className={`${p.in_lp ? 'dim' : ''}${picks.has(p.id) ? ' picked' : ''}`.trim()}>
                    <label>
                      <input type="checkbox" checked={picks.has(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} aria-label={`Select ${fullName(p)}`} />
                      <span className="av" style={{ ['--h' as string]: hue(fullName(p)) }}>{initials(p.first, p.last)}</span>
                      <span className="who-t">
                        <span className="nm">{fullName(p)}</span>
                        <span className="st">{p.title}{p.city && ` · ${p.city}`}</span>
                        <span className="pills">
                          <IcpPill m={icp[p.id]} />
                          <InLp p={p} />
                          {withEmail(p) ? <span className="pill good">email</span> : <span className="pill">no email on file</span>}
                          {p.has_phone && <span className="pill">phone</span>}
                        </span>
                      </span>
                    </label>
                    <select className="role" aria-label={`Role for ${fullName(p)}`} value={roles[p.id] || roleFromTitle(p.title, c.profile.roles)} onChange={(e) => setRoles((m) => ({ ...m, [p.id]: e.target.value }))}>
                      {c.profile.roles.map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
              {res && res.total > rows.length && target.domain && <p className="hint drawer-more">Showing the first {rows.length} of {nf(res.total)}. <Link to={peopleAtHref(target.domain)} onClick={onClose}>See them all on the People tab</Link>, where every filter is available.</p>}
            </>
          ) : res ? (
            <EmptyState icon="people" title={who === 'buyers' ? 'No managers or executives on file here' : 'Nobody on file for this company'} text={who === 'buyers' ? 'The research database has no one at manager level or above for this company. Show everyone on file instead.' : 'The research database has no people for this company yet. Push the company record on its own, or try the company lookup with its website.'}>
              {who === 'buyers' && <button type="button" className="btn secondary sm" onClick={() => setWho('everyone')}><Icon name="people" />Show everyone</button>}
            </EmptyState>
          ) : null}
        </div>

        {rows.length > 0 && !loading && (
          <footer className="drawer-f">
            <span className="cnt"><b>{nSel}</b> selected · up to <b>{upTo}</b> credit{upTo === 1 ? '' : 's'} of {nf(left)} left</span>
            {me.sample && <span className="hint">Sample mode: pushing is off.</span>}
            {left <= 0 && <span className="warn">{outOfCredits(c)}</span>}
            {!me.sample && left > 0 && nEmail > left && <span className="warn">Only {nf(left)} credits left this month: untick {nEmail - left}.</span>}
            <button className="btn" type="button" onClick={push} disabled={me.sample || nSel === 0 || blocked}><Icon name="push" />Push to Launchpad</button>
          </footer>
        )}
      </aside>
    </div>
  );
}
