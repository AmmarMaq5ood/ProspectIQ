import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errText, fmtWhen } from '../api';
import { Icon } from '../components/Icon';
import { Errors } from '../components/ui';
import type { ClientRow } from '../types';

/** The clients list and the "new client" form. */
export default function Admin() {
  const nav = useNavigate();
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = () => api<{ clients: ClientRow[] }>('/admin/clients').then((r) => setRows(r.clients)).catch((e) => setErr(errText(e)));
  useEffect(() => { load(); }, []);

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
      <div className="page-head">
        <h1>Clients</h1>
        <button className="btn sm" type="button" onClick={() => setAdding((v) => !v)}><Icon name="plus" />New client</button>
        <p className="sub">Each client has its own access, Launchpad connection, profile, templates, credits and logs.</p>
      </div>
      <Errors errors={err ? [err] : []} />
      {adding && (
        <section className="card" style={{ marginBottom: 12 }}>
          <h2>New client</h2>
          <p className="sub">Give it a name; the short id becomes its folder on disk. You fill in Launchpad, the profile and the credits next.</p>
          <form className="newc" onSubmit={create}>
            <div><label className="f" htmlFor="cn">Name</label><input type="text" id="cn" value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(auto(e.target.value)); }} placeholder="Bambrella USA" autoComplete="off" autoFocus /></div>
            <div><label className="f" htmlFor="cs">Short id</label><input type="text" id="cs" value={slug} onChange={(e) => { setSlug(auto(e.target.value)); setSlugTouched(true); }} placeholder="bambrella" autoComplete="off" /></div>
            <button className="btn" type="submit" disabled={!name.trim()}><Icon name="plus" />Create</button>
          </form>
        </section>
      )}
      <section className="card">
        {rows === null ? <p className="empty">Loading…</p> : rows.length === 0 ? <p className="empty">No clients yet. Click New client above.</p> : (
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
      <p className="foot">Keys left blank on a client fall back to the agency keys in the server's .env. The Launchpad token and location are always per client.</p>
    </>
  );
}
