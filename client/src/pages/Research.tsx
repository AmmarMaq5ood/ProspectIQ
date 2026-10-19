import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, cap, errText, fullName, hq, money, nf, outOfCredits, peopleAtHref, hue, initials } from '../api';
import { useApp } from '../App';
import { useBusy } from '../components/Busy';
import { Chips } from '../components/Chips';
import { Icon } from '../components/Icon';
import { CardHead, Checks, Errors, Field, Group, Help, IcpPill, InLp, Pager, PerPage, PushCount, PushedCompanies, PushedPeople, Range, ResultsHead, SelectBar, Criteria } from '../components/ui';
import { roleFromTitle } from '../roles';
import { filtersToQuery } from './Scout';
import type { CompaniesPushed, Filters, Org, PeoplePushed, Person, SearchResult, IcpMatch } from '../types';
import type { CritGroup } from '../components/ui';

type Mode = 'people' | 'companies' | 'industries';

const KEYS: (keyof Filters)[] = ['titles', 'similar', 'not_titles', 'name', 'kw', 'sen', 'dep', 'ploc', 'pnot', 'oloc', 'onot', 'domains', 'okw', 'oname', 'size', 'rev_min', 'rev_max', 'tech', 'fund', 'founded_min', 'founded_max', 'email', 'oids'];

export function emptyFilters(): Filters {
  return { titles: [], similar: true, not_titles: [], name: '', kw: '', sen: [], dep: [], ploc: [], pnot: [], oloc: [], onot: [], domains: [], okw: [], oname: '', size: [], rev_min: '', rev_max: '', tech: [], fund: [], founded_min: '', founded_max: '', email: [], oids: [] };
}

function decode(params: URLSearchParams): Filters {
  const f = emptyFilters() as unknown as Record<string, unknown>;
  for (const k of KEYS) {
    const v = params.get(k);
    if (v == null) continue;
    const cur = f[k];
    if (Array.isArray(cur)) f[k] = v.split('|').map((s) => s.trim()).filter(Boolean);
    else if (typeof cur === 'boolean') f[k] = v !== '0';
    else f[k] = v;
  }
  return f as unknown as Filters;
}

const count = (f: Filters, keys: (keyof Filters)[]) => keys.reduce((n, k) => { const v = f[k]; return n + (Array.isArray(v) ? v.length : v ? 1 : 0); }, 0);

/** The People, Companies and Industries tabs: a filter rail, a table, a push bar. */
export default function Research({ mode }: { mode: Mode }) {
  const { me, options, reload } = useApp();
  const c = me.client!;
  const busy = useBusy();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [hideLp, setHideLp] = useState(false);
  const people = mode === 'people';
  const kind = people ? 'people' : 'companies';
  const filters = decode(params);
  /* the active filters, grouped and colour-coded like Scout's "Understood as" row */
  const depLabel = (code: string) => { for (const g of Object.values(options.departments)) if (g[code]) return g[code]; return code; };
  const critGroups: CritGroup[] = [
    { label: 'Titles', facet: 'title', values: filters.titles },
    { label: 'Not titles', facet: 'not', values: filters.not_titles },
    { label: 'Seniority', facet: 'people', values: filters.sen.map((x) => options.seniority[x] || x) },
    { label: 'Department', facet: 'people', values: filters.dep.map(depLabel) },
    { label: 'Located in', facet: 'place', values: filters.ploc },
    { label: 'Not in', facet: 'not', values: filters.pnot },
    { label: 'Company', facet: 'industry', values: [...(filters.oname ? [filters.oname] : []), ...filters.domains, ...filters.okw] },
    { label: 'Headquarters', facet: 'place', values: filters.oloc },
    { label: 'HQ not in', facet: 'not', values: filters.onot },
    { label: 'Company size', facet: 'size', values: filters.size.map((x) => options.employee_ranges[x] || x) },
    { label: 'Revenue', facet: 'size', values: filters.rev_min || filters.rev_max ? [`${filters.rev_min ? money(Number(filters.rev_min)) : '$0'} to ${filters.rev_max ? money(Number(filters.rev_max)) : 'any'}`] : [] },
    { label: 'Funding', facet: 'other', values: filters.fund.map((x) => options.funding[x] || x) },
    { label: 'Founded', facet: 'other', values: filters.founded_min || filters.founded_max ? [`${filters.founded_min || 'any'} to ${filters.founded_max || 'any'}`] : [] },
    { label: 'Uses', facet: 'tech', values: filters.tech },
    { label: 'Email', facet: 'other', values: filters.email.map((x) => options.email_status[x] || x) },
    { label: 'Keywords', facet: 'other', values: [...(filters.kw ? [filters.kw] : []), ...(filters.name ? [filters.name] : [])] },
  ];
  const active = [...params.keys()].some((k) => (KEYS as string[]).includes(k));
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pp = options.per_page.includes(Number(params.get('pp'))) ? Number(params.get('pp')) : 25;

  const [res, setRes] = useState<SearchResult<Person | Org> | null>(null);

  const [icp, setIcp] = useState<Record<string, IcpMatch>>({});
  const [err, setErr] = useState('');
  const [pushed, setPushed] = useState<{ people?: PeoplePushed; companies?: CompaniesPushed } | null>(null);
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [roles, setRoles] = useState<Record<string, string>>({});

  useEffect(() => {
    setPushed(null); setErr(''); setPicks(new Set()); setRoles({});
    if (!active) { setRes(null); return; }
    let live = true;
    busy.run('Searching the research database… hang tight', () => api<{ result: SearchResult<Person | Org> | null; icp?: Record<string, IcpMatch> }>('/search', { body: { kind, mode, filters, page, pp } }))
      .then((r) => { if (live) { setRes(r.result); setIcp(r.icp || {}); } })
      .catch((e) => { if (live) { setErr(errText(e)); setRes(null); } });
    return () => { live = false; };
  }, [params.toString()]);

  const search = (f: Filters, over: Record<string, string> = {}) => setParams(new URLSearchParams(filtersToQuery({ ...f }) + (Object.keys(over).length ? `&${new URLSearchParams(over)}` : '')));

  const allRows = res?.rows || [];
  const inLp = (r: Person | Org) => people && !!(r as Person).in_lp;
  const nLp = allRows.filter(inLp).length;
  const rows = hideLp ? allRows.filter((r) => !inLp(r)) : allRows;
  const withEmail = (r: Person | Org) => people && (!!(r as Person).has_email || !!(r as Person).email);
  const nSel = rows.filter((r) => picks.has(r.id)).length;
  const nEmail = rows.filter((r) => picks.has(r.id) && withEmail(r)).length;
  const left = c.credits.left;
  const blocked = people && (left <= 0 || nEmail > left);
  const pick = (m: 'all' | 'none' | 'email' | 'new' | 'icp') => setPicks(new Set(rows.filter((r) => m === 'all' || (m === 'email' && withEmail(r)) || (m === 'new' && !inLp(r)) || (m === 'icp' && icp[r.id]?.level === 'icp')).map((r) => r.id)));
  const toggle = (id: string, on: boolean) => setPicks((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  const push = async () => {
    setErr('');
    try {
      if (people) {
        const r = await busy.run('Pushing to Launchpad… looking each person up, then creating the records', () => api<PeoplePushed>('/push/people', { body: { picks: [...picks], people: rows, roles } }));
        setPushed({ people: r });
      } else {
        const r = await busy.run('Pushing to Launchpad… creating the company records', () => api<CompaniesPushed>('/push/companies', { body: { picks: [...picks], companies: rows } }));
        setPushed({ companies: r });
      }
      setPicks(new Set());
      await reload();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setErr(errText(e));
    }
  };

  /* starting points, built from the client's profile */
  const inds = c.profile.industries;
  const titles = c.profile.default_titles.filter((t) => t.includes(' ')).slice(0, 3);
  const presets: { label: string; f: Partial<Filters> }[] = people
    ? [
        { label: `${titles.length ? titles.map(cap).join(', ') : 'Buyers'} at ${inds.slice(0, 2).join(' and ') || 'target'} companies in the US`, f: { titles: titles.length ? titles : c.profile.default_titles.slice(0, 3), okw: inds.slice(0, 2), oloc: ['United States'], sen: ['manager', 'director', 'head', 'vp'] } },
        { label: 'Owners and executives, 200 to 2,000 employees', f: { sen: ['owner', 'founder', 'c_suite', 'vp'], okw: inds.slice(0, 3), size: ['201,500', '501,1000', '1001,2000'] } },
      ]
    : mode === 'companies'
      ? [
          { label: `${cap(inds[0] || 'Target')} companies in the United States`, f: { okw: inds.slice(0, 1), oloc: ['United States'] } },
          { label: `${cap(inds[1] || inds[0] || 'Target')} companies with 50 to 500 employees`, f: { okw: inds.slice(1, 2).length ? inds.slice(1, 2) : inds.slice(0, 1), size: ['51,100', '101,200', '201,500'] } },
          { label: '$10M to $500M revenue', f: { okw: inds.slice(0, 2), rev_min: '10000000', rev_max: '500000000' } },
        ]
      : [
          { label: `${inds.slice(0, 3).map(cap).join(', ') || 'Your industries'} in the US and Mexico`, f: { okw: inds.slice(0, 3), oloc: ['United States', 'Mexico'] } },
          { label: `${cap(inds[3] || inds[0] || 'Target')}, 100+ employees`, f: { okw: inds.slice(3, 5).length ? inds.slice(3, 5) : inds.slice(0, 2), size: ['101,200', '201,500', '501,1000', '1001,2000', '2001,5000'] } },
        ];

  return (
    <>
      {pushed?.people && <PushedPeople data={pushed.people} />}
      {pushed?.companies && <PushedCompanies data={pushed.companies} />}
      <Errors errors={err ? [err] : []} />
      <div className="rs">
        <Rail key={params.toString()} mode={mode} initial={filters} suggestions={mode === 'industries' ? inds : inds.slice(0, 6)} onSearch={(f) => search(f, { pp: String(pp) })} onClear={() => setParams({})} />
        <section className="results">
          {!res ? (
            <div className="card">
              <CardHead icon={people ? 'people' : mode === 'companies' ? 'building' : 'chart'} title={people ? 'Find people' : mode === 'companies' ? 'Find companies' : 'Map an industry'} sub={people
                ? 'Pick titles, seniority, departments, locations and company filters on the left. The search is free; a lookup credit is spent only when a pushed person\'s work email is found.'
                : mode === 'companies'
                  ? 'Search by name, industry keywords, headquarters, size, revenue, funding or technologies. Push companies as records, or jump to the people at any of them.'
                  : 'Start from what an industry makes (industry keywords), add where and how big, and see the companies in it with a size and headquarters breakdown. Then find the buyers at them in one click.'} />
              <span className="f">Start from an example</span>
              <div className="sugg" style={{ marginTop: 4 }}>
                {presets.map((p) => <a className="btn secondary sm" key={p.label} onClick={() => search({ ...emptyFilters(), ...p.f })}>{p.label}</a>)}
              </div>
            </div>
          ) : (
            <>
              {mode === 'industries' && <IndustrySummary res={res as SearchResult<Org>} okw={filters.okw} />}
              <div className="card">
                <ResultsHead total={res.total} noun={people ? 'people' : 'companies'} summary={people ? 'surnames are masked until the push' : undefined}>
                  <PerPage value={pp} options={options.per_page} onChange={(n) => search(filters, { pp: String(n) })} />
                </ResultsHead>
                <Criteria groups={critGroups} />
                {mode === 'industries' && rows.length > 0 && (
                  <div className="rowtools">
                    <a className="btn secondary sm" onClick={() => nav(`/people?${filtersToQuery({ oids: rows.map((r) => r.id), sen: ['vp', 'head', 'director', 'manager'], dep: ['master_operations', 'supply_chain', 'logistics', 'quality_management'] })}`)}><Icon name="people" />Find buyers at these {rows.length} companies</a>
                    <span className="hint">Operations, supply chain, logistics and quality, manager and up. Change anything on the People tab.</span>
                  </div>
                )}
                <SelectBar onPick={pick} icp={Object.values(icp).some((m) => m.level === 'icp')} email={people} newOnly={people && nLp > 0} nLp={nLp} hide={hideLp} onHide={setHideLp} />
                {people
                  ? <PeopleTable rows={rows as Person[]} icp={icp} picks={picks} toggle={toggle} roles={roles} setRole={(id, v) => setRoles((m) => ({ ...m, [id]: v }))} roleList={c.profile.roles} onAll={(on) => pick(on ? 'all' : 'none')} />
                  : <CompaniesTable rows={rows as Org[]} picks={picks} toggle={toggle} onAll={(on) => pick(on ? 'all' : 'none')} onPeople={(d) => nav(peopleAtHref(d))} />}
                <Pager res={res} onPage={(p) => search(filters, { page: String(p), pp: String(pp) })} />
              </div>
              <div className="pushbar">
                <PushCount n={nSel} people={people} nEmail={nEmail} left={left} waterfall={c.email_waterfall} />
                {me.sample && <span className="hint">Sample mode: pushing is off.</span>}
                {people && left <= 0 && <span className="warn">{outOfCredits(c)}</span>}
                {!me.sample && people && left > 0 && nEmail > left && <span className="warn">Only {nf(left)} credits left this month: untick {nEmail - left}.</span>}
                <button className="btn" type="button" onClick={push} disabled={me.sample || nSel === 0 || blocked}><Icon name="push" />Push to Launchpad</button>
              </div>
            </>
          )}
        </section>
      </div>
      <Help title="How searching and pushing work">
        <p>Searches are free and show first name, masked surname, title and company. Pushing looks each ticked person up for the full name, LinkedIn and the work email; a lookup credit is spent only when an email comes back.</p>
        <p>Pushed people land in Contacts under their company with Role, Industry, Company Size and LinkedIn URL, a research note on the first contact of each company, and a "{c.pipeline || 'Business Development'}" outreach deal at its first stage. Re-pushing updates the same records.</p>
      </Help>
    </>
  );
}

/* ---- the filter rail ---- */

function Rail({ mode, initial, suggestions, onSearch, onClear }: { mode: Mode; initial: Filters; suggestions: string[]; onSearch: (f: Filters) => void; onClear: () => void }) {
  const { options } = useApp();
  const people = mode === 'people';
  const [f, setF] = useState<Filters>(initial);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form className="card rail" onSubmit={(e) => { e.preventDefault(); onSearch(f); }}>
      <div className="rh"><h2><Icon name="filter" />Filters</h2><a onClick={onClear} style={{ cursor: 'pointer' }}>Clear all</a></div>
      {f.oids.length > 0 && (
        <div className="fb" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <span className="pill blue">Limited to {f.oids.length} companies from your industry search</span> <a className="hint" onClick={() => set('oids', [])} style={{ cursor: 'pointer' }}>remove</a>
        </div>
      )}
      {people && (
        <>
          <Group label="Job title" count={count(f, ['titles', 'not_titles'])} open>
            <Chips id="titles" label="Titles" values={f.titles} onChange={(v) => set('titles', v)} placeholder="purchasing manager, plant manager…" hint="Press Enter after each one. Matches the current title." />
            <div className="checks one"><label><input type="checkbox" checked={f.similar} onChange={(e) => set('similar', e.target.checked)} /> Include similar titles</label></div>
            <Chips id="not_titles" label="Exclude titles" values={f.not_titles} onChange={(v) => set('not_titles', v)} placeholder="assistant, intern…" />
          </Group>
          <Group label="Seniority" count={f.sen.length}><Checks options={options.seniority} selected={f.sen} onChange={(v) => set('sen', v)} /></Group>
          <Group label="Department" count={f.dep.length}>
            {Object.entries(options.departments).map(([g, opts]) => <div key={g}><span className="f" style={{ marginBottom: 4 }}>{g}</span><Checks options={opts} selected={f.dep} onChange={(v) => set('dep', v)} /></div>)}
          </Group>
          <Group label="Person location" count={count(f, ['ploc', 'pnot'])}>
            <Chips id="ploc" label="Located in" values={f.ploc} onChange={(v) => set('ploc', v)} placeholder="Texas, US · Monterrey, Mexico…" hint='City, state or country. "Texas, US" or "United States".' />
            <Chips id="pnot" label="Not located in" values={f.pnot} onChange={(v) => set('pnot', v)} placeholder="California, US…" />
          </Group>
        </>
      )}
      <Group label="Company" count={count(f, people ? ['domains', 'okw', 'oloc', 'onot'] : ['oname', 'okw', 'oloc', 'onot'])} open={!people}>
        {people
          ? <Chips id="domains" label="Company domains" values={f.domains} onChange={(v) => set('domains', v)} placeholder="dezurik.com, flowserve.com…" hint="People at these companies only." />
          : <Field id="oname" label="Company name"><input type="text" id="oname" value={f.oname} placeholder="contains…" autoComplete="off" onChange={(e) => set('oname', e.target.value)} /></Field>}
        <Chips id="okw" label="Industry keywords" values={f.okw} onChange={(v) => set('okw', v)} placeholder="industrial valves, castings…" hint="What the company makes or does." suggestions={suggestions} />
        <Chips id="oloc" label="Headquarters in" values={f.oloc} onChange={(v) => set('oloc', v)} placeholder="United States · Ohio, US…" />
        <Chips id="onot" label="Headquarters not in" values={f.onot} onChange={(v) => set('onot', v)} placeholder="China · India…" />
      </Group>
      <Group label="Company size" count={f.size.length}><Checks options={options.employee_ranges} selected={f.size} onChange={(v) => set('size', v)} /></Group>
      <Group label="Revenue" count={count(f, ['rev_min', 'rev_max'])}>
        <Range label="Annual revenue, USD" min={f.rev_min} max={f.rev_max} phMin="10000000" phMax="500000000" onMin={(v) => set('rev_min', v)} onMax={(v) => set('rev_max', v)} />
        <p className="hint">Whole dollars: 10000000 is $10M.</p>
      </Group>
      <Group label="Funding and age" count={count(f, ['fund', 'founded_min', 'founded_max'])}>
        <div><span className="f">Latest funding stage</span><Checks options={options.funding} selected={f.fund} onChange={(v) => set('fund', v)} /></div>
        <Range label="Founded between" min={f.founded_min} max={f.founded_max} phMin="1950" phMax="2020" onMin={(v) => set('founded_min', v)} onMax={(v) => set('founded_max', v)} />
      </Group>
      <Group label="Technologies" count={f.tech.length}><Chips id="tech" label="Uses any of" values={f.tech} onChange={(v) => set('tech', v)} placeholder="salesforce, sap, netsuite…" hint="Technology names as commonly written." /></Group>
      {people && (
        <>
          <Group label="Email" count={f.email.length}><Checks options={options.email_status} selected={f.email} onChange={(v) => set('email', v)} /></Group>
          <Group label="Keywords and name" count={count(f, ['kw', 'name'])}>
            <Field id="kw" label="Keywords"><input type="text" id="kw" value={f.kw} placeholder="anywhere in the profile" autoComplete="off" onChange={(e) => set('kw', e.target.value)} /></Field>
            <Field id="name" label="Person name"><input type="text" id="name" value={f.name} placeholder="Sean Smith" autoComplete="off" onChange={(e) => set('name', e.target.value)} /></Field>
          </Group>
        </>
      )}
      <div className="rf"><button className="btn" type="submit"><Icon name="search" />Search</button></div>
    </form>
  );
}

/* ---- tables ---- */

function AllBox({ rows, picks, onAll }: { rows: { id: string }[]; picks: Set<string>; onAll: (on: boolean) => void }) {
  const n = rows.filter((r) => picks.has(r.id)).length;
  return <input type="checkbox" aria-label="Select all on this page" checked={n > 0 && n === rows.length} ref={(el) => { if (el) el.indeterminate = n > 0 && n < rows.length; }} onChange={(e) => onAll(e.target.checked)} />;
}

function PeopleTable({ rows, picks, toggle, roles, setRole, roleList, onAll, icp = {} }: { rows: Person[]; icp?: Record<string, IcpMatch>; picks: Set<string>; toggle: (id: string, on: boolean) => void; roles: Record<string, string>; setRole: (id: string, v: string) => void; roleList: string[]; onAll: (on: boolean) => void }) {
  return (
    <div className="scroll">
      <table className="rows people">
        <thead><tr><th scope="col"><AllBox rows={rows} picks={picks} onAll={onAll} /></th><th scope="col">Name</th><th scope="col">Title</th><th scope="col">Company</th><th scope="col">On file</th><th scope="col">Role in Launchpad</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className={`${p.in_lp ? 'dim' : ''}${picks.has(p.id) ? ' sel' : ''}${icp[p.id]?.level === 'icp' ? ' hot' : icp[p.id]?.level === 'target' ? ' high' : ''}`.trim()}>
              <td><input type="checkbox" checked={picks.has(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} aria-label={`Select ${fullName(p)}`} /></td>
              <td><div className="who"><span className="av" style={{ ['--h' as string]: hue(fullName(p)) }}>{initials(p.first, p.last)}</span><div><span className="nm">{fullName(p)}</span>{p.city && <span className="st">{p.city}</span>}{p.email && <span className="st">{p.email}</span>}</div></div></td>
              <td>{p.title}</td>
              <td><span className="nm">{p.company}</span>{p.domain && <span className="st">{p.domain}</span>}</td>
              <td><IcpPill m={icp[p.id]} /> <InLp p={p} /> {(p.has_email || p.email) && <span className="pill good">email</span>} {p.has_phone && <span className="pill">phone</span>} {(p.has_city || p.city) && <span className="pill">location</span>}{!(p.in_lp || p.has_email || p.email || p.has_phone || p.has_city || p.city) && <span className="status">—</span>}</td>
              <td><select aria-label="Role" value={roles[p.id] || roleFromTitle(p.title, roleList)} onChange={(e) => setRole(p.id, e.target.value)}>{roleList.map((r) => <option key={r}>{r}</option>)}</select></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompaniesTable({ rows, picks, toggle, onAll, onPeople }: { rows: Org[]; picks: Set<string>; toggle: (id: string, on: boolean) => void; onAll: (on: boolean) => void; onPeople: (domain: string) => void }) {
  return (
    <div className="scroll">
      <table className="rows">
        <thead><tr><th scope="col"><AllBox rows={rows} picks={picks} onAll={onAll} /></th><th scope="col">Company</th><th scope="col">Industry</th><th scope="col" className="num">Size</th><th scope="col">Headquarters</th><th scope="col" className="num">Revenue</th><th scope="col" className="num">Founded</th><th scope="col">Links</th><th scope="col"></th></tr></thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className={picks.has(o.id) ? 'sel' : ''}>
              <td><input type="checkbox" checked={picks.has(o.id)} onChange={(e) => toggle(o.id, e.target.checked)} aria-label={`Select ${o.name}`} /></td>
              <td><div className="co who">{o.logo ? <img className="logo" src={o.logo} alt="" loading="lazy" /> : <span className="av co">{(o.name || '?').slice(0, 1).toUpperCase()}</span>}<div><span className="nm">{o.name}</span><span className="st">{o.domain}</span></div></div></td>
              <td>{o.industry ? <span className="pill ind">{cap(o.industry)}</span> : <span className="status">—</span>}</td>
              <td className="num">{o.employees ? nf(o.employees) : <span className="status">—</span>}</td>
              <td>{hq(o) || <span className="status">—</span>}</td>
              <td className="num">{o.revenue ? `$${o.revenue}` : <span className="status">—</span>}</td>
              <td className="num">{o.founded || <span className="status">—</span>}</td>
              <td><div className="links">{o.website && <a className="lnk" href={o.website} target="_blank" rel="noopener" title="Website" aria-label={`${o.name} website`}><Icon name="globe" /></a>}{o.linkedin && <a className="lnk" href={o.linkedin} target="_blank" rel="noopener" title="LinkedIn" aria-label={`${o.name} on LinkedIn`}><Icon name="linkedin" /></a>}{o.phone && <a className="lnk" href={`tel:${o.phone.replace(/[^+\d]/g, '')}`} title={o.phone} aria-label={`Call ${o.name}, ${o.phone}`}><Icon name="phone" /></a>}</div></td>
              <td className="num rowbtn"><a className="btn secondary sm" onClick={() => onPeople(o.domain)} title={`People at ${o.name}`}><Icon name="people" />People</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IndustrySummary({ res, okw }: { res: SearchResult<Org>; okw: string[] }) {
  const bump = (m: Record<string, number>, k: string) => { if (k) m[k] = (m[k] || 0) + 1; };
  const bands: Record<string, number> = {}, states: Record<string, number> = {};
  let rev = 0;
  for (const o of res.rows) {
    if (o.employees) bump(bands, sizeBucket(o.employees));
    bump(states, o.state || o.country);
    rev += o.revenue_n || 0;
  }
  const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const li = (m: Record<string, number>) => (Object.keys(m).length ? <ul className="mini">{top(m).map(([k, v]) => <li key={k}><span>{k}</span><b>{v}</b></li>)}</ul> : <p className="empty" style={{ margin: '4px 0 0' }}>—</p>);
  const label = okw.length ? okw.join(', ') : 'this industry';
  return (
    <section className="tiles" aria-label="Industry summary">
      <div className="kpi hero"><div className="l">Companies found</div><div className="v">{nf(res.total)}</div><div className="n" title={label}>{label}</div></div>
      <div className="kpi"><div className="l">On this page</div><div className="v">{res.rows.length}</div><div className="n">combined revenue {rev > 0 ? money(rev) : '—'}</div></div>
      <div className="kpi"><div className="l">By size</div>{li(bands)}</div>
      <div className="kpi"><div className="l">By headquarters</div>{li(states)}</div>
    </section>
  );
}

export function sizeBucket(n: number): string {
  if (!n) return '';
  if (n <= 10) return '1-10';
  if (n <= 50) return '11-50';
  if (n <= 200) return '51-200';
  if (n <= 500) return '200-500';
  if (n <= 1000) return '500-1000';
  if (n <= 5000) return '1000-5000';
  return '5000+';
}
