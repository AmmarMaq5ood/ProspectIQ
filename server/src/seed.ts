import { ARTMARK_PROFILE, createClient, getClient, initData, saveClient } from './clients.js';

/**
 * First client: Artmark, with its profile. Launchpad token, location and keys
 * are entered in the admin panel afterwards.
 *   npm run seed            → creates "artmark" (no-op when it exists)
 *   npm run seed -- reset   → rewrites artmark's profile from the built-in one
 */

initData();
const existing = getClient('artmark');
if (existing && !process.argv.includes('reset')) {
  console.log(`artmark exists. Access key: ${existing.access_key}`);
} else if (existing) {
  existing.profile = ARTMARK_PROFILE;
  saveClient(existing);
  console.log('artmark profile reset to the built-in one.');
} else {
  const c = createClient({ slug: 'artmark', name: 'Artmark', profile: ARTMARK_PROFILE });
  console.log(`Created client "artmark". Access key: ${c.access_key}`);
  console.log('Next: open /admin, enter the ADMIN_KEY, and fill in Launchpad and the API keys.');
}
