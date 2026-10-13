import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ago, api, cap, errText, fullName, hq, hue, initials, money, nf, outOfCredits, peopleAtHref, todayIn } from '../api';
import { useApp } from '../App';
import { useBusy } from '../components/Busy';
import { FindersList } from '../components/FindersList';
import { Icon } from '../components/Icon';
import { Errors, InLp, LpFilter, Notice, Pager, PerPage, PushedCompanies, PushedPeople } from '../components/ui';
import { roleFromTitle } from '../roles';
import type { AskResult, CompaniesPushed, Kind, Org, PeoplePushed, Person, RecentSearch } from '../types';

/** The Ask tab: plain words in, leads out; tick, push; save as a daily finder. */
export default function Ask() {
  const { me, options, reload } = useApp();
  const c = me.client!;
  const busy = useBusy();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [hideLp, setHideLp] = useState(false);
  const q = (params.get('q') || '').trim();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pp = options.per_page.includes(Number(params.get('pp'))) ? Number(params.get('pp')) : 10;
  const landing = q === '';

  const [text, setText] = useState(q);
  const [res, setRes] = useState<AskResult | null>(null);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState<string[]>([]);
  const [pushed, setPushed] = useState<{ kind: Kind; people?: PeoplePushed; companies?: CompaniesPushed } | null>(null);
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [tab, setTab] = useState<'recent' | 'finders' | 'templates'>('recent');
  const [nFinders, setNFinders] = useState(0);
  const [fKey, setFKey] = useState(0);

  const templates = c.profile.templates || {};
  const examples = Object.values(templates).flat().slice(0, 5);
  const aiOn = c.has_openai && !me.sample;

  useEffect(() => {
    setText(q); setPushed(null); setNotice([]); setErr(''); setPicks(new Set()); setRoles({});
    if (!q) {
      setRes(null);
      api<{ recent: RecentSearch[] }>('/recent').then((r) => setRecent(r.recent)).catch((e) => setErr(`Could not load recent searches: ${errText(e)}`));
      return;
    }
    let live = true;
    busy.run('Searching the research database… hang tight', () => api<AskResult>('/ask', { body: { q, page, pp } }))
      .then((r) => { if (live) setRes(r); })
      .catch((e) => { if (live) { setErr(errText(e)); setRes(null); } });
    return () => { live = false; };
  }, [q, page, pp]);

  /* the empty prompt types example requests into its placeholder */
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = inputRef.current;
    if (!landing || !el || !examples.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let ei = 0, ci = 0, del = false, timer = 0;
    const base = 'Ask for leads… ';
    const tick = () => {
      if (document.activeElement === el && el.value) return;
      const ex = examples[ei];
      if (!del) { ci++; if (ci > ex.length) { del = true; timer = window.setTimeout(tick, 1600); return; } }
      else { ci--; if (ci === 0) { del = false; ei = (ei + 1) % examples.length; } }
      el.setAttribute('placeholder', base + ex.slice(0, ci));
      timer = window.setTimeout(tick, del ? 18 : 38);
    };
    timer = window.setTimeout(tick, 900);
    const onFocus = () => { clearTimeout(timer); el.setAttribute('placeholder', `${base}e.g. ${examples[0]}`); };
    el.addEventListener('focus', onFocus);
    return () => { clearTimeout(timer); el.removeEventListener('focus', onFocus); };
  }, [landing]);

  const go = (nq: string, over: Record<string, string> = {}) => {
    const p: Record<string, string> = { ...over };
    if (nq) p.q = nq;
    setParams(p);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); if (text.trim()) go(text.trim()); };

  const allRows = res?.result.rows || [];
  const kind: Kind = res?.kind || 'people';
  const isPeople = kind === 'people';
  const inLp = (r: Person | Org) => isPeople && !!(r as Person).in_lp;
  const nLp = allRows.filter(inLp).length;
  const rows = hideLp ? allRows.filter((r) => !inLp(r)) : allRows;
  const withEmail = (r: Person | Org) => isPeople && (!!(r as Person).has_email || !!(r as Person).email);
  const nSel = rows.filter((r) => picks.has(r.id)).length;
  const nEmail = rows.filter((r) => picks.has(r.id) && withEmail(r)).length;
  const left = c.credits.left;
  const blocked = isPeople && (left <= 0 || nEmail > left);
  const pick = (mode: 'all' | 'none' | 'email' | 'new') => setPicks(new Set(rows.filter((r) => mode === 'all' || (mode === 'email' && withEmail(r)) || (mode === 'new' && !inLp(r))).map((r) => r.id)));
  const toggle = (id: string, on: boolean) => setPicks((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  const push = async () => {
    setErr('');
    try {
      if (isPeople) {
        const r = await busy.run('Pushing to Launchpad… looking each person up, then creating the records', () => api<PeoplePushed>('/push/people', { body: { picks: [...picks], people: rows, roles } }));
        setPushed({ kind, people: r });
      } else {
        const r = await busy.run('Pushing to Launchpad… creating the company records', () => api<CompaniesPushed>('/push/companies', { body: { picks: [...picks], companies: rows } }));
        setPushed({ kind, companies: r });
      }
      setPicks(new Set());
      await reload();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setErr(errText(e));
    }
  };

  /* save as a finder */
  const [fName, setFName] = useState('');
  const [fPer, setFPer] = useState(5);
  const [fStart, setFStart] = useState(todayIn(c.timezone));
  const [fTime, setFTime] = useState('08:00');
  const [fRep, setFRep] = useState('daily');
  const [fNotify, setFNotify] = useState(true);
  useEffect(() => { if (res) setFName(res.intent.summary); }, [res]);
  const saveFinder = async (e: FormEvent) => {
    e.preventDefault();
    if (!res) return;
    setErr('');
    try {
      await busy.run('Saving the finder…', () => api('/finders', { body: { name: fName, q, intent: res.intent, per_run: fPer, start: fStart, time: fTime, repeat: fRep, notify: fNotify } }));
      setNotice([`Finder saved: "${fName || res.intent.summary}". It runs on its own from ${fStart} at ${fTime} (${c.timezone}).`]);
      setFKey((k) => k + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (x) {
      setErr(errText(x));
    }
  };

  /* "understood as" chips */
  const chips: [string, string][] = [];
  if (res) {
    const i = res.intent;
    i.titles.forEach((x) => chips.push(['Title', x]));
    i.seniorities.forEach((x) => chips.push(['Seniority', options.seniority[x] || x]));
    i.departments.forEach((x) => chips.push(['Dept', x]));
    i.industry_keywords.forEach((x) => chips.push(['Industry', x]));
    [...i.person_locations, ...i.company_locations].forEach((x) => chips.push(['Location', x]));
    i.exclude_locations.forEach((x) => chips.push(['Not in', x]));
    i.employee_ranges.forEach((x) => chips.push(['Size', options.employee_ranges[x] || x]));
    if (i.revenue_min || i.revenue_max) chips.push(['Revenue', (i.revenue_min ? money(i.revenue_min) : '') + (i.revenue_max ? ` to ${money(i.revenue_max)}` : '+')]);
    i.technologies.forEach((x) => chips.push(['Uses', x]));
    if (i.keywords) chips.push(['Keywords', i.keywords]);
  }
  const refineHref = res ? `/${kind}?${filtersToQuery(res.filters)}` : '';

  const pill = (autofocus: boolean) => (
    <form className="ask-pill" onSubmit={submit}>
      <span className="ask-spark"><Icon name="spark" /></span>
      <input ref={autofocus ? inputRef : undefined} type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask for leads… e.g. purchasing managers at valve makers in Texas with 100 to 1,000 employees" autoComplete="off" aria-label="What leads are you looking for" autoFocus={autofocus} />
      <button className="ask-send" type="submit" aria-label="Find leads" title="Find leads" disabled={busy.active}>{busy.active ? <span className="spin" /> : <Icon name="arrow-up" />}</button>
    </form>
  );

  return (
    <>
      {pushed?.people && <PushedPeople data={pushed.people} />}
      {pushed?.companies && <PushedCompanies data={pushed.companies} />}
      {notice.length > 0 && <Notice kind="ok">{notice.map((n, i) => <p key={i}>{n}</p>)}</Notice>}
      <Errors errors={err ? [err] : []} />
      {res?.warnings.length ? <Notice kind="ok">{res.warnings.map((w, i) => <p key={i}>{w}</p>)}</Notice> : null}

      {landing ? (
        <>
          <section className="ask-stage" aria-label="Ask for leads">
            <div className="ask-inner">
              <span className="ask-kicker"><Icon name="spark" />ProspectIQ</span>
              <h2>What leads are you looking for?</h2>
              <p>Describe the buyers or the companies in your own words. Titles, industry, location, company size and revenue are all understood.</p>
              {pill(true)}
              <div className="ask-ex">
                {examples.map((ex) => <a key={ex} onClick={() => go(ex)}>{ex}</a>)}
              </div>
              <p className="ask-note">{aiOn ? 'Requests are read by GPT. Searches are free; a lookup credit is spent only when a pushed lead\'s email is revealed.' : me.sample ? 'Sample mode: canned results, nothing is written.' : 'Requests are read by the built-in parser until an OpenAI key is added in the admin panel.'}</p>
            </div>
          </section>

          <section className="card ptabs-card" aria-label="Recent searches, finders and templates">
            <nav className="ptabs" role="tablist">
              <button type="button" className={tab === 'recent' ? 'on' : ''} onClick={() => setTab('recent')} role="tab">Recent searches{recent.length > 0 && <span className="cnt">{recent.length}</span>}</button>
              <button type="button" className={tab === 'finders' ? 'on' : ''} onClick={() => setTab('finders')} role="tab">Daily Leads Finders{nFinders > 0 && <span className="cnt">{nFinders}</span>}</button>
              <button type="button" className={tab === 'templates' ? 'on' : ''} onClick={() => setTab('templates')} role="tab">Templates</button>
            </nav>
            <div className="ptab-pane" hidden={tab !== 'recent'}>
              {recent.length ? (
                <ul className="recent">
                  {recent.slice(0, 10).map((r) => (
                    <li key={r.q}><a onClick={() => go(r.q)}><Icon name="clock" /><span className="rq">{r.q}</span><span className="rm">{nf(r.total)} {r.kind === 'people' ? 'people' : 'companies'} · {ago(r.t)}</span></a></li>
                  ))}
                </ul>
              ) : <p className="empty">Your searches will show up here. Start with a template or type a request above.</p>}
            </div>
            <div className="ptab-pane" hidden={tab !== 'finders'}>
              <p className="sub" style={{ marginBottom: 12 }}>What runs on its own, every day. "Run now" pulls today's batch immediately.</p>
              <FindersList refreshKey={fKey} onChange={setNFinders} />
            </div>
            <div className="ptab-pane" hidden={tab !== 'templates'}>
              {Object.keys(templates).length ? (
                <div className="tpl-grid">
                  {Object.entries(templates).map(([group, items]) => (
                    <div className="tpl" key={group}>
                      <h3>{group}</h3>
                      {items.map((ex) => <a key={ex} onClick={() => go(ex)}><Icon name="arrow-right" /><span>{ex}</span></a>)}
                    </div>
                  ))}
                </div>
              ) : <p className="empty">No templates yet. The agency adds them in the admin panel under Templates.</p>}
            </div>
          </section>
        </>
      ) : (
        <section className="ask-hero compact" aria-label="Ask for leads">{pill(false)}</section>
      )}

      {res && (
        <>
          <div className="card">
            <div className="rsum">
              <span><b>{nf(res.result.total)}</b> {isPeople ? 'people' : 'companies'} match · {res.intent.summary}</span>
              <a className="btn ghost sm" onClick={() => nav(refineHref)}><Icon name="filter" />Refine with all filters</a>
              <PerPage value={pp} options={options.per_page} onChange={(n) => go(q, { pp: String(n) })} />
            </div>
            <div className="ask-under">
              <span><Icon name="spark" /> Understood as:</span>
              {chips.map(([k, v], i) => <span className="pill blue" key={i}>{k}: {v}</span>)}
              {!chips.length && <span className="pill">nothing specific, searched the words as keywords</span>}
            </div>
            {rows.length ? (
              <>
                <div className="filters-row">
                  <p className="sel-line" style={{ margin: 0 }}>Select <a onClick={() => pick('all')}>all on this page</a> · <a onClick={() => pick('none')}>none</a>{isPeople && <> · <a onClick={() => pick('email')}>only those with an email</a>{nLp > 0 && <> · <a onClick={() => pick('new')}>only new to Launchpad</a></>}</>}</p>
                  <LpFilter n={nLp} hide={hideLp} onChange={setHideLp} />
                </div>
                <div className="cards">
                  {rows.map((r) => (
                    <label className={`lead${inLp(r) ? ' dim' : ''}`} key={r.id}>
                      <input type="checkbox" checked={picks.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} />
                      {isPeople ? <PersonCard p={r as Person} roles={c.profile.roles} role={roles[r.id]} onRole={(v) => setRoles((m) => ({ ...m, [r.id]: v }))} fit={res.fits[r.id] || ''} /> : <OrgCard o={r as Org} fit={res.fits[r.id] || ''} onPeople={() => nav(peopleAtHref((r as Org).domain))} />}
                    </label>
                  ))}
                </div>
                <Pager res={res.result} onPage={(p) => go(q, { page: String(p), pp: String(pp) })} />
              </>
            ) : <p className="empty">Nothing matched. Try fewer conditions, or <a onClick={() => nav(refineHref)}>adjust the filters</a>.</p>}
          </div>
          {rows.length > 0 && (
            <div className="pushbar">
              <span className="cnt"><b>{nSel}</b> selected{isPeople ? <> · uses up to <b>{nEmail}</b> of your <b>{nf(left)}</b> credits this month · creates the company, the contacts with roles, a research note and the outreach deal</> : ' · creates a company record for each'}</span>
              {me.sample && <span className="hint">Sample mode: pushing is off.</span>}
              {isPeople && left <= 0 && <span className="warn">{outOfCredits(c)}</span>}
              {!me.sample && isPeople && left > 0 && nEmail > left && <span className="warn">Only {nf(left)} credits left this month: untick {nEmail - left}.</span>}
              <button className="btn" type="button" onClick={push} disabled={me.sample || nSel === 0 || blocked}><Icon name="push" />Push to Launchpad</button>
            </div>
          )}

          <section className="card" style={{ marginTop: 16 }}>
            <h2>Create and forget: make this a daily finder</h2>
            <p className="sub">Every day it runs this search, skips anyone already in Launchpad, looks up the new ones and adds them to Launchpad with a note saying why they fit. A Launchpad workflow on the tag <code>leads-finder-new</code> sends the "found N new leads" message by SMS, WhatsApp or email.</p>
            <form className="form-grid" onSubmit={saveFinder}>
              <div className="full"><label className="f" htmlFor="fname">Name</label><input type="text" id="fname" value={fName} maxLength={160} onChange={(e) => setFName(e.target.value)} /></div>
              <div className="sched">
                <div><label className="f" htmlFor="fper">New leads per run</label><input type="number" id="fper" value={fPer} min={1} max={100} step={1} inputMode="numeric" onChange={(e) => setFPer(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} /></div>
                <div><label className="f" htmlFor="fstart">Start date</label><input type="date" id="fstart" value={fStart} min={todayIn(c.timezone)} onChange={(e) => setFStart(e.target.value)} /></div>
                <div><label className="f" htmlFor="ftime">Run time</label><input type="time" id="ftime" value={fTime} step={300} onChange={(e) => setFTime(e.target.value)} /></div>
                <div><label className="f" htmlFor="frep">Repeat</label><select className="in" id="frep" value={fRep} onChange={(e) => setFRep(e.target.value)}><option value="daily">Every day</option><option value="weekdays">Weekdays only</option><option value="weekly">Once a week (on the start day)</option></select></div>
              </div>
              <div className="full checks one"><label><input type="checkbox" checked={fNotify} onChange={(e) => setFNotify(e.target.checked)} /> Notify by SMS / WhatsApp / email through the Launchpad workflow (tag leads-finder-new)</label></div>
              <div className="full actions"><button className="btn secondary" type="submit"><Icon name="calendar" />Save as a daily finder</button><span className="hint">{isPeople ? `Costs up to the chosen number of lookup credits per run. Times are ${c.timezone}.` : 'Company records only; no lookup credits.'}</span></div>
            </form>
          </section>
        </>
      )}

      {!landing && (
        <section className="card" style={{ marginTop: 16 }}>
          <h2>Daily Leads Finders</h2>
          <p className="sub">What runs on its own. "Run now" pulls today's batch immediately.</p>
          <FindersList refreshKey={fKey} onChange={setNFinders} />
        </section>
      )}

      <p className="foot">Searches are free and show first name, masked surname, title and company. Pushing looks each ticked person up for the full name, LinkedIn and the work email; a lookup credit is spent only when an email comes back. Pushed people land in Contacts under their company with Role, Industry, Company Size and LinkedIn URL, a note on the first contact of each company, and a "{c.pipeline || 'Business Development'}" outreach deal at its first stage.</p>
    </>
  );
}

function PersonCard({ p, roles, role, onRole, fit }: { p: Person; roles: string[]; role?: string; onRole: (v: string) => void; fit: string }) {
  const name = fullName(p);
  return (
    <>
      <span className="av" style={{ ['--h' as string]: hue(name) }}>{initials(p.first, p.last)}</span>
      <div className="lead-body">
        <div className="nm">{name} <span className="st">· {p.title}</span></div>
        <div className="st">{p.company}{p.domain && ` · ${p.domain}`}{p.city && ` · ${p.city}`}</div>
        <div className="pills">
          <InLp p={p} />
          {(p.has_email || p.email) && <span className="pill good">email</span>}
          {p.has_phone && <span className="pill">phone</span>}
          {(p.has_city || p.city) && <span className="pill">location</span>}
          <select className="role" aria-label="Role" value={role || roleFromTitle(p.title, roles)} onChange={(e) => onRole(e.target.value)} onClick={(e) => e.stopPropagation()}>
            {roles.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        {fit && <p className="fit"><Icon name="spark" /><span>{fit}</span></p>}
      </div>
    </>
  );
}

function OrgCard({ o, fit, onPeople }: { o: Org; fit: string; onPeople: () => void }) {
  const bits = [o.industry ? cap(o.industry) : '', o.employees ? `${nf(o.employees)} employees` : '', hq(o), o.revenue ? `$${o.revenue}` : ''].filter(Boolean);
  return (
    <>
      <span className="av co">{o.logo ? <img src={o.logo} alt="" loading="lazy" /> : <Icon name="building" />}</span>
      <div className="lead-body">
        <div className="nm">{o.name}</div>
        <div className="st">{bits.join(' · ')}</div>
        <div className="pills">
          {o.website && <a className="pill" href={o.website} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>web</a>}
          {o.linkedin && <a className="pill" href={o.linkedin} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>LinkedIn</a>}
          <a className="pill blue" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPeople(); }}>people here</a>
        </div>
        {fit && <p className="fit"><Icon name="spark" /><span>{fit}</span></p>}
      </div>
    </>
  );
}

/** Filters → the People/Companies tab's query string (arrays joined with |). */
export function filtersToQuery(f: object): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (Array.isArray(v)) { if (v.length) p.set(k, v.join('|')); }
    else if (typeof v === 'boolean') { if (!v) p.set(k, '0'); }
    else if (v) p.set(k, String(v));
  }
  return p.toString();
}
