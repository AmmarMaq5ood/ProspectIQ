import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ago, api, cap, errText, fullName, hq, hue, initials, money, nf, outOfCredits, peopleAtHref, todayIn } from '../api';
import { useApp } from '../App';
import { useBusy } from '../components/Busy';
import { FindersList } from '../components/FindersList';
import { Icon } from '../components/Icon';
import { CardHead, Criteria, EmptyState, Errors, Fold, Help, InLp, LpFilter, Notice, Pager, PerPage, PushCount, PushedCompanies, PushedPeople, ResultsHead, SelectBar, type CritGroup } from '../components/ui';
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
  const rephrase = () => { const el = inputRef.current; if (el) { el.focus(); el.select(); window.scrollTo({ top: 0, behavior: 'smooth' }); } };

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

  /* "understood as", grouped by facet */
  const groups: CritGroup[] = [];
  if (res) {
    const i = res.intent;
    groups.push({ label: 'Titles', facet: 'title', values: i.titles });
    groups.push({ label: 'Seniority', facet: 'people', values: i.seniorities.map((x) => options.seniority[x] || x) });
    groups.push({ label: 'Department', facet: 'people', values: i.departments });
    groups.push({ label: 'Industry', facet: 'industry', values: i.industry_keywords });
    groups.push({ label: 'Companies', facet: 'industry', values: [...(i.company_name ? [i.company_name] : []), ...(i.company_domains || [])] });
    groups.push({ label: 'Location', facet: 'place', values: [...i.person_locations, ...i.company_locations] });
    groups.push({ label: 'Not in', facet: 'not', values: i.exclude_locations });
    groups.push({ label: 'Company size', facet: 'size', values: i.employee_ranges.map((x) => options.employee_ranges[x] || x) });
    groups.push({ label: 'Revenue', facet: 'size', values: i.revenue_min || i.revenue_max ? [(i.revenue_min ? money(i.revenue_min) : '') + (i.revenue_max ? ` to ${money(i.revenue_max)}` : '+')] : [] });
    groups.push({ label: 'Uses', facet: 'tech', values: i.technologies });
    groups.push({ label: 'Keywords', facet: 'other', values: i.keywords ? [i.keywords] : [] });
  }
  const refineHref = res ? `/${kind}?${filtersToQuery(res.filters)}` : '';
  const editBtn = <a className="btn secondary sm" onClick={() => nav(refineHref)}><Icon name="filter" />Edit filters</a>;

  const pill = (autofocus: boolean) => (
    <form className="ask-pill" onSubmit={submit}>
      <span className="ask-spark"><Icon name="spark" /></span>
      <input ref={inputRef} type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask for leads… e.g. purchasing managers at valve makers in Texas with 100 to 1,000 employees" autoComplete="off" aria-label="What leads are you looking for" autoFocus={autofocus} />
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
            <ResultsHead total={res.result.total} noun={isPeople ? 'people' : 'companies'} summary={res.intent.summary}>
              {editBtn}
              <PerPage value={pp} options={options.per_page} onChange={(n) => go(q, { pp: String(n) })} />
            </ResultsHead>
            <Criteria groups={groups} />
            {rows.length ? (
              <>
                <SelectBar onPick={pick} email={isPeople} newOnly={isPeople && nLp > 0} nLp={nLp} hide={hideLp} onHide={setHideLp} />
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
            ) : allRows.length ? (
              <EmptyState icon="people" title="Everyone on this page is already in Launchpad" text="They are hidden by the switch below. Show them, or move to the next page.">
                <LpFilter n={nLp} hide={hideLp} onChange={setHideLp} />
              </EmptyState>
            ) : (
              <EmptyState icon="search" title="No one matched all of these conditions" text="The more conditions a request has, the fewer people fit them all. Try dropping the company size or widening the location, or adjust each condition in the filters.">
                {editBtn}
                <a className="btn ghost sm" onClick={rephrase}><Icon name="spark" />Rephrase the request</a>
              </EmptyState>
            )}
          </div>
          {rows.length > 0 && (
            <div className="pushbar">
              <PushCount n={nSel} people={isPeople} nEmail={nEmail} left={left} waterfall={c.email_waterfall} />
              {me.sample && <span className="hint">Sample mode: pushing is off.</span>}
              {isPeople && left <= 0 && <span className="warn">{outOfCredits(c)}</span>}
              {!me.sample && isPeople && left > 0 && nEmail > left && <span className="warn">Only {nf(left)} credits left this month: untick {nEmail - left}.</span>}
              <button className="btn" type="button" onClick={push} disabled={me.sample || nSel === 0 || blocked}><Icon name="push" />Push to Launchpad</button>
            </div>
          )}

          {allRows.length > 0 && (
            <Fold icon="calendar" title="Make this a daily finder" sub="Runs this search every day, skips anyone already in Launchpad and adds the new leads with a note on why they fit." label="Set up">
              <form className="form-grid" onSubmit={saveFinder}>
                <div className="full"><label className="f" htmlFor="fname">Name</label><input type="text" id="fname" value={fName} maxLength={160} onChange={(e) => setFName(e.target.value)} /></div>
                <div className="sched">
                  <div><label className="f" htmlFor="fper">New leads per run</label><input type="number" id="fper" value={fPer} min={1} max={100} step={1} inputMode="numeric" onChange={(e) => setFPer(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} /></div>
                  <div><label className="f" htmlFor="fstart">Start date</label><input type="date" id="fstart" value={fStart} min={todayIn(c.timezone)} onChange={(e) => setFStart(e.target.value)} /></div>
                  <div><label className="f" htmlFor="ftime">Run time</label><input type="time" id="ftime" value={fTime} step={300} onChange={(e) => setFTime(e.target.value)} /></div>
                  <div><label className="f" htmlFor="frep">Repeat</label><select className="in" id="frep" value={fRep} onChange={(e) => setFRep(e.target.value)}><option value="daily">Every day</option><option value="weekdays">Weekdays only</option><option value="weekly">Once a week (on the start day)</option></select></div>
                </div>
                <div className="full checks one"><label><input type="checkbox" checked={fNotify} onChange={(e) => setFNotify(e.target.checked)} /> Notify by SMS, WhatsApp or email when new leads land (Launchpad workflow on the tag <code>leads-finder-new</code>)</label></div>
                <div className="full actions"><button className="btn" type="submit"><Icon name="calendar" />Save as a daily finder</button><span className="hint">{isPeople ? `Spends up to ${fPer} lookup credit${fPer === 1 ? '' : 's'} per run. ` : 'Company records only; no lookup credits. '}All finders together add up to {c.auto_push?.daily ?? 50} leads a day, and up to {c.auto_push?.max_finders ?? 2} can run at a time. Times are {c.timezone}.</span></div>
              </form>
            </Fold>
          )}
        </>
      )}

      {!landing && (
        <section className="card">
          <CardHead icon="calendar" title="Daily Leads Finders" sub={'What runs on its own. "Run now" pulls today\'s batch immediately.'} />
          <FindersList refreshKey={fKey} onChange={setNFinders} />
        </section>
      )}

      <Help title="How searching and pushing work">
        <p>Searches are free and show first name, masked surname, title and company. Pushing looks each ticked person up for the full name, LinkedIn and the work email; a lookup credit is spent only when an email comes back.</p>
        <p>Pushed people land in Contacts under their company with Role, Industry, Company Size and LinkedIn URL, a note on the first contact of each company, and a "{c.pipeline || 'Business Development'}" outreach deal at its first stage.</p>
      </Help>
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
