import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errText, fmtWhen } from '../api';
import { Icon } from '../components/Icon';
import { Notice } from '../components/ui';
import { Errors } from '../components/ui';
import type { ClientRow } from '../types';

/** The clients list and the "new client" row. */
export default function Admin() {
  const nav = useNavigate();
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const loadLink = () => api<{ url: string }>('/admin/link').then((r) => setLink(r.url)).catch(() => {});

  const load = () => api<{ clients: ClientRow[] }>('/admin/clients').then((r) => setRows(r.clients)).catch((e) => setErr(errText(e)));
  useEffect(() => { load(); loadLink(); }, []);

  const auto = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const r = await api<{ client: { slug: string } }>('/admin/clients', { body: { name, slug: slug || auto(name) } });
      nav(`/admin/clients/${r.client.slug}`);
    } catch (x) {
      setErr(errText(x));
    }
  };

  return (
    <>
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
              <button className="btn ghost sm" type="button" onClick={async () => { if (!confirm('Rotate the link secret? The current menu link stops working until you replace it in Launchpad.')) return; try { const r = await api<{ url: string }>('/admin/link/rotate', { body: {} }); setLink(r.url); } catch (e) { setErr(errText(e)); } }}><Icon name="key" />Rotate secret</button>
            </div>
          </>
        ) : <Notice kind="err"><p>The link could not be loaded.</p></Notice>}
      </section>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2>New client</h2>
        <p className="sub">Give it a name; the short id becomes its folder on disk and its part of the menu link. You fill in Launchpad, the profile and the keys next.</p>
        <form className="newc" onSubmit={create}>
          <div><label className="f" htmlFor="cn">Name</label><input type="text" id="cn" value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(auto(e.target.value)); }} placeholder="Bambrella USA" autoComplete="off" /></div>
          <div><label className="f" htmlFor="cs">Short id</label><input type="text" id="cs" value={slug} onChange={(e) => { setSlug(auto(e.target.value)); setSlugTouched(true); }} placeholder="bambrella" autoComplete="off" /></div>
          <button className="btn" type="submit" disabled={!name.trim()}><Icon name="plus" />Create</button>
        </form>
      </section>

      <section className="card">
        <h2>Clients</h2>
        <p className="sub">Click a row to set it up. Each client has its own access key, Launchpad connection, profile, templates, keys and usage log.</p>
        {rows === null ? <p className="empty">Loading…</p> : rows.length === 0 ? <p className="empty">No clients yet. Create the first one above (or run <code>npm run seed</code> for Artmark).</p> : (
          <table className="clients">
            <thead><tr><th scope="col">Client</th><th scope="col">Launchpad</th><th scope="col">GPT</th><th scope="col">Research key</th><th scope="col" className="num">Finders</th><th scope="col">Created</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.slug} onClick={() => nav(`/admin/clients/${c.slug}`)}>
                  <td><span className="nm">{c.name}{!c.enabled && <span className="pill bad" style={{ marginLeft: 8 }}>disabled</span>}</span><span className="st">{c.slug}</span></td>
                  <td>{c.connected ? <span className="pill good">connected</span> : <span className="pill bad">not connected</span>}</td>
                  <td>{c.has_openai ? <span className="pill good">key set</span> : <span className="pill">built-in parser</span>}</td>
                  <td>{c.has_apollo ? <span className="pill good">key set</span> : <span className="pill bad">sample mode</span>}</td>
                  <td className="num">{c.finders}</td>
                  <td>{fmtWhen(c.created, 'UTC')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="foot">Keys left blank on a client fall back to the agency keys in the server's .env (OPENAI_API_KEY, APOLLO_API_KEY). The Launchpad token and location are always per client.</p>
    </>
  );
}
