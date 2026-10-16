import { useEffect, useState, type FormEvent } from 'react';
import { api, errText } from '../api';
import { Icon } from '../components/Icon';
import { Errors, Notice } from '../components/ui';
import type { SecretState } from '../types';

type KeyId = 'openai' | 'apollo' | 'treg';
const KEY_ROWS: [KeyId, string, string][] = [['apollo', 'Research database key', 'Searches, lookups and the work-email reveals. Every client without a key of their own uses this.'], ['openai', 'OpenAI key (GPT)', 'Reads plain-words requests and writes the fit lines.'], ['treg', 'treg.to key', 'Email waterfall across 100+ providers for leads the research database has no email for. Switched on per client under Keys.']];

/** Agency-wide settings: the one menu link for every sub-account, and the support email clients see. */
export default function AdminSettings() {
  const [link, setLink] = useState('');
  const [docsUrl, setDocsUrl] = useState('');
  const [docsCopied, setDocsCopied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [support, setSupport] = useState('');
  const [creditCost, setCreditCost] = useState('');
  const [keys, setKeys] = useState<Record<KeyId, SecretState> | null>(null);
  const [draft, setDraft] = useState<Record<KeyId, string>>({ openai: '', apollo: '', treg: '' });
  const saveKey = async (k: KeyId, value: string | null) => {
    setErr(''); setOk('');
    if (value === null && !confirm('Remove this key? Clients without a key of their own stop using it; the server .env key, if any, takes over.')) return;
    try { const r = await api<{ keys: Record<KeyId, SecretState> }>('/admin/settings', { method: 'PUT', body: { keys: { [k]: value } } }); setKeys(r.keys); setDraft((d) => ({ ...d, [k]: '' })); setOk(value === null ? 'Key removed.' : 'Key saved. It is in use from the next call on.'); }
    catch (x) { setErr(errText(x)); }
  };
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { api<{ url: string; docs_url?: string; support_email?: string; credit_cost?: number; keys?: Record<KeyId, SecretState> }>('/admin/link').then((r) => { setLink(r.url); setDocsUrl(r.docs_url || ''); setSupport(r.support_email || ''); setCreditCost(r.credit_cost ? String(r.credit_cost) : ''); setKeys(r.keys || null); }).catch((e) => setErr(errText(e))); }, []);
  const saveCost = async (e: FormEvent) => {
    e.preventDefault();
    setErr(''); setOk('');
    try { const r = await api<{ credit_cost: number }>('/admin/settings', { method: 'PUT', body: { credit_cost: Number(creditCost) || 0 } }); setCreditCost(r.credit_cost ? String(r.credit_cost) : ''); setOk('Credit cost saved. The Costs page uses it from now on.'); }
    catch (x) { setErr(errText(x)); }
  };

  const saveSupport = async (e: FormEvent) => {
    e.preventDefault();
    setErr(''); setOk('');
    try { const r = await api<{ support_email: string }>('/admin/settings', { method: 'PUT', body: { support_email: support } }); setSupport(r.support_email); setOk('Support email saved.'); }
    catch (x) { setErr(errText(x)); }
  };
  const rotate = async () => {
    if (!confirm('Rotate the link secret? The current menu link stops working everywhere until you replace it in Launchpad.')) return;
    setErr(''); setOk('');
    try { const r = await api<{ url: string }>('/admin/link/rotate', { body: {} }); setLink(r.url); setOk('New link ready. Replace it in Launchpad.'); } catch (x) { setErr(errText(x)); }
  };

  return (
    <>
      <div className="page-head"><h1>Settings</h1><p className="sub">Things that apply to every client.</p></div>
      {ok && <Notice kind="ok"><p>{ok}</p></Notice>}
      <Errors errors={err ? [err] : []} />
      <section className="card" style={{ marginBottom: 12 }}>
        <h2>One menu link for every sub-account</h2>
        <p className="sub">Add this once at agency level in Launchpad (Settings → Custom menu links, open inside the app). Launchpad fills in the account id when a user opens it, and ProspectIQ shows that account's own setup. Accounts not set up here see a "not switched on yet" page.</p>
        {link ? (
          <>
            <dl className="kv">
              <dt>Menu link</dt>
              <dd><span className="copyable"><code>{link}</code><button className="btn secondary sm" type="button" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } }}><Icon name="copy" />{copied ? 'Copied' : 'Copy'}</button></span></dd>
            </dl>
            <div className="savebar">
              <span className="hint">Rotating the secret invalidates the old link everywhere; paste the new one into Launchpad afterwards.</span>
              <button className="btn ghost sm" type="button" onClick={rotate}><Icon name="key" />Rotate secret</button>
            </div>
          </>
        ) : <p className="empty">Loading…</p>}
      </section>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2>Team docs link</h2>
        <p className="sub">The product overview, admin guide and changelog for the team and sales. Clients never see these pages: without this link or an admin sign-in, the docs show only the client guide, with no way out of Launchpad. Opening the link once keeps the pages unlocked in that browser for 30 days.</p>
        {docsUrl ? (
          <dl className="kv">
            <dt>Team link</dt>
            <dd><span className="copyable"><code>{docsUrl}</code><button className="btn secondary sm" type="button" onClick={async () => { try { await navigator.clipboard.writeText(docsUrl); setDocsCopied(true); setTimeout(() => setDocsCopied(false), 1500); } catch { /* clipboard blocked */ } }}><Icon name="link" />{docsCopied ? 'Copied' : 'Copy'}</button></span></dd>
          </dl>
        ) : <p className="empty">Loading…</p>}
      </section>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2>API keys</h2>
        <p className="sub">The keys every client uses unless they have their own (set per client under Keys). A saved key is never shown again, only whether it is connected and its last four characters. Paste a new one to replace it.</p>
        {keys ? (
          <div className="keyrows">
            {KEY_ROWS.map(([k, label, help]) => {
              const s = keys[k];
              return (
                <div className="keyrow" key={k}>
                  <div className="keyrow-l">
                    <div className="nm">{label} {s.set ? <span className="pill good">connected · ends in {s.hint}{s.source === 'env' ? ' · from the server .env' : ''}</span> : <span className="pill">not connected</span>}</div>
                    <div className="st">{help}</div>
                  </div>
                  <form className="search-row" onSubmit={(e) => { e.preventDefault(); if (draft[k].trim()) saveKey(k, draft[k].trim()); }}>
                    <input type="password" value={draft[k]} placeholder={s.set ? 'paste a new key to replace it' : 'paste the key'} autoComplete="new-password" aria-label={`${label} value`} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} />
                    <button className="btn" type="submit" disabled={!draft[k].trim()}><Icon name="check" />{s.set ? 'Replace' : 'Connect'}</button>
                    {s.set && s.source === 'agency' && <button className="btn ghost sm" type="button" onClick={() => saveKey(k, null)}><Icon name="x" />Remove</button>}
                  </form>
                </div>
              );
            })}
          </div>
        ) : <p className="empty">Loading…</p>}
      </section>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2>Research credit cost</h2>
        <p className="sub">What one research credit costs us in dollars, from the research plan (plan price ÷ credits included). The Costs page turns credit counts into dollars with it. Leave at 0 to show counts only. GPT prices per model are set on the server.</p>
        <form className="newc" onSubmit={saveCost}>
          <div><label className="f" htmlFor="cc">Dollars per credit</label><input type="number" id="cc" min={0} step={0.001} value={creditCost} onChange={(e) => setCreditCost(e.target.value)} placeholder="0.03" inputMode="decimal" /></div>
          <div />
          <button className="btn" type="submit"><Icon name="check" />Save</button>
        </form>
      </section>
      <section className="card">
        <h2>Support email</h2>
        <p className="sub">Shown to clients when they run out of credits: "To upgrade your plan, email …". Leave blank to say "contact your Launchpad team" instead.</p>
        <form className="newc" onSubmit={saveSupport}>
          <div><label className="f" htmlFor="se">Email address</label><input type="email" id="se" value={support} onChange={(e) => setSupport(e.target.value)} placeholder="support@launchpadinnovations.ai" autoComplete="off" /></div>
          <div />
          <button className="btn" type="submit"><Icon name="check" />Save</button>
        </form>
      </section>
    </>
  );
}
