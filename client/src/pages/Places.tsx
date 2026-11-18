import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { api, errText, nf } from '../api';
import { useApp } from '../App';
import { useBusy } from '../components/Busy';
import { Icon } from '../components/Icon';
import { usePeopleAt } from '../components/PeopleAt';
import { CardHead, EmptyState, Errors, Help, Kept, PushCount, PushedCompanies, ResultsHead, SelectBar } from '../components/ui';
import { keepDrop, keepGet, keepKey, keepPut } from '../keep';
import type { CompaniesPushed, Place, PlacesRes } from '../types';

const WHAT_IDEAS = ['hotels', 'restaurants', 'country clubs', 'dental clinics', 'car dealerships', 'gyms', 'law firms', 'property managers'];

/** One search as it was left: every page already loaded, the paging tokens, what was ticked and pushed. */
interface Snap { pages: Record<number, PlacesRes>; tokens: Record<number, string>; picks: string[]; pushed: CompaniesPushed | null; scroll?: number }

/** Local businesses from Google Maps: what and where in, places out; tick and push them as company records. */
export default function Places() {
  const { me, reload } = useApp();
  const c = me.client!;
  const busy = useBusy();
  const peopleAt = usePeopleAt();
  const loc = useLocation();
  const navType = useNavigationType();
  const [params, setParams] = useSearchParams();
  /* the search lives in the address, so the tab can come back to it and a link can open it */
  const qWhat = (params.get('what') || '').trim();
  const qWhere = (params.get('where') || '').trim();
  const page = Math.max(1, Math.min(10, Number(params.get('page')) || 1));
  const key = keepKey('places', c.slug, { what: qWhat.toLowerCase(), where: qWhere.toLowerCase() });

  const [what, setWhat] = useState(qWhat);
  const [where, setWhere] = useState(qWhere);
  const [pages, setPages] = useState<Record<number, PlacesRes>>({});
  // Google pages by token: each page's result carries the token for the next, kept per page so Previous works too.
  const [tokens, setTokens] = useState<Record<number, string>>({});
  const [at, setAt] = useState(0);
  const [nonce, setNonce] = useState(0);
  const force = useRef(false);
  const loaded = useRef('');
  const [err, setErr] = useState('');
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [pushed, setPushed] = useState<CompaniesPushed | null>(null);

  useEffect(() => {
    setWhat(qWhat); setWhere(qWhere); setErr('');
    if (!qWhat) { loaded.current = ''; setPages({}); setTokens({}); setPicks(new Set()); setPushed(null); return; }
    const hit = force.current ? null : keepGet<Snap>(key);
    force.current = false;
    let have: Snap = hit ? hit.v : { pages: {}, tokens: {}, picks: [], pushed: null };
    if (hit) {
      loaded.current = key;
      setPages(have.pages); setTokens(have.tokens); setPushed(have.pushed); setAt(hit.t);
      if (have.pages[page]) {
        // This page of this search is already here: show it as it was left.
        setPicks(new Set(have.picks));
        const back = navType === 'POP' || !!(loc.state as { restore?: boolean } | null)?.restore;
        if (back && have.scroll) { const y = have.scroll; requestAnimationFrame(() => window.scrollTo(0, y)); }
        return;
      }
    } else {
      setPages({}); setTokens({}); setPushed(null);
      have = { pages: {}, tokens: {}, picks: [], pushed: null };
    }
    // A later page needs the one before it (Google pages by token): without it, start from the first.
    if (page > 1 && !have.pages[page - 1]) { setParams({ what: qWhat, ...(qWhere ? { where: qWhere } : {}) }, { replace: true }); return; }
    setPicks(new Set());
    let live = true;
    busy.run(page > 1 ? 'Loading the next page… hang tight' : 'Searching Google Maps… hang tight', () => api<PlacesRes>('/places', { body: { what: qWhat, where: qWhere, page, token: have.tokens[page] || '' } }))
      .then((x) => {
        if (!live) return;
        loaded.current = key;
        setPages({ ...have.pages, [page]: x });
        setTokens({ ...have.tokens, [page + 1]: x.result.next_token || '' });
        if (!hit) setAt(Date.now());
        if (page > 1) window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch((x) => { if (live) setErr(errText(x)); });
    return () => { live = false; };
  }, [key, page, nonce]);

  useEffect(() => {
    if (!qWhat || loaded.current !== key || !Object.keys(pages).length) return;
    keepPut<Snap>(key, { pages, tokens, picks: [...picks], pushed, scroll: keepGet<Snap>(key)?.v.scroll }, at || Date.now());
  }, [pages, tokens, picks, pushed, at]);

  useEffect(() => () => {
    const snap = keepGet<Snap>(key);
    if (snap) keepPut<Snap>(key, { ...snap.v, scroll: window.scrollY }, snap.t);
  }, [key, page]);

  const go = (p: number) => setParams({ what: qWhat, ...(qWhere ? { where: qWhere } : {}), ...(p > 1 ? { page: String(p) } : {}) });
  const refresh = () => { keepDrop(key); force.current = true; if (page > 1) go(1); setNonce((n) => n + 1); };
  const search = (e: FormEvent) => {
    e.preventDefault();
    const w = what.trim(), l = where.trim();
    if (!w) return;
    // Searching what is already showing runs it again.
    if (w.toLowerCase() === qWhat.toLowerCase() && l.toLowerCase() === qWhere.toLowerCase()) { refresh(); return; }
    setParams({ what: w, ...(l ? { where: l } : {}) });
  };

  const r = pages[page] || null;
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
              <div><label className="f" htmlFor="pw">What</label><input type="text" id="pw" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="hotels, dental clinics, electrical distributors…" autoComplete="off" autoFocus={!qWhat} /></div>
              <div><label className="f" htmlFor="pl">Where</label><input type="text" id="pl" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Miami, FL · Santo Domingo · San José, Costa Rica" autoComplete="off" /></div>
              <div className="places-go"><button className="btn" type="submit" disabled={!what.trim()}><Icon name="search" />Search</button></div>
            </div>
            <div className="ideas" aria-label="Examples">
              {WHAT_IDEAS.map((w) => <button type="button" key={w} className={`pill${what === w ? ' on' : ''}`} onClick={() => setWhat(w)}>{w}</button>)}
            </div>
            <p className="hint" style={{ margin: '6px 0 0' }}>{me.sample || !c.has_maps ? 'Sample mode: the search returns sample places.' : 'Searches are free for you. Pushing a business creates a company record and spends no credits; open People on any business with a website to find who works there.'}</p>
          </form>
        </div>
      </section>

      {r && res && (
        <section className="grid one">
          <div className="card">
            <ResultsHead total={res.total} noun={`business${res.total === 1 ? '' : 'es'}${res.more ? ' so far' : ''}`} summary={<>{qWhat}{qWhere ? ` in ${qWhere}` : ''}{res.more ? ' · more pages available' : ''}</>}>
              <Kept at={at} onRefresh={refresh} />
            </ResultsHead>
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
                          <td className="num rowbtn">{p.domain ? <button type="button" className="btn secondary sm" onClick={() => peopleAt({ name: p.name, domain: p.domain })} title={`See the people at ${p.name}`}><Icon name="people" />People</button> : <span className="status" title="No website, so the research database cannot be searched for people here">no site</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pager">
                  <span>{nf(from)}–{nf(to)}{res.more ? ' · more available' : ' · end of the list'}</span>
                  <span className="sp">
                    <a className={`btn secondary sm${res.page <= 1 ? ' dis' : ''}`} onClick={() => res.page > 1 && go(res.page - 1)}>Previous</a>
                    <span style={{ margin: '0 6px' }}>Page {res.page}</span>
                    <a className={`btn secondary sm${res.more ? '' : ' dis'}`} onClick={() => res.more && go(res.page + 1)}>Next</a>
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
          <p>Google Maps lists the businesses that match the kind and the place you type, twenty a page, with their category, rating, address, phone and website. It covers hotels, restaurants, clinics, dealers, distributors and other local businesses the research database describes thinly, in any country.</p>
          <p>Pushing a business creates a company record in Launchpad with the address, rating and website on it. Credits are not spent. To reach the people who work there, use the <b>People</b> button on a business that has a website: it lists them beside the results, ready to tick and push.</p>
        </Help>
      )}
    </>
  );
}

function Stars({ p }: { p: Place }) {
  if (p.rating == null) return <span className="status">no rating</span>;
  return <span className="stars" title={`${p.rating} out of 5 from ${nf(p.reviews)} reviews`}><b>{p.rating.toFixed(1)}</b><Icon name="star" /><span className="st">{nf(p.reviews)}</span></span>;
}
