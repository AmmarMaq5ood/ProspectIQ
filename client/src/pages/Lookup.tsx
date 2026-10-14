import { useState, type FormEvent } from 'react';
import { api, cap, errText, fullName, hq, nf, outOfCredits } from '../api';
import { useApp } from '../App';
import { useBusy } from '../components/Busy';
import { Chips } from '../components/Chips';
import { Icon } from '../components/Icon';
import { CardHead, Checks, Errors, InLp, LpLink, Notice, PushCount, SelectBar } from '../components/ui';
import { sizeBucket } from './Research';
import type { Org, PeoplePushed, Person } from '../types';

interface LookupRes { org: Org; people: Person[]; note: string; message: string; imports: string; sample: boolean }

const SIX = ['owner', 'c_suite', 'vp', 'head', 'director', 'manager'];

/** One domain in: the company, its buyers, a drafted note and message; tick and push. */
export default function Lookup() {
  const { me, options, reload } = useApp();
  const c = me.client!;
  const busy = useBusy();
  const [domain, setDomain] = useState('');
  const [pp, setPp] = useState(10);
  const [sen, setSen] = useState<string[]>(SIX);
  const [titles, setTitles] = useState<string[]>(c.profile.default_titles);
  const [imports, setImports] = useState('');
  const [open, setOpen] = useState(false);
  const [r, setR] = useState<LookupRes | null>(null);
  const [err, setErr] = useState('');
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [pushed, setPushed] = useState<PeoplePushed | null>(null);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setErr(''); setPushed(null);
    try {
      const x = await busy.run('Looking the company up… hang tight', () => api<LookupRes>('/lookup', { body: { domain, pp, sen, titles, imports } }));
      setR(x); setNote(x.note); setMessage(x.message); setRoles({});
      setPicks(new Set(x.people.filter((p) => !p.in_lp).slice(0, 5).map((p) => p.id)));
    } catch (x) {
      setErr(errText(x)); setR(null);
    }
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
      const x = await busy.run('Pushing to Launchpad… looking each person up, then creating the records', () => api<PeoplePushed>('/push/lookup', { body: { org: r.org, people: r.people, picks: [...picks], roles, note, message, imports } }));
      setPushed(x);
      await reload();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (x) {
      setErr(errText(x));
    }
  };

  const sixOpts = Object.fromEntries(SIX.map((k) => [k, options.seniority[k] || k]));

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
                ...x.contacts.map((p, j) => <li key={`p${j}`}><div className="t"><LpLink href={p.id ? l.contacts[j] : ''}>{p.name}</LpLink></div><div className="m">{p.role}{p.new ? ' · created' : ' · updated'}{p.email ? ` · ${p.email}` : ' · no work email on file'}</div></li>),
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
          <CardHead icon="link" title="Look up a company" sub="Type the company's web domain: its facts and the people who buy there come back, with a research note and a connection message drafted for the push." />
          <form onSubmit={search}>
            <div className="search-row">
              <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="flowserve.com" autoComplete="off" aria-label="Company domain" autoFocus />
              <button className="btn" type="submit" disabled={!domain.trim()}><Icon name="search" />Search</button>
            </div>
            <details className="fg" style={{ border: 0, marginTop: 8 }} open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
              <summary style={{ padding: '8px 0' }}>More options: how many people, which titles and seniority, ImportGenius findings</summary>
              <div className="form-grid" style={{ padding: '4px 0 8px' }}>
                <div><label className="f" htmlFor="lpp">People to pull</label><select className="in" id="lpp" value={pp} onChange={(e) => setPp(Number(e.target.value))}>{[5, 10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
                <div><span className="f">Seniority</span><Checks options={sixOpts} selected={sen} onChange={setSen} /></div>
                <div className="full"><Chips id="ltitles" label="Titles to look for" values={titles} onChange={setTitles} placeholder="purchasing, plant manager…" /></div>
                <div className="full"><label className="f" htmlFor="imports">ImportGenius summary (optional; goes into the company description and the note)</label><textarea id="imports" value={imports} onChange={(e) => setImports(e.target.value)} placeholder="e.g. 14 shipments in 12 months, HTS 8481 valve bodies, suppliers in Taichung and Ningbo via Port of Houston, est. $1.1M/yr" /></div>
              </div>
            </details>
            <p className="hint" style={{ margin: '6px 0 0' }}>{me.sample ? 'Sample mode: the search returns sample data.' : 'The search is free. Credits are spent only on push, one per contact whose work email is found.'}</p>
          </form>
        </div>
      </section>

      {r && (
        <>
          <section className="grid one">
            <div className="card">
              <h2>Company</h2>
              <p className="sub">What is on file, plus your import findings</p>
              <div className="org">
                <div>
                  <p className="desc"><strong>{r.org.name}</strong>{r.org.description && <> — {r.org.description}</>}</p>
                  {imports.trim() && <p className="desc"><strong>Imports:</strong> {imports}</p>}
                  {r.org.keywords.length > 0 && <div className="kw">{r.org.keywords.map((k) => <span key={k}>{k}</span>)}</div>}
                </div>
                <dl>
                  <dt>Industry</dt><dd>{r.org.industry ? cap(r.org.industry) : '—'}</dd>
                  <dt>Size</dt><dd>{r.org.employees ? `${nf(r.org.employees)} employees (${sizeBucket(r.org.employees)})` : '—'}</dd>
                  <dt>Revenue</dt><dd>{r.org.revenue ? `$${r.org.revenue}` : '—'}</dd>
                  <dt>HQ</dt><dd>{hq(r.org) || '—'}</dd>
                  <dt>Founded</dt><dd>{r.org.founded || '—'}</dd>
                  <dt>Website</dt><dd>{r.org.website ? <a href={r.org.website} target="_blank" rel="noopener">{r.org.website.replace(/^https?:\/\//, '')}</a> : '—'}</dd>
                  <dt>LinkedIn</dt><dd>{r.org.linkedin ? <a href={r.org.linkedin} target="_blank" rel="noopener">company page</a> : '—'}</dd>
                </dl>
              </div>
            </div>
          </section>

          <section className="grid one">
            <div className="card">
              <h2>People</h2>
              <p className="sub">Tick who goes into Launchpad. The first ticked contact gets the note and the outreach deal. Surnames are masked until the push, which fills in the full name, LinkedIn and the work email where one exists. Roles are guessed from the title; change any.</p>
              {r.people.length ? (
                <>
                  <SelectBar onPick={(m) => pick(m === 'new' ? 'all' : m)} email />
                  <div className="scroll">
                    <table className="rows people">
                      <thead><tr><th scope="col"></th><th scope="col">Name</th><th scope="col">Title</th><th scope="col">Role</th><th scope="col">Email on file</th><th scope="col">LinkedIn</th></tr></thead>
                      <tbody>
                        {r.people.map((p) => (
                          <tr key={p.id} className={`${p.in_lp ? 'dim' : ''}${picks.has(p.id) ? ' sel' : ''}`.trim()}>
                            <td><input type="checkbox" checked={picks.has(p.id)} onChange={(e) => setPicks((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} aria-label={`Push ${fullName(p)}`} /></td>
                            <td><span className="nm">{fullName(p)} <InLp p={p} /></span>{p.city && <span className="st">{p.city}</span>}</td>
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
              ) : <p className="empty">No people matched. Widen the titles or seniorities and search again.</p>}
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
            <PushCount n={nSel} people nEmail={nEmail} left={left} />
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
