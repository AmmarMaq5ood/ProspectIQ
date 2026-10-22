import { createContext, useContext, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, api, errText, setKey, setSample } from './api';
import type { Me, Options } from './types';
import { BusyProvider, useBusy } from './components/Busy';
import { CreditsRing, TopProgress } from './components/Motion';
import NotSetUp from './pages/NotSetUp';
import Activity from './pages/Activity';
import AdminOverview from './pages/AdminOverview';
import AdminSettings from './pages/AdminSettings';
import AdminCosts from './pages/AdminCosts';
import AdminWaterfall from './pages/AdminWaterfall';
import { ThemeToggle, useAdminTheme } from './components/Theme';
import { Icon } from './components/Icon';
import Login from './pages/Login';
import Scout from './pages/Scout';
import Research from './pages/Research';
import Lookup from './pages/Lookup';
import Places from './pages/Places';
import Finders from './pages/Finders';
import TargetingPage from './pages/Targeting';
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
  const [notSetup, setNotSetup] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const reload = async () => { setMe(await api<Me>('/me')); };

  useEffect(() => {
    (async () => {
      const p = new URLSearchParams(loc.search);
      const key = p.get('key');
      const view = p.get('view');
      if (p.get('sample') === '1') setSample(true);
      const locId = p.get('loc');
      const k = p.get('k');
      if (key) { try { const r = await api<{ key?: string }>('/auth/key', { body: { key } }); setKey(r.key || key); } catch (e) { setBoot(errText(e)); } }
      else if (locId && k) {
        try { const r = await api<{ key?: string }>('/auth/location', { body: { loc: locId, k } }); setKey(r.key || ''); }
        catch (e) { if (e instanceof ApiError && e.status === 404) setNotSetup(true); else setBoot(errText(e)); }
      }
      try {
        const [m, o] = await Promise.all([api<Me>('/me'), api<Options>('/options')]);
        setMe(m);
        setOptions(o);
      } catch (e) {
        setBoot(errText(e));
        return;
      }
      if (key || view || locId) {
        p.delete('key');
        p.delete('view');
        p.delete('loc');
        p.delete('k');
        nav({ pathname: view === 'usage' ? '/usage' : view === 'finders' ? '/finders' : loc.pathname, search: p.toString() ? `?${p}` : '' }, { replace: true });
      }
    })();
  }, []);

  if (boot) return <div className="boot"><div className="err" role="alert"><p>{boot}</p></div></div>;
  if (notSetup && !me?.client) return <NotSetUp />;
  if (!me || !options) return <div className="boot"><span className="spin dark" /> Loading ProspectIQ…</div>;

  return (
    <Ctx.Provider value={{ me, options, reload }}>
      <BusyProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={me.admin ? <AdminShell /> : <Navigate to="/login?admin=1" replace />}>
            <Route index element={<AdminOverview />} />
            <Route path="clients" element={<Admin />} />
            <Route path="clients/:slug" element={<AdminClient />} />
            <Route path="costs" element={<AdminCosts />} />
            <Route path="waterfall" element={<AdminWaterfall />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>
          <Route path="/" element={me.client ? <Shell /> : <Navigate to={me.admin ? '/admin' : '/login'} replace />}>
            <Route index element={<Scout />} />
            <Route path="people" element={<Research key="people" mode="people" />} />
            <Route path="companies" element={<Research key="companies" mode="companies" />} />
            <Route path="industries" element={<Research key="industries" mode="industries" />} />
            <Route path="lookup" element={<Lookup />} />
            <Route path="local" element={<Places />} />
            <Route path="finders" element={<Finders />} />
            <Route path="targeting" element={<TargetingPage />} />
            <Route path="activity" element={<Activity />} />
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
  const loc = useLocation();
  const busy = useBusy();
  const c = me.client!;
  const signOut = async () => { await api('/auth/logout', { body: {} }); setKey(''); await reload(); nav('/login'); };
  return (
    <>
      <TopProgress active={busy.active} />
      <header className="top">
        <div className="ttl">
          <h1>ProspectIQ{me.sample && <span className="badge">Sample data</span>}</h1>
          <p className="sub">{c.name} · Find the buyers and companies you want in plain words, then push them into Launchpad.</p>
        </div>
        <div className="ctrls">
          <CreditsRing total={c.credits.total} used={c.credits.used} left={c.credits.left} resets={c.credits.resets_label} />
          <a className="btn secondary sm" href={`${import.meta.env.BASE_URL}docs/client-guide`} target="_blank" rel="noopener"><Icon name="link" />Guide</a>
          {me.admin && <Link className="btn secondary sm" to="/admin"><Icon name="settings" />Admin</Link>}
          {me.admin && <button className="btn ghost sm" type="button" onClick={signOut}>Sign out</button>}
        </div>
      </header>
      <nav className="tabs" aria-label="Search by">
        <NavLink to="/" end className={on}><Icon name="spark" />Scout</NavLink>
        <NavLink to="/people" className={on}><Icon name="people" />People</NavLink>
        <NavLink to="/companies" className={on}><Icon name="building" />Companies</NavLink>
        <NavLink to="/industries" className={on}><Icon name="chart" />Industries</NavLink>
        <NavLink to="/lookup" className={on}><Icon name="link" />Company lookup</NavLink>
        <NavLink to="/local" className={on}><Icon name="pin" />Local businesses</NavLink>
        <NavLink to="/finders" className={on}><Icon name="calendar" />Daily finders</NavLink>
        <NavLink to="/targeting" className={on}><Icon name="filter" />Targeting</NavLink>
        {(c.show_activity || me.admin) && <NavLink to="/activity" className={on}><Icon name="clock" />Activity</NavLink>}
        {(c.show_usage || me.admin) && <NavLink to="/usage" className={on}><Icon name="chart" />Usage</NavLink>}
      </nav>
      <div className="page" key={loc.pathname}><Outlet /></div>
    </>
  );
}

/** The agency side: a sidebar app with an overview, the clients, settings and dark mode. */
function AdminShell() {
  const { me, reload } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const busy = useBusy();
  const [dark, setDark] = useAdminTheme();
  const signOut = async () => { await api('/auth/logout', { body: {} }); setKey(''); await reload(); nav('/login'); };
  return (
    <div className="admin-app">
      <TopProgress active={busy.active} />
      <aside className="side">
        <div className="brand"><Icon name="spark" />ProspectIQ <span>Admin</span></div>
        <nav aria-label="Admin">
          <NavLink to="/admin" end className={on}><Icon name="home" />Overview</NavLink>
          <NavLink to="/admin/clients" className={on}><Icon name="people" />Clients</NavLink>
          <NavLink to="/admin/costs" className={on}><Icon name="chart" />Costs</NavLink>
          <NavLink to="/admin/waterfall" className={on}><Icon name="search" />Email waterfall</NavLink>
          <NavLink to="/admin/settings" className={on}><Icon name="settings" />Settings</NavLink>
          <a href={`${import.meta.env.BASE_URL}docs/admin-guide`} target="_blank" rel="noopener"><Icon name="link" />Docs</a>
        </nav>
        <div className="side-foot">
          <ThemeToggle dark={dark} onChange={setDark} />
          {me.client && <Link className="btn secondary sm" to="/"><Icon name="spark" />Open as {me.client.name}</Link>}
          <button className="btn ghost sm" type="button" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        <div className="page" key={loc.pathname}><Outlet /></div>
      </main>
    </div>
  );
}
