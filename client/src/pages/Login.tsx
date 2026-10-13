import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, errText, setKey } from '../api';
import { useApp } from '../App';
import { Icon } from '../components/Icon';

export default function Login() {
  const { me, reload } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const adminFirst = params.get('admin') === '1';
  const [key, setKey] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me.client && !adminFirst) nav('/', { replace: true });
    else if (me.admin && adminFirst) nav('/admin', { replace: true });
  }, []);

  const go = async (e: FormEvent, path: string, body: { key: string }, to: string) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await api<{ key?: string }>(path, { body });
      if (r.key) setKey(r.key);
      await reload();
      nav(to, { replace: true });
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <span className="ask-kicker dark"><Icon name="spark" />ProspectIQ</span>
        <h2>Sign in</h2>
        <p className="sub">Clients open ProspectIQ from their Launchpad menu and are signed in on the way. Paste the access key here to open it directly.</p>
        {err && <div className="err" role="alert"><p>{err}</p></div>}
        <form onSubmit={(e) => go(e, '/auth/key', { key }, '/')} className="login-form">
          <label className="f" htmlFor="ak">Client access key</label>
          <div className="search-row">
            <input type="text" id="ak" value={key} onChange={(e) => setKey(e.target.value)} placeholder="the key from the client's menu link" autoComplete="off" autoFocus={!adminFirst} />
            <button className="btn" type="submit" disabled={busy || !key.trim()}><Icon name="arrow-right" />Open</button>
          </div>
        </form>
        <div className="login-or">Agency</div>
        <form onSubmit={(e) => go(e, '/auth/admin', { key: adminKey }, '/admin')} className="login-form">
          <label className="f" htmlFor="adk">Admin key</label>
          <div className="search-row">
            <input type="password" id="adk" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="ADMIN_KEY from the server's .env" autoComplete="current-password" autoFocus={adminFirst} />
            <button className="btn secondary" type="submit" disabled={busy || !adminKey.trim()}><Icon name="key" />Admin</button>
          </div>
        </form>
      </div>
    </div>
  );
}
