import { createContext, useContext, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, errText, setSample } from './api';
import type { Me, Options } from './types';
import { BusyProvider } from './components/Busy';
import { Icon } from './components/Icon';
import Login from './pages/Login';
import Ask from './pages/Ask';
import Research from './pages/Research';
import Lookup from './pages/Lookup';
import Finders from './pages/Finders';
import Usage from './pages/Usage';
import Admin from './pages/Admin';
import AdminClient from './pages/AdminClient';

/**
 * Who is signed in (a client by access key, an agency admin, or both) and the
 * fixed option lists. A Launchpad menu link opens the app as /?key=…; the key
 * becomes a cookie and disappears from the address bar.
 */

interface AppCtx { me: Me; options: Options; reload: () => Promise<void> }
const Ctx = createContext<AppCtx>(null!);
export const useApp = () => useContext(Ctx);

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [boot, setBoot] = useState('');
  const loc = useLocation();
  const nav = useNavigate();
  const reload = async () => { setMe(await api<Me>('/me')); };

  useEffect(() => {
    (async () => {
      const p = new URLSearchParams(loc.search);
      const key = p.get('key');
      const view = p.get('view');
      if (p.get('sample') === '1') setSample(true);
      if (key) { try { await api('/auth/key', { body: { key } }); } catch (e) { setBoot(errText(e)); } }
      try {
        const [m, o] = await Promise.all([api<Me>('/me'), api<Options>('/options')]);
        setMe(m);
        setOptions(o);
      } catch (e) {
        setBoot(errText(e));
        return;
      }
      if (key || view) {
        p.delete('key');
        p.delete('view');
        nav({ pathname: view === 'usage' ? '/usage' : view === 'finders' ? '/finders' : loc.pathname, search: p.toString() ? `?${p}` : '' }, { replace: true });
      }
    })();
  }, []);

  if (boot) return <div className="boot"><div className="err" role="alert"><p>{boot}</p></div></div>;
  if (!me || !options) return <div className="boot"><span className="spin dark" /> Loading ProspectIQ…</div>;

  return (
    <Ctx.Provider value={{ me, options, reload }}>
      <BusyProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={me.admin ? <AdminShell /> : <Navigate to="/login?admin=1" replace />}>
            <Route index element={<Admin />} />
            <Route path="clients/:slug" element={<AdminClient />} />
          </Route>
          <Route path="/" element={me.client ? <Shell /> : <Navigate to={me.admin ? '/admin' : '/login'} replace />}>
            <Route index element={<Ask />} />
            <Route path="people" element={<Research key="people" mode="people" />} />
            <Route path="companies" element={<Research key="companies" mode="companies" />} />
            <Route path="industries" element={<Research key="industries" mode="industries" />} />
            <Route path="lookup" element={<Lookup />} />
            <Route path="finders" element={<Finders />} />
            <Route path="usage" element={<Usage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BusyProvider>
    </Ctx.Provider>
  );
}

const on = ({ isActive }: { isActive: boolean }) => (isActive ? 'on' : '');

/** The client's app: title row, the tabs, the page. */
function Shell() {
  const { me, reload } = useApp();
  const nav = useNavigate();
  const c = me.client!;
  const signOut = async () => { await api('/auth/logout', { body: {} }); await reload(); nav('/login'); };
  return (
    <>
      <header className="top">
        <div className="ttl">
          <h1>ProspectIQ{me.sample && <span className="badge">Sample data</span>}</h1>
          <p className="sub">{c.name} · Find the buyers and companies you want in plain words, then push them into Launchpad.</p>
        </div>
        {me.admin && (
          <div className="ctrls">
            <Link className="btn secondary sm" to="/admin"><Icon name="settings" />Admin</Link>
            <button className="btn ghost sm" type="button" onClick={signOut}>Sign out</button>
          </div>
        )}
      </header>
      <nav className="tabs" aria-label="Search by">
        <NavLink to="/" end className={on}><Icon name="spark" />Ask</NavLink>
        <NavLink to="/people" className={on}><Icon name="people" />People</NavLink>
        <NavLink to="/companies" className={on}><Icon name="building" />Companies</NavLink>
        <NavLink to="/industries" className={on}><Icon name="chart" />Industries</NavLink>
        <NavLink to="/lookup" className={on}><Icon name="link" />Company lookup</NavLink>
        <NavLink to="/finders" className={on}><Icon name="calendar" />Daily finders</NavLink>
        <NavLink to="/usage" className={on}><Icon name="clock" />Usage</NavLink>
      </nav>
      <Outlet />
    </>
  );
}

/** The agency side: clients and their setup. */
function AdminShell() {
  const { me, reload } = useApp();
  const nav = useNavigate();
  const signOut = async () => { await api('/auth/logout', { body: {} }); await reload(); nav('/login'); };
  return (
    <>
      <header className="top">
        <div className="ttl">
          <h1>ProspectIQ <span className="badge">Agency admin</span></h1>
          <p className="sub">Clients, their Launchpad connection, what they sell, their keys and their usage.</p>
        </div>
        <div className="ctrls">
          {me.client && <Link className="btn secondary sm" to="/"><Icon name="spark" />Open the app as {me.client.name}</Link>}
          <button className="btn ghost sm" type="button" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <nav className="tabs" aria-label="Admin">
        <NavLink to="/admin" end className={on}><Icon name="people" />Clients</NavLink>
      </nav>
      <Outlet />
    </>
  );
}
