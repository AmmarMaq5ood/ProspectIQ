import { useEffect, useState, type FormEvent } from 'react';
import { api, errText } from '../api';
import { Icon } from '../components/Icon';
import { Errors, Notice } from '../components/ui';

/** Agency-wide settings: the one menu link for every sub-account, and the support email clients see. */
export default function AdminSettings() {
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [support, setSupport] = useState('');
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { api<{ url: string; support_email?: string }>('/admin/link').then((r) => { setLink(r.url); setSupport(r.support_email || ''); }).catch((e) => setErr(errText(e))); }, []);

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
