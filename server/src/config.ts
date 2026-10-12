import 'dotenv/config';
import path from 'node:path';

/** Process-level settings. Per-client settings live in the client record (clients.ts). */
export const config = {
  port: Number(process.env.PORT || 3000),
  adminKey: process.env.ADMIN_KEY || '',
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-6-luna',
  apolloKey: process.env.APOLLO_API_KEY || '',
  launchpadApp: (process.env.LAUNCHPAD_APP_URL || 'https://app.launchpadinnovations.ai').replace(/\/$/, ''),
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  /** USD per million tokens [input, output], by model prefix; for the usage page. */
  openaiPrices: { 'gpt-6-luna': [0.1, 0.5] } as Record<string, [number, number]>,
};
