import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errText } from '../api';
import { useBusy } from '../components/Busy';
import { Chips } from '../components/Chips';
import { Icon } from '../components/Icon';
import { Errors, Notice } from '../components/ui';
import { CreditsRing, Num, Switch } from '../components/Motion';
import { fmtWhen, nf } from '../api';
import Usage from './Usage';
import Activity from './Activity';
import type { Angle, Client, CreditEntry, Credits, FinderView, MenuLink, Profile, AutoPush, SecretState } from '../types';

type Tab = 'launchpad' | 'profile' | 'templates' | 'credits' | 'keys' | 'access' | 'finders' | 'activity' | 'usage';
const TABS: [Tab, string, string][] = [['launchpad', 'Launchpad connection', 'link'], ['profile', 'Profile', 'building'], ['templates', 'Templates', 'list'], ['credits', 'Credits & visibility', 'chart'], ['keys', 'Keys', 'key'], ['access', 'Access & links', 'external'], ['finders', 'Finders', 'calendar'], ['activity', 'Activity', 'clock'], ['usage', 'Usage', 'chart']];

interface Loaded { client: Client; links: MenuLink[]; finders: FinderView[] }

/** One client's setup: each tab edits a slice and saves it on its own. */
export default function AdminClient() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const busy = useBusy();
  const [tab, setTab] = useState<Tab>('launchpad');
  const [data, setData] = useState<Loaded | null>(null);
  const [c, setC] = useState<Client | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const load = () => api<Loaded>(`/admin/clients/${encodeURIComponent(slug)}`).then((r) => { setData(r); setC(structuredClone(r.client)); }).catch((e) => setErr(errText(e)));
  useEffect(() => { load(); }, [slug]);

  const save = async (body: Record<string, unknown>, what: string) => {
    setErr(''); setOk('');
    try {
      const r = await api<{ client: Client; links: MenuLink[] }>(`/admin/clients/${encodeURIComponent(slug)}`, { method: 'PUT', body });
      setData((d) => (d ? { ...d, client: r.client, links: r.links } : d));
      setC(structuredClone(r.client));
      setOk(`${what} saved.`);
    } catch (e) {
      setErr(errText(e));
    }
  };

  if (!c || !data) return err ? <Errors errors={[err]} /> : <p className="empty">Loading…</p>;
  const set = (fn: (x: Client) => void) => setC((x) => { const n = structuredClone(x!); fn(n); return n; });

  return (
    <>
      <div className="page-head">
        <Link className="btn ghost sm" to="/admin/clients"><Icon name="chevron" />Clients</Link>
        <h1>{data.client.name} <span className="status">{c.slug}</span></h1>
        <span className="head-pills">
          {data.client.secrets?.token.set && data.client.launchpad.location_id ? <span className="pill good">Launchpad connected</span> : <span className="pill bad">not connected</span>}
          <span className="pill">{nf(Math.max(0, c.credits.monthly + c.credits.extra - c.credits.used))} credits left</span>
          {!c.enabled && <span className="pill bad">disabled</span>}
        </span>
        <a className="btn secondary sm" href={`${import.meta.env.BASE_URL}?key=${encodeURIComponent(c.access_key)}`} target="_blank" rel="noopener" style={{ marginLeft: 'auto' }}><Icon name="external" />Open as this client</a>
      </div>
      <div className="client-layout">
        <nav className="subnav" aria-label="Sections">
          {TABS.map(([k, label, icon]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setOk(''); setErr(''); }}><Icon name={icon} />{label}</button>)}
        </nav>
        <div className="subpane">
      {ok && <Notice kind="ok"><p>{ok}</p></Notice>}
      <Errors errors={err ? [err] : []} />

      {tab === 'launchpad' && <LaunchpadTab c={c} set={set} onSave={() => save({ name: c.name, launchpad: c.launchpad }, 'Launchpad connection')} setErr={setErr} setOk={setOk} />}
      {tab === 'profile' && <ProfileTab c={c} set={set} onSave={() => save({ profile: c.profile }, 'Profile')} onDraft={async (url) => {
        setErr(''); setOk('');
        try {
          const r = await busy.run('Drafting the profile… reading the website and writing a first pass', () => api<{ profile: Profile }>(`/admin/clients/${encodeURIComponent(slug)}/draft`, { body: { url } }));
          set((x) => { x.profile = { ...x.profile, ...r.profile, roles: r.profile.roles?.length ? r.profile.roles : x.profile.roles }; });
          setOk('Drafted from the website. Read it through, fix anything, then Save profile.');
        } catch (e) { setErr(errText(e)); }
      }} />}
      {tab === 'templates' && <TemplatesTab c={c} set={set} onSave={() => save({ profile: c.profile }, 'Templates')} />}
      {tab === 'credits' && <CreditsTab c={c} slug={slug} onToggleUsage={(v) => { set((x) => { x.flags.show_usage = v; }); save({ flags: { show_usage: v } }, 'Visibility'); }} onToggleActivity={(v) => { set((x) => { x.flags.show_activity = v; }); save({ flags: { show_activity: v } }, 'Visibility'); }} />}
      {tab === 'keys' && <KeysTab c={c} set={set} onSave={() => save({ keys: c.keys }, 'Keys')} onClear={(k) => { if (confirm('Remove this client\'s own key? The agency key takes over.')) save({ keys: { [k]: null } }, 'Keys'); }} />}
      {tab === 'access' && <AccessTab c={c} links={data.links} set={set} onSave={() => save({ enabled: c.enabled, name: c.name }, 'Access')} onRotate={async () => {
        if (!confirm('Rotate the access key? The old menu links stop working until you update them in Launchpad.')) return;
        try { const r = await api<{ client: Client; links: MenuLink[] }>(`/admin/clients/${encodeURIComponent(slug)}/rotate-key`, { body: {} }); setData((d) => (d ? { ...d, client: r.client, links: r.links } : d)); setC(structuredClone(r.client)); setOk('New access key issued.'); } catch (e) { setErr(errText(e)); }
      }} onDelete={async () => {
        if (!confirm(`Delete ${c.name} and everything saved for it (finders, usage log, cache)? This cannot be undone.`)) return;
        try { await api(`/admin/clients/${encodeURIComponent(slug)}`, { method: 'DELETE' }); nav('/admin'); } catch (e) { setErr(errText(e)); }
      }} />}
      {tab === 'finders' && (
        <section className="card">
          <h2>Daily Leads Finders</h2>
          <p className="sub">What this client has scheduled. They manage these themselves on their Daily finders tab.</p>
          {data.finders.length ? (
            <table>
              <thead><tr><th scope="col">Name</th><th scope="col">Kind</th><th scope="col">Schedule</th><th scope="col">State</th><th scope="col">Last result</th></tr></thead>
              <tbody>{data.finders.map((f) => <tr key={f.id}><td>{f.name}</td><td>{f.intent.kind}</td><td>{f.when}</td><td>{f.enabled ? <span className="pill good">on</span> : <span className="pill">paused</span>}</td><td>{f.last_result || <span className="status">never run</span>}</td></tr>)}</tbody>
            </table>
          ) : <p className="empty">None yet.</p>}
        </section>
      )}
      {tab === 'activity' && <Activity adminSlug={slug} timezone={c.launchpad.timezone} client={{ launchpad_app: c.launchpad.app_url, location_id: c.launchpad.location_id }} />}
      {tab === 'usage' && <Usage adminSlug={slug} timezone={c.launchpad.timezone} />}
        </div>
      </div>
    </>
  );
}

/* ---- tabs ---- */

function SaveBar({ hint, label, onSave, children }: { hint: string; label: string; onSave: () => void; children?: ReactNode }) {
  return <div className="savebar"><span className="hint">{hint}</span>{children}<button className="btn" type="button" onClick={onSave}><Icon name="check" />{label}</button></div>;
}

/** The state of a stored secret, in words: where the key in use comes from and its last four characters. */
function KeyState({ s, own }: { s?: SecretState; own?: boolean }) {
  if (!s || !s.set) return <span className="pill">not set</span>;
  const where = s.source === 'client' ? (own ? 'own key' : 'set') : s.source === 'agency' ? 'agency key from Settings' : s.source === 'env' ? 'agency key from the server' : 'set';
  return <span className={`pill ${s.source === 'client' || !own ? 'good' : 'blue'}`}>{where} · ends in {s.hint}</span>;
}

function Secret({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return <div className="secret"><input type={show ? 'text' : 'password'} id={id} value={value} placeholder={placeholder} autoComplete="off" onChange={(e) => onChange(e.target.value)} /><button type="button" onClick={() => setShow(!show)}>{show ? 'hide' : 'show'}</button></div>;
}

function LaunchpadTab({ c, set, onSave, setErr, setOk }: { c: Client; set: (fn: (x: Client) => void) => void; onSave: () => void; setErr: (s: string) => void; setOk: (s: string) => void }) {
  const busy = useBusy();
  const [test, setTest] = useState<{ ok: boolean; pipelines: { id: string; name: string; stages: string[] }[]; error?: string } | null>(null);
  const lp = c.launchpad;
  const L = (k: keyof Client['launchpad'], v: string) => set((x) => { (x.launchpad as unknown as Record<string, string>)[k] = v; });
  const runTest = async () => {
    setErr(''); setOk(''); setTest(null);
    try {
      const r = await busy.run('Testing the Launchpad connection… one moment', () => api<typeof test>(`/admin/clients/${encodeURIComponent(c.slug)}/test`, { body: { launchpad: { locationId: lp.location_id, token: lp.token } } }));
      setTest(r);
      if (!r?.ok) setErr(r?.error || 'Launchpad did not answer.');
    } catch (e) { setErr(errText(e)); }
  };
  return (
    <section className="card">
      <h2>Launchpad connection</h2>
      <p className="sub">The sub-account this client's leads go into. The token is a Private Integration token from that sub-account's settings with contacts, opportunities, businesses, notes, associations and users access.</p>
      <div className="form-grid">
        <div><label className="f" htmlFor="nm">Client name</label><input type="text" id="nm" value={c.name} onChange={(e) => set((x) => { x.name = e.target.value; })} /></div>
        <div><label className="f" htmlFor="tz">Timezone (for finder schedules)</label><input type="text" id="tz" value={lp.timezone} placeholder="America/New_York" onChange={(e) => L('timezone', e.target.value)} /></div>
        <div><label className="f" htmlFor="loc">Location id</label><input type="text" id="loc" value={lp.location_id} placeholder="the sub-account id" autoComplete="off" onChange={(e) => L('location_id', e.target.value)} /></div>
        <div><label className="f" htmlFor="tok">Private integration token <KeyState s={c.secrets?.token} /></label><Secret id="tok" value={lp.token} placeholder={c.secrets?.token.set ? 'leave blank to keep the current token' : 'pit-…'} onChange={(v) => L('token', v)} /></div>
        <div><label className="f" htmlFor="app">Launchpad app address (for the links back)</label><input type="text" id="app" value={lp.app_url} placeholder="https://app.launchpadinnovations.ai" onChange={(e) => L('app_url', e.target.value)} /></div>
        <div><label className="f" htmlFor="own">Deal owner (user id, optional)</label><input type="text" id="own" value={lp.owner} placeholder="assign new outreach deals to this user" onChange={(e) => L('owner', e.target.value)} /></div>
        <div><label className="f" htmlFor="pipe">Outreach pipeline name</label><input type="text" id="pipe" value={lp.pipeline} placeholder="Business Development" onChange={(e) => L('pipeline', e.target.value)} />
          {test?.ok && test.pipelines.length > 0 && <div className="stages">{test.pipelines.map((p) => <span key={p.id} className={`pill${p.name === lp.pipeline ? ' picked' : ''}`} onClick={() => L('pipeline', p.name)} title={p.stages.join(' → ')}>{p.name}</span>)}</div>}
        </div>
        <div><label className="f" htmlFor="qs">Quote stage name (optional)</label><input type="text" id="qs" value={lp.quote_stage} placeholder="the stage that counts as a quote sent" onChange={(e) => L('quote_stage', e.target.value)} /></div>
      </div>
      {test?.ok && <Notice kind="ok"><p><strong>Connected.</strong> {test.pipelines.length} pipeline{test.pipelines.length === 1 ? '' : 's'} found{test.pipelines.length ? ': click one above to use it for outreach deals.' : '.'}</p></Notice>}
      <SaveBar hint="Test uses the values in the form, saved or not; a blank token means the stored one. Tokens are never shown again once saved." label="Save connection" onSave={onSave}>
        <button className="btn secondary" type="button" onClick={runTest} disabled={!lp.location_id || !(lp.token || c.secrets?.token.set)}><Icon name="link" />Test connection</button>
      </SaveBar>
    </section>
  );
}

function ProfileTab({ c, set, onSave, onDraft }: { c: Client; set: (fn: (x: Client) => void) => void; onSave: () => void; onDraft: (url: string) => void }) {
  const p = c.profile;
  const P = <K extends keyof Profile>(k: K, v: Profile[K]) => set((x) => { x.profile[k] = v; });
  const [url, setUrl] = useState('');
  const angle = (i: number, k: keyof Angle, v: string) => P('angles', p.angles.map((a, j) => (j === i ? { ...a, [k]: v } : a)));
  return (
    <section className="card">
      <h2>Profile: what {c.name} sells and to whom</h2>
      <p className="sub">ProspectIQ reads this when it interprets a request, writes the "why they fit" lines, drafts research notes and picks the outreach angle. Plain words; no jargon needed.</p>
      <div className="draft">
        <div><label className="f" htmlFor="durl">Draft it from the website</label><input type="text" id="durl" value={url} placeholder="https://bambrellausa.com" onChange={(e) => setUrl(e.target.value)} /></div>
        <button className="btn secondary" type="button" onClick={() => onDraft(url)} disabled={!url.trim()}><Icon name="spark" />Draft with GPT</button>
      </div>
      <div className="form-grid">
        <div className="full"><label className="f" htmlFor="pc">Company name (as used in notes and messages)</label><input type="text" id="pc" value={p.company} onChange={(e) => P('company', e.target.value)} /></div>
        <div><label className="f" htmlFor="ps">What they sell</label><textarea id="ps" value={p.sells} onChange={(e) => P('sells', e.target.value)} placeholder="outdoor furniture and shade products: umbrellas, cantilevers, loungers…" /></div>
        <div><label className="f" htmlFor="pt">Who buys it</label><textarea id="pt" value={p.sells_to} onChange={(e) => P('sells_to', e.target.value)} placeholder="hotels, resorts and restaurants in the US, bought by purchasing, operations and design leaders" /></div>
        <div className="full"><Chips id="pind" label="Industries to search (keywords the research database understands)" values={p.industries} onChange={(v) => P('industries', v)} placeholder="hotels, resorts, restaurants…" hint="These also become the suggestions on the Companies and Industries tabs." /></div>
        <div><Chips id="proles" label="Roles in Launchpad (the Role field on contacts)" values={p.roles} onChange={(v) => P('roles', v)} placeholder="Purchasing, Operations, Executive, Other" hint='Keep "Other" last.' /></div>
        <div><Chips id="ptitles" label="Default titles for company lookups" values={p.default_titles} onChange={(v) => P('default_titles', v)} placeholder="purchasing, operations, owner…" /></div>
        <div className="full">
          <span className="f">Outreach angles (first match wins; "." matches everything, keep it last)</span>
          <div className="angles">
            {p.angles.map((a, i) => (
              <div className="angle" key={i}>
                <input type="text" value={a.match} placeholder="valve|pump|flow (matches industry, keywords, name)" aria-label="Match" onChange={(e) => angle(i, 'match', e.target.value)} />
                <input type="text" value={a.what} placeholder="what to offer them" aria-label="What" onChange={(e) => angle(i, 'what', e.target.value)} />
                <input type="text" value={a.why} placeholder="why it is worth a look (one sentence)" aria-label="Why" onChange={(e) => angle(i, 'why', e.target.value)} />
                <button className="btn ghost sm" type="button" aria-label="Remove" onClick={() => P('angles', p.angles.filter((_, j) => j !== i))}><Icon name="trash" /></button>
              </div>
            ))}
          </div>
          <div className="sugg"><button type="button" onClick={() => P('angles', [...p.angles, { match: '.', what: '', why: '' }])}>+ Add an angle</button></div>
        </div>
      </div>
      <SaveBar hint="Saving replaces the profile; templates are on their own tab." label="Save profile" onSave={onSave} />
    </section>
  );
}

function TemplatesTab({ c, set, onSave }: { c: Client; set: (fn: (x: Client) => void) => void; onSave: () => void }) {
  const t = c.profile.templates;
  const groups = Object.entries(t);
  const [newGroup, setNewGroup] = useState('');
  const setT = (next: Record<string, string[]>) => set((x) => { x.profile.templates = next; });
  const rename = (from: string, to: string) => { const out: Record<string, string[]> = {}; for (const [g, v] of groups) out[g === from ? to : g] = v; setT(out); };
  return (
    <section className="card">
      <h2>Templates</h2>
      <p className="sub">Ready-made requests the client sees on the Ask tab, grouped by theme. One request per line, written the way a person would ask.</p>
      <div className="tplg">
        {groups.map(([g, items]) => (
          <div className="g" key={g}>
            <input type="text" value={g} aria-label="Group name" onChange={(e) => rename(g, e.target.value)} />
            <button className="btn ghost sm" type="button" onClick={() => { const n = { ...t }; delete n[g]; setT(n); }}><Icon name="trash" />Remove group</button>
            <textarea value={items.join('\n')} onChange={(e) => setT({ ...t, [g]: e.target.value.split('\n') })} onBlur={(e) => setT({ ...t, [g]: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} placeholder={'Purchasing managers at hotel groups in Florida\nResorts in Texas with 100 to 1,000 employees'} />
          </div>
        ))}
      </div>
      <div className="newc" style={{ marginTop: 12 }}>
        <div><label className="f" htmlFor="ng">New group</label><input type="text" id="ng" value={newGroup} placeholder="Hotels & resorts" onChange={(e) => setNewGroup(e.target.value)} /></div>
        <div />
        <button className="btn secondary" type="button" disabled={!newGroup.trim() || newGroup in t} onClick={() => { setT({ ...t, [newGroup.trim()]: [] }); setNewGroup(''); }}><Icon name="plus" />Add group</button>
      </div>
      <SaveBar hint="Up to six requests per group show on the Ask tab." label="Save templates" onSave={onSave} />
    </section>
  );
}

function KeysTab({ c, set, onSave, onClear }: { c: Client; set: (fn: (x: Client) => void) => void; onSave: () => void; onClear: (k: 'openai' | 'apollo' | 'treg') => void }) {
  const k = c.keys;
  const sec = c.secrets;
  const row = (id: 'openai' | 'apollo' | 'treg', label: string, ph: string) => (
    <div>
      <label className="f" htmlFor={`k-${id}`}>{label} <KeyState s={sec?.[id]} own /></label>
      <div className="search-row">
        <Secret id={`k-${id}`} value={k[id]} placeholder={sec?.[id]?.source === 'client' ? 'leave blank to keep this client\'s key' : ph} onChange={(v) => set((x) => { x.keys[id] = v; })} />
        {sec?.[id]?.source === 'client' && <button className="btn ghost sm" type="button" onClick={() => onClear(id)} title="Remove this client's own key; the agency key takes over"><Icon name="x" />Remove</button>}
      </div>
    </div>
  );
  return (
    <section className="card">
      <h2>Keys</h2>
      <p className="sub">The agency keys from Settings are used unless this client has their own. Set one here only when the client pays for their own. Saved keys are never shown again, only their last four characters.</p>
      <div className="form-grid">
        {row('openai', 'OpenAI key (GPT reads requests and writes fit lines)', 'sk-… (blank = agency key)')}
        <div><label className="f" htmlFor="km">OpenAI model</label><input type="text" id="km" value={k.openai_model} placeholder="blank = agency default (gpt-6-luna)" onChange={(e) => set((x) => { x.keys.openai_model = e.target.value; })} /></div>
        {row('apollo', 'Research database key', 'blank = agency key')}
        {row('treg', 'treg.to key (email waterfall, not switched on yet)', 'blank = agency key')}
      </div>
      <SaveBar hint="Keys are stored on the server in the client's record, never shown to the client." label="Save keys" onSave={onSave} />
    </section>
  );
}

function CreditsTab({ c, slug, onToggleUsage, onToggleActivity }: { c: Client; slug: string; onToggleUsage: (v: boolean) => void; onToggleActivity: (v: boolean) => void }) {
  const [cr, setCr] = useState<{ credits: Credits; ledger: CreditEntry[]; auto_push?: AutoPush } | null>(null);
  const [add, setAdd] = useState(100);
  const [monthly, setMonthly] = useState(c.credits.monthly);
  const [daily, setDaily] = useState(c.auto_push?.daily ?? 50);
  const [err, setErr] = useState('');
  const load = () => api<{ credits: Credits; ledger: CreditEntry[]; auto_push?: AutoPush }>(`/admin/clients/${encodeURIComponent(slug)}/credits`).then((r) => { setCr(r); setMonthly(r.credits.monthly); if (r.auto_push) setDaily(r.auto_push.daily); }).catch((e) => setErr(errText(e)));
  const saveDaily = async () => {
    setErr('');
    try { await api(`/admin/clients/${encodeURIComponent(slug)}`, { method: 'PUT', body: { auto_push: { daily } } }); await load(); }
    catch (e) { setErr(errText(e)); }
  };
  useEffect(() => { load(); }, [slug]);
  const post = async (body: Record<string, unknown>) => {
    setErr('');
    try { const r = await api<{ credits: Credits; ledger: CreditEntry[] }>(`/admin/clients/${encodeURIComponent(slug)}/credits`, { body }); setCr(r); setMonthly(r.credits.monthly); }
    catch (e) { setErr(errText(e)); }
  };
  const cur: Credits = cr?.credits || { monthly: c.credits.monthly, extra: c.credits.extra, used: c.credits.used, total: c.credits.monthly + c.credits.extra, left: Math.max(0, c.credits.monthly + c.credits.extra - c.credits.used), period: c.credits.period, resets_on: '', resets_label: '' };
  return (
    <>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2>Monthly credits</h2>
        <p className="sub">One credit per lead added to Launchpad as a new contact with a work email. Searching is free. The allowance resets on the 1st of each month in the client's timezone. At zero, pushes and finders stop and the client sees the reset date and the support email.</p>
        {err && <Notice kind="err"><p>{err}</p></Notice>}
        <div className="credits-card">
          <CreditsRing big total={cur.total} used={cur.used} left={cur.left} resets={cur.resets_label} />
          <dl className="kv">
            <dt>Monthly allowance</dt><dd><b><Num value={cur.monthly} /></b></dd>
            <dt>Bonus this month</dt><dd><Num value={cur.extra} /></dd>
            <dt>Used this month</dt><dd><Num value={cur.used} /></dd>
            <dt>Left</dt><dd><Num value={cur.left} /></dd>
            <dt>Resets on</dt><dd>{cur.resets_label || '—'}</dd>
          </dl>
        </div>
        <div className="form-grid" style={{ marginTop: 16 }}>
          <div><label className="f" htmlFor="cmon">Monthly allowance (every month from now on)</label><div className="search-row"><input type="number" id="cmon" min={0} step={100} value={monthly} onChange={(e) => setMonthly(Math.max(0, Number(e.target.value) || 0))} /><button className="btn" type="button" onClick={() => post({ monthly })}><Icon name="check" />Set</button></div></div>
          <div><label className="f" htmlFor="cadd">Bonus credits for this month only</label><div className="search-row"><input type="number" id="cadd" min={1} step={50} value={add} onChange={(e) => setAdd(Math.max(1, Number(e.target.value) || 1))} /><button className="btn secondary" type="button" onClick={() => post({ add, reason: 'bonus credits' })}><Icon name="plus" />Add</button></div></div>
          <div className="full actions" style={{ marginTop: 2 }}>
            <button className="btn secondary" type="button" disabled={cur.used === 0 && !cur.extra} onClick={() => { if (confirm(`Restore this client to the full allowance of ${nf(cur.monthly)} credits? Used goes back to zero and any bonus for this month is cleared.`)) post({ restore: true }); }}><Icon name="refresh" />Top up to the full allowance ({nf(cur.monthly)})</button>
            <span className="hint">Puts the balance back to 100% of the monthly allowance, for example after test pushes. Shows in the ledger and the activity log.</span>
          </div>
        </div>
      </section>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2>Automatic pushes (finders)</h2>
        <p className="sub">How many leads all of this client's finders together may add to Launchpad per day, in the client's timezone. Manual pushes from the research tabs are not counted; credits limit those. At the cap, finders pause until midnight and the client sees the support email.</p>
        <div className="credits-card">
          <dl className="kv">
            <dt>Daily limit</dt><dd><b><Num value={cr?.auto_push?.daily ?? c.auto_push?.daily ?? 50} /></b></dd>
            <dt>Used today</dt><dd><Num value={cr?.auto_push?.used ?? 0} /></dd>
            <dt>Left today</dt><dd><Num value={cr?.auto_push?.left ?? (c.auto_push?.daily ?? 50)} /></dd>
            <dt>Day</dt><dd>{cr?.auto_push?.day || '—'} ({c.launchpad.timezone})</dd>
          </dl>
          <div style={{ flex: 1, minWidth: 220 }}><label className="f" htmlFor="apd">Daily limit on automatic pushes</label><div className="search-row"><input type="number" id="apd" min={0} step={10} value={daily} onChange={(e) => setDaily(Math.max(0, Number(e.target.value) || 0))} /><button className="btn" type="button" onClick={saveDaily}><Icon name="check" />Set</button></div></div>
        </div>
      </section>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2>What the client sees</h2>
        <p className="sub">Clients always see their credits left in the header. The Activity tab lists every finder run, push and search with the credits each used. The Usage tab (searches, lookups, tokens, never cost) is off unless you switch it on. Cost is only ever shown in this admin panel.</p>
        <div className="pills-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
          <Switch on={c.flags.show_activity !== false} onChange={onToggleActivity} label={c.flags.show_activity !== false ? 'Activity tab is shown to this client' : 'Activity tab is hidden from this client'} />
          <Switch on={c.flags.show_usage} onChange={onToggleUsage} label={c.flags.show_usage ? 'Usage tab is shown to this client' : 'Usage tab is hidden from this client'} />
        </div>
      </section>
      <section className="card">
        <h2>Credit history</h2>
        <p className="sub">Newest first. Spends come from pushes and finders; allowance changes, bonuses and monthly resets from the system and this page.</p>
        {cr && cr.ledger.length ? (
          <table className="ledger">
            <thead><tr><th scope="col">When</th><th scope="col" className="num">Change</th><th scope="col">Reason</th><th scope="col">By</th><th scope="col" className="num">Left after</th></tr></thead>
            <tbody>{cr.ledger.map((e, i) => <tr key={i}><td>{fmtWhen(e.t, c.launchpad.timezone)}</td><td className={`num ${e.delta < 0 ? 'neg' : 'pos'}`}>{e.delta > 0 ? '+' : ''}{nf(e.delta)}</td><td>{e.reason}</td><td>{e.by}</td><td className="num">{nf(e.left)}</td></tr>)}</tbody>
          </table>
        ) : <p className="empty">Nothing yet. The first push or top-up starts the history.</p>}
      </section>
    </>
  );
}

function AccessTab({ c, links, set, onSave, onRotate, onDelete }: { c: Client; links: MenuLink[]; set: (fn: (x: Client) => void) => void; onSave: () => void; onRotate: () => void; onDelete: () => void }) {
  const [copied, setCopied] = useState('');
  const copy = async (s: string, what: string) => { try { await navigator.clipboard.writeText(s); setCopied(what); setTimeout(() => setCopied(''), 1500); } catch { /* clipboard blocked */ } };
  return (
    <>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2>Menu links for Launchpad</h2>
        <p className="sub">Add each one as a custom menu link in the client's sub-account (Settings → Custom menu links, open inside the app). The access key in the link signs them in.</p>
        <dl className="kv">
          {links.map((l) => <ReactFragmentRow key={l.label} label={l.label} value={l.url} onCopy={() => copy(l.url, l.label)} copied={copied === l.label} />)}
          <ReactFragmentRow label="Access key" value={c.access_key} onCopy={() => copy(c.access_key, 'key')} copied={copied === 'key'} />
        </dl>
        <div className="savebar">
          <span className="hint">Rotating the key invalidates the old links.</span>
          <button className="btn secondary" type="button" onClick={onRotate}><Icon name="key" />Rotate access key</button>
        </div>
      </section>
      <section className="card">
        <h2>State</h2>
        <label className="toggle"><input type="checkbox" checked={c.enabled} onChange={(e) => set((x) => { x.enabled = e.target.checked; })} /> Enabled (disabled clients cannot sign in and their finders do not run)</label>
        <SaveBar hint="" label="Save" onSave={onSave}>
          <button className="btn ghost sm" type="button" onClick={onDelete} style={{ color: 'var(--critical)' }}><Icon name="trash" />Delete this client</button>
        </SaveBar>
      </section>
    </>
  );
}

function ReactFragmentRow({ label, value, onCopy, copied }: { label: string; value: string; onCopy: () => void; copied: boolean }) {
  return (
    <>
      <dt>{label}</dt>
      <dd><span className="copyable"><code>{value}</code><button className="btn secondary sm" type="button" onClick={onCopy}><Icon name="copy" />{copied ? 'Copied' : 'Copy'}</button></span></dd>
    </>
  );
}
