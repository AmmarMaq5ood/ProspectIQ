/**
 * What someone already waited for is kept for the life of the browser tab:
 * each search's result with what was ticked, typed and pushed on it, and
 * where every tab was left. Leaving a page and coming back shows it as it
 * was, with no second search.
 *
 * Memory first, sessionStorage behind it, so a reload of the frame (Launchpad
 * re-opens the menu link when its own menu is used) keeps the work too.
 * Nothing here outlives the browser tab, and every key carries the client's
 * slug, so an admin switching accounts never sees another account's results.
 */

/** After this long a snapshot is treated as gone: the people in it may have moved on. */
export const KEEP_TTL = 60 * 60 * 1000;
const MAX = 14;
const NS = 'piq_keep:';
const INDEX = 'piq_keep_index';

interface Entry<T> { t: number; v: T }

const mem = new Map<string, Entry<unknown>>();

function store(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

/** JSON with object keys in a fixed order, so the same search always makes the same key. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

export function keepKey(scope: string, client: string, parts: unknown): string {
  return `${scope}|${client}|${stable(parts)}`;
}

function index(s: Storage): string[] {
  try { const a = JSON.parse(s.getItem(INDEX) || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch { return []; }
}

function touch(s: Storage, key: string): void {
  const order = [key, ...index(s).filter((k) => k !== key)];
  for (const old of order.slice(MAX)) { s.removeItem(NS + old); mem.delete(old); }
  try { s.setItem(INDEX, JSON.stringify(order.slice(0, MAX))); } catch { /* full or blocked: memory still has it */ }
}

/** The snapshot for a key, or null when there is none or it has aged out. `t` is when its data was fetched. */
export function keepGet<T>(key: string): Entry<T> | null {
  let e = mem.get(key) as Entry<T> | undefined;
  if (!e) {
    const s = store();
    if (s) {
      try {
        const raw = s.getItem(NS + key);
        if (raw) { e = JSON.parse(raw) as Entry<T>; mem.set(key, e); }
      } catch { /* unreadable: treat as absent */ }
    }
  }
  if (!e) return null;
  if (Date.now() - e.t > KEEP_TTL) { keepDrop(key); return null; }
  return e;
}

/** Saves a snapshot. Pass the original fetch time when only the page state changed, so its age stays honest. */
export function keepPut<T>(key: string, v: T, t = Date.now()): void {
  const e: Entry<T> = { t, v };
  mem.set(key, e);
  const s = store();
  if (!s) return;
  let raw: string;
  try { raw = JSON.stringify(e); } catch { return; }
  for (let attempt = 0; attempt < 3; attempt++) {
    try { s.setItem(NS + key, raw); touch(s, key); return; } catch {
      // Out of room: let go of the oldest snapshot and try again.
      const order = index(s);
      const oldest = order[order.length - 1];
      if (!oldest || oldest === key) return;
      s.removeItem(NS + oldest);
      mem.delete(oldest);
      try { s.setItem(INDEX, JSON.stringify(order.slice(0, -1))); } catch { return; }
    }
  }
}

export function keepDrop(key: string): void {
  mem.delete(key);
  const s = store();
  if (!s) return;
  try { s.removeItem(NS + key); s.setItem(INDEX, JSON.stringify(index(s).filter((k) => k !== key))); } catch { /* nothing to do */ }
}

/** Forget everything (sign-out). */
export function keepClear(): void {
  mem.clear();
  const s = store();
  if (!s) return;
  try {
    for (const k of index(s)) s.removeItem(NS + k);
    s.removeItem(INDEX);
    for (let i = s.length - 1; i >= 0; i--) { const k = s.key(i); if (k && k.startsWith(TABS)) s.removeItem(k); }
  } catch { /* nothing to do */ }
}

/* ---- where each tab was left ---- */

const TABS = 'piq_tabs:';
/** Tabs whose address carries a search worth returning to. */
export const SEARCH_TABS = ['/', '/people', '/companies', '/industries', '/lookup', '/local'];
const tabMem = new Map<string, Record<string, string>>();

function tabs(client: string): Record<string, string> {
  let m = tabMem.get(client);
  if (m) return m;
  m = {};
  try { const raw = store()?.getItem(TABS + client); if (raw) m = JSON.parse(raw) as Record<string, string>; } catch { /* start empty */ }
  tabMem.set(client, m);
  return m;
}

/** Called on every navigation: remembers the search a tab is showing (an empty one clears it). */
export function tabRemember(client: string, path: string, search: string): void {
  if (!SEARCH_TABS.includes(path)) return;
  const m = tabs(client);
  if ((m[path] || '') === search) return;
  if (search) m[path] = search; else delete m[path];
  try { store()?.setItem(TABS + client, JSON.stringify(m)); } catch { /* memory still has it */ }
}

/** Where a tab's link should lead: back to the search it was left on. */
export function tabHref(client: string, path: string): string {
  return path + (tabs(client)[path] || '');
}

/* ---- small helpers the pages share ---- */

/** "just now", "4 min ago", "1 hour ago": how old a kept result is. */
export function keptAge(t: number): string {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  const h = Math.round(s / 3600);
  return `${h} hour${h === 1 ? '' : 's'} ago`;
}
