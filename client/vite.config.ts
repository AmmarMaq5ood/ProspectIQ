import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

/**
 * BASE_PATH (env, or the BASE_PATH line in the repo's .env) puts the built
 * app under a prefix such as /prospectiq, matching the server's BASE_PATH.
 */
function basePath(): string {
  let v = process.env.BASE_PATH || '';
  if (!v) {
    try {
      const env = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
      const m = /^BASE_PATH=(.*)$/m.exec(env);
      if (m) v = m[1].trim();
    } catch { /* no .env */ }
  }
  v = v.trim().replace(/\/+$/, '');
  if (v && !v.startsWith('/')) v = `/${v}`;
  return `${v}/`;
}

export default defineConfig({
  base: basePath(),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
