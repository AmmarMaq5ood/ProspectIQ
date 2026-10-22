import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errText, nf, peopleAtHref } from '../api';
import { useApp } from '../App';
import { useBusy } from '../components/Busy';
import { Icon } from '../components/Icon';
import { CardHead, EmptyState, Errors, Help, PushCount, PushedCompanies, ResultsHead, SelectBar } from '../components/ui';
import type { CompaniesPushed, Place, PlacesRes } from '../types';

const WHAT_IDEAS = ['hotels', 'restaurants', 'country clubs', 'dental clinics', 'car dealerships', 'gyms', 'law firms', 'property managers'];

/** Local businesses from Google Maps: what and where in, places out; tick and push them as company records. */
export default function Places() {
  const { me, reload } = useApp();
  const c = me.client!;
  const busy = useBusy();
  const nav = useNavigate();
  const [what, setWhat] = useState('');
  const [where, setWhere] = useState('');
  const [r, setR] = useState<PlacesRes | null>(null);
  const [err, setErr] = useState('');
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [pushed, setPushed] = useState<CompaniesPushed | null>(null);
  // Google pages by token: each page's result carries the token for the next, kept per page so Previous works too.
  const [tokens, setTokens] = useState<Record<number, string>>({});

  const run = async (page: number, fresh = false) => {
    setErr(''); setPushed(null);
    const toks = fresh ? {} : tokens;
    try {
      const x = await busy.run(page > 1 ? 'Loading the next page… hang tight' : 'Searching Google Maps… hang tight', () => api<PlacesRes>('/places', { body: { what, where, page, token: toks[page] || '' } }));
      setR(x); setPicks(new Set());
      setTokens({ ...toks, [page + 1]: x.result.next_token || '' });
      if (page > 1) window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (x) {
      setErr(errText(x)); setR(null);
    }
  };
  const search = (e: FormEvent) => { e.preventDefault(); void run(1, true); };

  const rows = r?.result.rows || [];
  const nSel = rows.filter((p) => picks.has(p.id)).length;
  const toggle = (id: string, on: boolean) => setPicks((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const pick = (m: 'all' | 'none' | 'email' | 'new' | 'icp') => setPicks(new Set(m === 'none' ? [] : rows.map((p) => p.id)));

  const push = async () => {
    if (!r) return;
    setErr('');
    try {
      const x = await busy.run('Pushing to Launchpad… creating the company records', () => api<CompaniesPushed>('/push/places', { body: { picks: [...picks], places: rows } }));
      setPushed(x); setPicks(new Set());
      await reload();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (x) {
      setErr(errText(x));
    }
  };

  const res = r?.result;
  const from = res ? (res.page - 1) * res.per_page + 1 : 0;
  const to = res ? (res.page - 1) * res.per_page + res.rows.length : 0;

  return (
    <>
      {pushed && <PushedCompanies data={pushed} />}
      <Errors errors={err ? [err] : []} />

      <section className="grid one">
        <div className="card">
          <CardHead icon="pin" title="Local businesses" sub="Find hotels, restaurants, clinics, dealers or any kind of business by what it is and where it is, from Google Maps. Tick the ones you want and push them to Launchpad as company records." />
          <form onSubmit={search}>
            <div className="form-grid places-form">
              <div><label className="f" htmlFor="pw">What</label><input type="text" id="pw" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="hotels, dental clinics, car dealerships…" autoComplete="off" autoFocus /></div>
              <div><label className="f" htmlFor="pl">Where</label><input type="text" id="pl" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Miami, FL · Orlando · Dallas, TX" autoComplete="off" /></div>
              <div className="places-go"><button className="btn" type="submit" disabled={!what.trim()}><Icon name="search" />Search</button></div>
            </div>
            <div className="ideas" aria-label="Examples">
              {WHAT_IDEAS.map((w) => <button type="button" key={w} className={`pill${what === w ? ' on' : ''}`} onClick={() => setWhat(w)}>{w}</button>)}
            </div>
            <p className="hint" style={{ margin: '6px 0 0' }}>{me.sample || !c.has_maps ? 'Sample mode: the search returns sample places.' : 'Searches are free for you. Pushing a business creates a company record and spends no credits; find the people there afterwards from the People tab.'}</p>
          </form>
        </div>
      </section>

      {r && res && (
        <section className="grid one">
          <div className="card">
            <ResultsHead total={res.total} noun={`business${res.total === 1 ? '' : 'es'}${res.more ? ' so far' : ''}`} summary={<>{what}{where ? ` in ${where}` : ''}{res.more ? ' · more pages available' : ''}</>} />
            {r.warnings.map((w, i) => <p key={i} className="hint">{w}</p>)}
            {rows.length ? (
              <>
                <SelectBar onPick={pick} />
                <div className="scroll">
                  <table className="rows places">
                    <thead><tr><th scope="col"><input type="checkbox" checked={nSel > 0 && nSel === rows.length} onChange={(e) => pick(e.target.checked ? 'all' : 'none')} aria-label="Select all on this page" /></th><th scope="col">Business</th><th scope="col">Rating</th><th scope="col">Address</th><th scope="col">Phone</th><th scope="col">Links</th><th scope="col"></th></tr></thead>
                    <tbody>
                      {rows.map((p) => (
                        <tr key={p.id} className={picks.has(p.id) ? 'sel' : ''}>
                          <td><input type="checkbox" checked={picks.has(p.id)} onChange={(e) => toggle(p.id, e.target.checked)} aria-label={`Select ${p.name}`} /></td>
                          <td><div className="co who"><span className="av co">{(p.name || '?').slice(0, 1).toUpperCase()}</span><div><span className="nm">{p.name}</span><span className="st">{[p.category, p.price, p.open_state].filter(Boolean).join(' · ')}</span></div></div></td>
                          <td><Stars p={p} /></td>
                          <td className="addr">{p.address || <span className="status">—</span>}</td>
                          <td className="nowrap">{p.phone || <span className="status">—</span>}</td>
                          <td><div className="links">{p.website && <a className="lnk" href={p.website} target="_blank" rel="noopener" title="Website" aria-label={`${p.name} website`}><Icon name="globe" /></a>}{p.maps_url && <a className="lnk" href={p.maps_url} target="_blank" rel="noopener" title="Open in Google Maps" aria-label={`${p.name} on Google Maps`}><Icon name="pin" /></a>}{p.phone && <a className="lnk" href={`tel:${p.phone.replace(/[^+\d]/g, '')}`} title={p.phone} aria-label={`Call ${p.name}`}><Icon name="phone" /></a>}</div></td>
                          <td className="num rowbtn">{p.domain ? <a className="btn secondary sm" onClick={() => nav(peopleAtHref(p.domain))} title={`People at ${p.name}`}><Icon name="people" />People</a> : <span className="status" title="No website, so the research database cannot be searched for people here">no site</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pager">
                  <span>{nf(from)}–{nf(to)}{res.more ? ' · more available' : ' · end of the list'}</span>
                  <span className="sp">
                    <a className={`btn secondary sm${res.page <= 1 ? ' dis' : ''}`} onClick={() => res.page > 1 && run(res.page - 1)}>Previous</a>
                    <span style={{ margin: '0 6px' }}>Page {res.page}</span>
                    <a className={`btn secondary sm${res.more ? '' : ' dis'}`} onClick={() => res.more && run(res.page + 1)}>Next</a>
                  </span>
                </div>
                <div className="pushbar">
                  <PushCount n={nSel} people={false} nEmail={0} left={c.credits.left} />
                  {me.sample && <span className="hint">Sample mode: pushing is off.</span>}
                  <button className="btn" type="button" onClick={push} disabled={me.sample || nSel === 0}><Icon name="push" />Push to Launchpad</button>
                </div>
              </>
            ) : <EmptyState icon="pin" title="Nothing found" text="Try a broader kind of business, or a bigger area such as a city instead of a neighbourhood." />}
          </div>
        </section>
      )}

      {!r && (
        <Help title="How this works" more="client-guide#local-businesses">
          <p>Google Maps lists the businesses that match the kind and the place you type, twenty a page, with their category, rating, address, phone and website. It covers hotels, restaurants, clinics, dealers and other local businesses the research database describes thinly.</p>
          <p>Pushing a business creates a company record in Launchpad with the address, rating and website on it. Credits are not spent. To reach the people who buy there, use the <b>People</b> button on a business that has a website: it opens the People tab filtered to that company.</p>
        </Help>
      )}
    </>
  );
}

function Stars({ p }: { p: Place }) {
  if (p.rating == null) return <span className="status">no rating</span>;
  return <span className="stars" title={`${p.rating} out of 5 from ${nf(p.reviews)} reviews`}><b>{p.rating.toFixed(1)}</b><Icon name="star" /><span className="st">{nf(p.reviews)}</span></span>;
}
