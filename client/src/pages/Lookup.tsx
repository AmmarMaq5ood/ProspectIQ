import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { api, cap, errText, fullName, hq, markPushedRows, nf, outOfCredits, hue, initials } from '../api';
import { useApp } from '../App';
import { useBusy } from '../components/Busy';
import { Chips } from '../components/Chips';
import { Icon } from '../components/Icon';
import { CardHead, Checks, EmptyState, Errors, InLp, Kept, LpLink, Notice, PushCount, SelectBar } from '../components/ui';
import { keepDrop, keepGet, keepKey, keepPut } from '../keep';
import { sizeBucket } from './Research';
import type { Org, PeoplePushed, Person } from '../types';

interface LookupRes { org: Org; people: Person[]; note: string; message: string; imports: string; sample: boolean; others?: Org[] }
/** A name that fits several companies comes back as a list to choose from. */
interface Choices { candidates: Org[]; q: string; sample: boolean }
type Answer = LookupRes | Choices;
const isChoices = (a: Answer): a is Choices => Array.isArray((a as Choices).candidates);

const SIX = ['owner', 'c_suite', 'vp', 'head', 'director', 'manager'];
interface Opts { pp: number; sen: string[]; titles: string[]; imports: string; open: boolean }
/** One lookup as it was left: the company, its people, what was ticked, the edited note and message. */
interface Snap { r: LookupRes | null; choices: Org[] | null; picks: string[]; roles: Record<string, string>; note: string; message: string; pushed: PeoplePushed | null; scroll?: number }

/** A company's name or website in: the company, its buyers, a drafted note and message; tick and push. */
export default function Lookup() {
  const { me, options, reload } = useApp();
  const c = me.client!;
  const busy = useBusy();
  const loc = useLocation();
  const navType = useNavigationType();
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') || '').trim();

  /* the options under "More options" stay as set for the whole visit */
  const optsKey = keepKey('lookup-opts', c.slug, 1);
  const [opts, setOpts] = useState<Opts>(() => keepGet<Opts>(optsKey)?.v || { pp: 10, sen: SIX, titles: c.profile.default_titles, imports: '', open: false });
  const opt = <K extends keyof Opts>(k: K, v: Opts[K]) => setOpts((o) => ({ ...o, [k]: v }));
  useEffect(() => { keepPut(optsKey, opts); }, [opts]);

  const key = keepKey('lookup', c.slug, { q: q.toLowerCase() });
  const [text, setText] = useState(q);
  const [r, setR] = useState<LookupRes | null>(null);
  const [choices, setChoices] = useState<Org[] | null>(null);
  const [at, setAt] = useState(0);
  const [nonce, setNonce] = useState(0);
  const force = useRef(false);
  const loaded = useRef('');
  const [err, setErr] = useState('');
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [pushed, setPushed] = useState<PeoplePushed | null>(null);

  useEffect(() => {
    setText(q); setErr('');
    if (!q) { loaded.current = ''; setR(null); setChoices(null); setPushed(null); setPicks(new Set()); setRoles({}); return; }
    // A lookup already done in this browser tab comes back as it was left, the edited note included.
    const hit = force.current ? null : keepGet<Snap>(key);
    force.current = false;
    if (hit) {
      loaded.current = key;
      setR(hit.v.r); setChoices(hit.v.choices); setPicks(new Set(hit.v.picks)); setRoles(hit.v.roles); setNote(hit.v.note); setMessage(hit.v.message); setPushed(hit.v.pushed); setAt(hit.t);
      const back = navType === 'POP' || !!(loc.state as { restore?: boolean } | null)?.restore;
      if (back && hit.v.scroll) { const y = hit.v.scroll; requestAnimationFrame(() => window.scrollTo(0, y)); }
      return;
    }
    setPushed(null);
    let live = true;
    busy.run('Looking the company up… hang tight', () => api<Answer>('/lookup', { body: { q, pp: opts.pp, sen: opts.sen, titles: opts.titles, imports: opts.imports } }))
      .then((x) => {
        if (!live) return;
        loaded.current = key;
        setAt(Date.now());
        if (isChoices(x)) { setChoices(x.candidates); setR(null); setPicks(new Set()); setRoles({}); setNote(''); setMessage(''); return; }
        setChoices(null); setR(x); setNote(x.note); setMessage(x.message); setRoles({});
        setPicks(new Set(x.people.filter((p) => !p.in_lp).slice(0, 5).map((p) => p.id)));
      })
      .catch((x) => { if (live) { setErr(errText(x)); setR(null); setChoices(null); } });
    return () => { live = false; };
  }, [key, nonce]);

  useEffect(() => {
    if ((!r && !choices) || !q || loaded.current !== key) return;
    keepPut<Snap>(key, { r, choices, picks: [...picks], roles, note, message, pushed, scroll: keepGet<Snap>(key)?.v.scroll }, at || Date.now());
  }, [r, choices, picks, roles, note, message, pushed, at]);

  useEffect(() => () => {
    const snap = keepGet<Snap>(key);
    if (snap) keepPut<Snap>(key, { ...snap.v, scroll: window.scrollY }, snap.t);
  }, [key]);

  const refresh = () => { keepDrop(key); force.current = true; setNonce((n) => n + 1); };
  const search = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    // Searching the company that is already showing runs it again, with the options as they are now.
    if (t.toLowerCase() === q.toLowerCase()) { refresh(); return; }
    setParams({ q: t });
  };

  const withEmail = (p: Person) => !!p.has_email || !!p.email;
  const nSel = r ? r.people.filter((p) => picks.has(p.id)).length : 0;
  const nEmail = r ? r.people.filter((p) => picks.has(p.id) && withEmail(p)).length : 0;
  const left = c.credits.left;
  const blocked = left <= 0 || nEmail > left;
  const pick = (m: 'all' | 'none' | 'email') => r && setPicks(new Set(r.people.filter((p) => m === 'all' || (m === 'email' && withEmail(p))).map((p) => p.id)));

  const push = async () => {
    if (!r) return;
    setErr('');
    try {
      const x = await busy.run('Pushing to Launchpad… looking each person up, then creating the records', () => api<PeoplePushed>('/push/lookup', { body: { org: r.org, people: r.people, picks: [...picks], roles, note, message, imports: opts.imports } }));
      setPushed(x);
      setR((cur) => (cur ? { ...cur, people: markPushedRows(cur.people, x) } : cur));
      await reload();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (x) {
      setErr(errText(x));
    }
  };

  const sixOpts = Object.fromEntries(SIX.map((k) => [k, options.seniority[k] || k]));
  const byName = !!q && !/^\S+\.[a-z]{2,}(\/.*)?$/i.test(q);

  return (
    <>
      {pushed && (
        <Notice kind="ok">
          <p><strong>Pushed to Launchpad.</strong> Each record opens in a new tab:</p>
          <ul className="items">
            {pushed.results.map((x, i) => {
              const l = pushed.links[i] || { company: '', opportunity: '', contacts: [] };
              return [
                <li key="c"><div className="t"><LpLink href={x.company.id ? l.company : ''}>{x.company.name}</LpLink></div><div className="m">Company record{!x.company.id && ' (not created: contacts are grouped by company name instead)'}</div></li>,
                ...x.contacts.map((p, j) => <li key={`p${j}`}><div className="t"><LpLink href={p.id ? l.contacts[j] : ''}>{p.name}</LpLink></div><div className="m">{p.role}{p.new ? ' · created' : ' · updated'}{p.email ? <> · {p.email}{p.email_source === 'waterfall' && <span className={`pill ${p.email_verified ? 'good' : ''}`} style={{ marginLeft: 6 }}>{p.email_verified ? 'found by the email waterfall' : 'found by the email waterfall · unverified'}</span>}</> : ' · no work email on file'}</div></li>),
                x.opportunity.id ? <li key="o"><div className="t"><LpLink href={l.opportunity}>{x.opportunity.name}</LpLink></div><div className="m">{x.opportunity.created ? 'Outreach deal created at the first stage' : 'Outreach deal already existed'}{x.note_added ? ' · research note and connection message saved on the first contact' : ' · the note was already on the first contact'}</div></li> : null,
              ];
            })}
          </ul>
          {pushed.errors.map((e, i) => <p key={i}>{e}</p>)}
          {typeof pushed.credits_left === 'number' && <p>{pushed.credits_spent ? `${pushed.credits_spent} credit${pushed.credits_spent === 1 ? '' : 's'} used` : 'No credits used'} · {nf(pushed.credits_left)} left.</p>}
          <p>Next: {pushed.bd ? <a href={pushed.bd} target="_blank" rel="noopener">open the pipeline in Launchpad</a> : 'open the pipeline in Launchpad'}, or look up the next company.</p>
        </Notice>
      )}
      <Errors errors={err ? [err] : []} />

      <section className="grid one">
        <div className="card">
          <CardHead icon="link" title="Look up a company" sub="Type the company's name or its website. Its facts and the people who buy there come back, with a research note and a connection message drafted for the push." />
          <form onSubmit={search}>
            <div className="search-row">
              <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Company name or website, such as Flowserve or flowserve.com" autoComplete="off" aria-label="Company name or website" autoFocus={!q} />
              <button className="btn" type="submit" disabled={!text.trim()}><Icon name="search" />Look up</button>
            </div>
            <details className="fg lookup-more" open={opts.open} onToggle={(e) => opt('open', (e.target as HTMLDetailsElement).open)}>
              <summary>More options: how many people, which titles and seniority, your own findings</summary>
              <div className="form-grid" style={{ padding: '4px 0 8px' }}>
                <div><label className="f" htmlFor="lpp">People to pull</label><select className="in" id="lpp" value={opts.pp} onChange={(e) => opt('pp', Number(e.target.value))}>{[5, 10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
                <div><span className="f">Seniority</span><Checks options={sixOpts} selected={opts.sen} onChange={(v) => opt('sen', v)} /></div>
                <div className="full"><Chips id="ltitles" label="Titles to look for" values={opts.titles} onChange={(v) => opt('titles', v)} placeholder="purchasing, plant manager…" /></div>
                <div className="full"><label className="f" htmlFor="imports">Import records or other findings (optional; they go into the company description and the note)</label><textarea id="imports" value={opts.imports} onChange={(e) => opt('imports', e.target.value)} placeholder="e.g. 14 shipments in 12 months, HTS 8481 valve bodies, suppliers in Taichung and Ningbo via Port of Houston, est. $1.1M/yr" /></div>
              </div>
            </details>
            <p className="hint" style={{ margin: '6px 0 0' }}>{me.sample ? 'Sample mode: the search returns sample data.' : 'The search is free. Credits are spent only on push, one per contact whose work email is found.'}</p>
          </form>
        </div>
      </section>

      {choices && (
        <section className="grid one">
          <div className="card">
            <CardHead icon="building" title={`Which "${q}" did you mean?`} sub="More than one company goes by that name. Pick the one you want and its people come back." />
            {choices.length ? (
              <ul className="choices">
                {choices.map((o) => (
                  <li key={o.id || o.domain}>
                    <button type="button" onClick={() => setParams({ q: o.domain })}>
                      <span className="av co">{o.logo ? <img src={o.logo} alt="" loading="lazy" /> : (o.name || '?').slice(0, 1).toUpperCase()}</span>
                      <span className="who-t">
                        <span className="nm">{o.name}</span>
                        <span className="st">{[o.domain, o.industry ? cap(o.industry) : '', hq(o), o.employees ? `${nf(o.employees)} employees` : ''].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="go">Look up<Icon name="arrow-right" /></span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon="building" title="No company by that name" text="Try the company's website address instead, such as flowserve.com." />}
            <p className="hint" style={{ margin: '12px 0 0' }}>Not in the list? Type the company's website address instead; that always finds the exact company.</p>
          </div>
        </section>
      )}

      {r && (
        <>
          <section className="grid one">
            <div className="card">
              <CardHead title="Company" sub={byName ? `Found by the name "${q}". Not the one you meant? ${r.others?.length ? 'Pick another below, or type' : 'Type'} its website address instead.` : 'What is on file for this company'}>
                <Kept at={at} onRefresh={refresh} />
              </CardHead>
              {byName && !!r.others?.length && (
                <details className="fg others">
                  <summary>{r.others.length} other compan{r.others.length === 1 ? 'y goes' : 'ies go'} by this name</summary>
                  <ul className="choices" style={{ padding: '8px 0 12px' }}>
                    {r.others.map((o) => (
                      <li key={o.id || o.domain}>
                        <button type="button" onClick={() => setParams({ q: o.domain })}>
                          <span className="av co">{o.logo ? <img src={o.logo} alt="" loading="lazy" /> : (o.name || '?').slice(0, 1).toUpperCase()}</span>
                          <span className="who-t"><span className="nm">{o.name}</span><span className="st">{[o.domain, o.industry ? cap(o.industry) : '', hq(o), o.employees ? `${nf(o.employees)} employees` : ''].filter(Boolean).join(' · ')}</span></span>
                          <span className="go">Look up<Icon name="arrow-right" /></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="org">
                <div className="org-head">
                  <span className="av">{r.org.logo ? <img src={r.org.logo} alt="" /> : (r.org.name || '?').slice(0, 1).toUpperCase()}</span>
                  <div><h3>{r.org.name}</h3><span className="st">{r.org.domain}{r.org.industry ? ` · ${cap(r.org.industry)}` : ''}</span></div>
                </div>
                {r.org.description && <p className="desc">{r.org.description}</p>}
                {opts.imports.trim() && <p className="desc"><strong>Imports:</strong> {opts.imports}</p>}
                {r.org.keywords.length > 0 && <div className="kw">{r.org.keywords.map((k) => <span key={k}>{k}</span>)}</div>}
                <div className="facts">
                  <div><span>Industry</span><b>{r.org.industry ? cap(r.org.industry) : '—'}</b></div>
                  <div><span>Size</span><b>{r.org.employees ? `${nf(r.org.employees)} employees` : '—'}</b></div>
                  <div><span>Revenue</span><b>{r.org.revenue ? `$${r.org.revenue}` : '—'}</b></div>
                  <div><span>Headquarters</span><b>{hq(r.org) || '—'}</b></div>
                  <div><span>Founded</span><b>{r.org.founded || '—'}</b></div>
                  <div><span>Size band</span><b>{r.org.employees ? sizeBucket(r.org.employees) : '—'}</b></div>
                  <div><span>Website</span><b>{r.org.website ? <a href={r.org.website} target="_blank" rel="noopener">{r.org.website.replace(/^https?:\/\//, '')}</a> : '—'}</b></div>
                  <div><span>LinkedIn</span><b>{r.org.linkedin ? <a href={r.org.linkedin} target="_blank" rel="noopener">company page</a> : '—'}</b></div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid one">
            <div className="card">
              <h2>People</h2>
              <p className="sub">Tick who goes into Launchpad. The first ticked contact gets the note and the outreach deal. Surnames are masked until the push, which fills in the full name, LinkedIn and the work email where one exists. Roles are guessed from the title; change any.</p>
              {r.people.length ? (
                <>
                  <SelectBar onPick={(m) => pick(m === 'email' ? 'email' : m === 'none' ? 'none' : 'all')} email />
                  <div className="scroll">
                    <table className="rows people fit">
                      <thead><tr><th scope="col"></th><th scope="col">Name</th><th scope="col">Title</th><th scope="col">Role</th><th scope="col">Email on file</th><th scope="col">LinkedIn</th></tr></thead>
                      <tbody>
                        {r.people.map((p) => (
                          <tr key={p.id} className={`${p.in_lp ? 'dim' : ''}${picks.has(p.id) ? ' sel' : ''}`.trim()}>
                            <td><input type="checkbox" checked={picks.has(p.id)} onChange={(e) => setPicks((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} aria-label={`Push ${fullName(p)}`} /></td>
                            <td><div className="who"><span className="av" style={{ ['--h' as string]: hue(fullName(p)) }}>{initials(p.first, p.last)}</span><div><span className="nm">{fullName(p)} <InLp p={p} /></span>{p.city && <span className="st">{p.city}</span>}</div></div></td>
                            <td>{p.title}</td>
                            <td><select aria-label="Role" value={roles[p.id] || p.role || c.profile.roles[c.profile.roles.length - 1]} onChange={(e) => setRoles((m) => ({ ...m, [p.id]: e.target.value }))}>{c.profile.roles.map((x) => <option key={x}>{x}</option>)}</select></td>
                            <td>{p.email ? p.email : p.has_email ? <span className="pill good">yes, revealed on push</span> : <span className="status">none</span>}</td>
                            <td>{p.linkedin ? <a href={p.linkedin} target="_blank" rel="noopener">profile</a> : <span className="status">on push</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : <p className="empty">No people matched. Widen the titles or seniorities under More options and look the company up again.</p>}
            </div>
          </section>

          <section className="grid two">
            <div className="card">
              <h2>Research note</h2>
              <p className="sub">Saved on the first contact. Edit before pushing.</p>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 220 }} aria-label="Research note" />
            </div>
            <div className="card">
              <h2>Connection message</h2>
              <p className="sub">Drafted for the first contact; copied into the note so it is ready to send on LinkedIn.</p>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} style={{ minHeight: 220 }} aria-label="Connection message" />
            </div>
          </section>

          <div className="pushbar">
            <PushCount n={nSel} people nEmail={nEmail} left={left} waterfall={c.email_waterfall} />
            {me.sample && <span className="hint">Sample mode: pushing is off.</span>}
            {left <= 0 && <span className="warn">{outOfCredits(c)}</span>}
            {!me.sample && left > 0 && nEmail > left && <span className="warn">Only {nf(left)} credits left this month: untick {nEmail - left}.</span>}
            <button className="btn" type="button" onClick={push} disabled={me.sample || nSel === 0 || blocked}><Icon name="push" />Push to Launchpad</button>
          </div>
        </>
      )}
    </>
  );
}
