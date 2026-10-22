# ProspectIQ

Plain-words lead research for Launchpad clients. A client types what leads they want ("purchasing managers at valve makers in Texas with 100 to 1,000 employees"), ProspectIQ reads the request, searches the research database, explains why each lead fits, and pushes the ticked ones into the client's Launchpad sub-account as companies, contacts with roles, a research note and an outreach deal. Daily finders run saved searches on their own schedule.

This is the Node + React rebuild of the PHP research tool that lives in the Artmark dashboard. It is **multi-client from the start**: every client has its own Launchpad connection, profile (what they sell and to whom), templates, keys and usage log, all managed from an admin panel.

## Documentation

The product overview, client guide, admin guide and changelog live in `docs/*.md` and are served by the app at `/docs` (live: https://js.launchpadinnovations.ai/prospectiq/docs), no sign-in needed. Numbers the app enforces (default credits, the daily cap, finders at a time) are filled in at render time from the settings. The client header has a Guide link and the admin sidebar a Docs link. **Every feature commit updates the matching page and adds a line to `docs/changelog.md`.** Nothing secret goes in these files: they are public.

## Layout

```
server/   Express + TypeScript API, finder scheduler, JSON-file storage
client/   Vite + React app (the pages clients and admins see)
data/     created at runtime: clients.json and data/clients/<slug>/…   (git-ignored)
```

| Server file | Does |
| --- | --- |
| `src/index.ts` | HTTP server: `/api/*`, serves `client/dist`, SPA fallback, starts the scheduler |
| `src/routes.ts` | Every API route: auth, ask, search, lookup, pushes, finders, usage, admin |
| `src/clients.ts` | Client records, access keys, the Artmark seed profile |
| `src/rules.ts` | The built-in request parser (used when there is no OpenAI key, and as GPT's fallback) |
| `src/llm.ts` | GPT: reads requests, writes fit lines, drafts a client profile from a website |
| `src/apollo.ts` | The research database client (searches, enrichment, plan limits), with usage logging |
| `src/launchpad.ts` | The CRM API: businesses, contacts, notes, opportunities, associations |
| `src/push.ts` | Grouping ticked people by company and pushing each company |
| `src/finders.ts` | Saved searches: schedule maths in the client's timezone, one run, the 5-minute scheduler |
| `src/usage.ts` | The per-client usage log and its summaries |
| `src/samples.ts` | Canned results for sample mode (no research key) |
| `src/seed.ts` | `npm run seed`: creates the Artmark client |
| `src/test.ts` | `npm test`: pure checks, no network |

## Run it locally

Node 20 or newer.

```bash
npm install
cp .env.example .env        # set ADMIN_KEY; the API keys can wait
npm run build               # builds the React app, then the server
npm run seed                # creates the "artmark" client and prints its access key
npm start                   # http://localhost:3000
```

Open `http://localhost:3000/admin`, enter the `ADMIN_KEY`, click **Artmark** and fill in the tabs:

1. **Launchpad connection**: location id, private integration token, app address, outreach pipeline. *Test connection* lists the sub-account's pipelines so you can pick one.
2. **Profile**: what they sell, who buys it, industries to search, roles, outreach angles. *Draft with GPT* reads the client's website and writes a first pass (needs an OpenAI key).
3. **Templates**: the ready-made requests on the Scout tab, grouped by theme.
4. **Keys & limits**: per-client OpenAI and research-database keys. Blank means the agency keys from `.env`.
5. **Access & links**: the two menu links to add in Launchpad (*Settings → Custom menu links*, open inside the app). The access key in the link signs the client in; rotate it any time.

For development with hot reload: `npm run dev` (server on 3000) and `npm run dev:client` (Vite on 5173, proxies `/api`).

Without a research key the app runs in **sample mode**: canned results, nothing written, pushes disabled. Add `?sample=1` to any URL to force it.

## Deploy on the CloudPanel VPS (shared Node.js site, path prefix)

The VPS runs CloudPanel. The Node.js site `js.launchpadinnovations.ai` already serves other apps, so ProspectIQ lives under a prefix on that domain, `https://js.launchpadinnovations.ai/prospectiq/`, on its own port. Nothing else on the site changes.

**1. Shell on the VPS** (Hostinger hPanel → VPS → Terminal, or SSH as root), then become the site user:

```bash
su - launchpadinnovations-js
node -v                              # needs 20 or newer
ss -ltn | grep -E ':3[0-9]{3} '      # ports already in use; pick a free one (3010 below)
cd ~ && git clone https://github.com/AmmarMaq5ood/ProspectIQ.git prospectiq
cd prospectiq && npm install
```

**2. Settings** in `~/prospectiq/.env`:

```
PORT=3010
BASE_PATH=/prospectiq
PUBLIC_URL=https://js.launchpadinnovations.ai/prospectiq
ADMIN_KEY=<a long random string>
DATA_DIR=/home/launchpadinnovations-js/prospectiq-data
OPENAI_API_KEY=<agency key>
OPENAI_MODEL=gpt-6-luna
APOLLO_API_KEY=<agency key>
SERPAPI_KEY=<agency key, optional: Google Maps for the Local businesses tab>
LAUNCHPAD_APP_URL=https://app.launchpadinnovations.ai
```

**3. Build, seed, run under pm2:**

```bash
npm run build                        # the client reads BASE_PATH from .env
npm run seed                         # creates Artmark, prints its access key
npm i -g pm2 2>/dev/null || true     # skip if pm2 is already there
pm2 start server/dist/index.js --name prospectiq --cwd ~/prospectiq
pm2 save && pm2 startup              # run the printed command once as root so it survives reboots
curl -s http://127.0.0.1:3010/prospectiq/api/health
```

**4. nginx** in CloudPanel → Sites → js.launchpadinnovations.ai → Vhost: add this block *above* the existing `location /` block, then save:

```nginx
location /prospectiq/ {
    proxy_pass http://127.0.0.1:3010;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 300;
}
location = /prospectiq { return 301 /prospectiq/; }
```

`https://js.launchpadinnovations.ai/prospectiq/api/health` should then answer. Open `/prospectiq/admin`, enter the admin key, fill in Artmark's Launchpad token, location id and pipeline (the data folder on the VPS starts empty), and paste the two menu links from *Access & links* into Launchpad.

**Updating by hand:** `cd ~/prospectiq && git pull && bash deploy/update.sh` (pull, install, build, pm2 restart, health check).

## Auto-deploy on push (GitHub Actions)

`.github/workflows/deploy.yml` runs on every push to `main`: it installs, builds and runs the tests on GitHub, and only if that passes it SSHes into the VPS as the site user and runs `deploy/update.sh`. Until the secrets below exist the deploy job is skipped with a notice, so the checks still run.

One-off setup:

1. **Deploy key.** On your laptop (Git Bash): `ssh-keygen -t ed25519 -N "" -f ~/.ssh/prospectiq_deploy -C prospectiq-deploy`. Then on the VPS, as the site user, append the *public* key to `~/.ssh/authorized_keys` (create `~/.ssh` with mode 700 and the file with mode 600 if missing).
2. **Secrets** in the GitHub repo → Settings → Secrets and variables → Actions:
   - `DEPLOY_HOST` = `2.24.203.63`
   - `DEPLOY_USER` = `launchpadinnovations-js`
   - `DEPLOY_KEY` = the whole contents of the *private* key file `~/.ssh/prospectiq_deploy`
3. Push to `main` (or run the workflow from the Actions tab). The deploy job prints the health-check line when it is done.

The server keeps its own `.env` and data folder; the deploy resets only tracked files to the pushed commit. A failed build or test on GitHub never touches the server.


The site is https (the sign-in cookie is `SameSite=None; Secure`, which Launchpad's iframe needs). Finders run inside the pm2 process; no cron. `pm2 logs prospectiq` shows the finder runs and API errors.

## Credits, the one menu link, and duplicates

- **Credits.** Each client has a monthly allowance (1,000 by default) that resets on the 1st in the client's timezone. Searching is free; one credit is used for each lead that lands in Launchpad as a *new* contact with a work email. Updating an existing contact costs nothing. At zero, pushes and finders stop and the client sees the reset date and the agency's support email (set under Settings). The admin raises the allowance or adds bonus credits for the current month under *client → Credits & visibility*, where every change is listed. Clients see their credits left in the header; cost is only ever shown in the admin panel. The client's Usage tab is off unless switched on there.
- **One menu link for every sub-account.** The admin Clients page shows `…/?loc={{location.id}}&k=<secret>`. Added once at agency level in Launchpad, it opens each sub-account's own ProspectIQ (matched by the location id saved on the Launchpad connection tab). Sub-accounts not set up yet see a "not switched on" page. Per-client `?key=` links still work. Rotate the secret from the same card if it ever leaks.
- **Already in Launchpad.** Search results are checked against what this app pushed (`pushed.json`), every contact tagged `research`, and the contacts at the same company (by name, even with a masked surname). Those rows get an "already a contact" tag and a switch to hide them; finders skip them automatically.

- **Activity log.** Every finder run, push, search, lookup and credit change is appended to the client's `activity.jsonl` with who did it, the credits it used and the people involved. Clients see it on their Activity tab (paginated, filterable, switchable per client in admin); the admin sees any client's log and an agency-wide feed on the Overview page.
- **Admin app.** A sidebar app at `/admin`: Overview (totals across clients, latest activity), Clients, Settings (the universal link, the support email), and a per-client workspace with sections for the Launchpad connection, profile, templates, credits & visibility, keys, access, finders, activity and usage. Dark mode is a toggle in the sidebar, remembered per browser, and applies to the admin side only.

## How a client uses it

- **Scout** (called Ask until Oct 2026; renamed so clients do not mix it up with Launchpad's built-in Ask AI): type a request; the "Understood as" chips show how it was read; tick leads; *Push to Launchpad*. *Refine with all filters* opens the same search on the People or Companies tab.
- **People / Companies / Industries**: every filter the research database offers (titles, seniority, department, locations, size, revenue, funding, technologies, email status). Industries adds a size and headquarters breakdown and a one-click "find buyers at these companies".
- **Company lookup**: one domain in; the company, its buyers, a drafted research note and connection message out.
- **Daily finders**: saved searches with a start date, time, repeat rule and leads-per-run. New leads get the tags `leads-finder` and `leads-finder-new`; a Launchpad workflow on `leads-finder-new` sends the notification.
- **Usage**: searches, lookups, credits, GPT calls, tokens and cost, by day, feature and model.

Searches are free. A lookup credit is spent only when a pushed person's work email is revealed.

## Rules for client-facing text

Anything a client can see says **Launchpad**, never GoHighLevel or GHL, and never names the research provider: it is "the research database" and "lookup credits". Code and this README may name the APIs.

## Tests

```bash
npm test          # parser, filters, samples, schedule maths, usage, drafting (no network)
```

## API (all under `/api`, JSON, cookie auth)

`POST auth/key` · `POST auth/admin` · `POST auth/logout` · `GET me` · `GET options` · `GET recent` · `POST ask` · `POST search` · `POST lookup` · `POST push/people` · `POST push/companies` · `POST push/lookup` · `GET/POST finders` · `POST finders/:id/run` · `POST finders/:id/toggle` · `DELETE finders/:id` · `GET usage` · admin: `GET/POST admin/clients`, `GET/PUT/DELETE admin/clients/:slug`, `POST …/rotate-key`, `POST …/test`, `POST …/draft`, `GET …/usage`. An admin can add `?as=<slug>` to act as a client.
