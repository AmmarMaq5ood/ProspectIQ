import 'dotenv/config';
import path from 'node:path';

function normalizeBase(v: string): string {
  v = v.trim().replace(/\/+$/, '');
  if (v && !v.startsWith('/')) v = `/${v}`;
  return v === '/' ? '' : v;
}

/** Process-level settings. Per-client settings live in the client record (clients.ts). */
export const config = {
  port: Number(process.env.PORT || 3000),
  /** URL prefix the app lives under behind nginx, e.g. /prospectiq ('' = the domain root). */
  basePath: normalizeBase(process.env.BASE_PATH || ''),
  adminKey: process.env.ADMIN_KEY || '',
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-6-luna',
  apolloKey: process.env.APOLLO_API_KEY || '',
  tregKey: process.env.TREG_API_KEY || '',
  /** SerpAPI key: Google Maps results for the Local businesses tab. */
  serpapiKey: process.env.SERPAPI_KEY || '',
  /** Google Maps Platform key (Places API New), preferred over SerpAPI when both are set. */
  gmapsKey: process.env.GOOGLE_MAPS_KEY || '',
  launchpadApp: (process.env.LAUNCHPAD_APP_URL || 'https://app.launchpadinnovations.ai').replace(/\/$/, ''),
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  /** USD per million tokens [input, output], by model prefix; for the usage page. */
  openaiPrices: { 'gpt-6-luna': [0.1, 0.5] } as Record<string, [number, number]>,
};
