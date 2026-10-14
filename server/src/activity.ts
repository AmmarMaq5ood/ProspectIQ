import path from 'node:path';
import { appendLine, clientDir, readLines } from './store.js';

/**
 * The per-client activity log: one line per thing that happened (a finder
 * run, a push, a search, a credit change), with who did it, how many credits
 * it used and the people involved. Read back newest first, in pages.
 */

export type ActivityKind = 'finder' | 'push' | 'search' | 'lookup' | 'credits' | 'system';
export type ActivityBy = 'client' | 'finder' | 'admin' | 'system';

export interface ActivityItem { name: string; company?: string; id?: string; email?: string }

export interface Activity {
  t: number;
  kind: ActivityKind;
  title: string;
  detail?: string;
  credits?: number;
  by: ActivityBy;
  ok: boolean;
  n?: number;
  items?: ActivityItem[];
  /** A finder id, so one finder's runs can be listed on their own. */
  ref?: string;
}

const file = (slug: string) => path.join(clientDir(slug), 'activity.jsonl');

export function logActivity(slug: string, a: Omit<Activity, 't'>): void {
  try {
    appendLine(file(slug), { t: Date.now(), ...a, items: a.items?.slice(0, 60) });
  } catch {
    // the log never breaks the action it describes
  }
}

export interface ActivityPage { rows: Activity[]; total: number; page: number; pages: number; per: number }

export type AdminActivity = Omit<Activity, 'items'> & { client: string; slug: string };
export interface AdminActivityPage { rows: AdminActivity[]; total: number; page: number; pages: number; per: number }

/** Every client's log merged, newest first, in pages: the agency overview feed. */
export function readActivityAll(clients: { slug: string; name: string }[], opts: { page?: number; per?: number; kind?: string } = {}): AdminActivityPage {
  const per = Math.min(100, Math.max(5, Number(opts.per) || 10));
  const kind = opts.kind || '';
  const all: AdminActivity[] = [];
  for (const c of clients) {
    for (const r of readLines<Activity>(file(c.slug), (x) => !kind || x.kind === kind)) {
      const { items: _items, ...rest } = r;
      all.push({ ...rest, client: c.name, slug: c.slug });
    }
  }
  all.sort((a, b) => b.t - a.t);
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(Math.max(1, Number(opts.page) || 1), pages);
  return { rows: all.slice((page - 1) * per, page * per), total, page, pages, per };
}

export function readActivity(slug: string, opts: { page?: number; per?: number; kind?: string; ref?: string } = {}): ActivityPage {
  const per = Math.min(100, Math.max(5, Number(opts.per) || 25));
  const kind = opts.kind || '';
  const ref = opts.ref || '';
  const all = readLines<Activity>(file(slug), (r) => (!kind || r.kind === kind) && (!ref || r.ref === ref));
  all.reverse();
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(Math.max(1, Number(opts.page) || 1), pages);
  return { rows: all.slice((page - 1) * per, page * per), total, page, pages, per };
}
