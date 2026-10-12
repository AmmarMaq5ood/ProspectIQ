import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

/**
 * Tiny file store: one JSON file per thing, one JSONL per log, per client.
 * Enough for a handful of clients; swap for a database behind these calls
 * when that stops being true.
 */

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function clientDir(slug: string): string {
  const dir = path.join(config.dataDir, 'clients', slug);
  ensureDir(dir);
  ensureDir(path.join(dir, 'cache'));
  return dir;
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    return raw.trim() ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

export function appendLine(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(value) + '\n');
}

export function readLines<T>(file: string, keep: (row: T) => boolean): T[] {
  if (!fs.existsSync(file)) return [];
  const out: T[] = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as T;
      if (keep(row)) out.push(row);
    } catch {
      // skip a broken line
    }
  }
  return out;
}

/** Cache a JSON value on disk for ttl seconds (per client cache folder). */
export async function cached<T>(slug: string, key: string, ttlSeconds: number, make: () => Promise<T>): Promise<T> {
  const file = path.join(clientDir(slug), 'cache', `${hash(key)}.json`);
  try {
    if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < ttlSeconds * 1000) {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
    }
  } catch {
    // fall through
  }
  const value = await make();
  try {
    writeJson(file, value);
  } catch {
    // caching is best effort
  }
  return value;
}

export function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + s.length.toString(16);
}
