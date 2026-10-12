# ProspectIQ

Plain-words lead research for Launchpad clients. A client types what leads they want ("purchasing managers at valve makers in Texas with 100 to 1,000 employees"), ProspectIQ reads the request, searches the research database, explains why each lead fits, and pushes the ticked ones into the client's Launchpad sub-account as companies, contacts with roles, a research note and an outreach deal. Daily finders run saved searches on their own schedule.

This is the Node + React rebuild of the PHP research tool that lives in the Artmark dashboard. It is **multi-client from the start**: every client has its own Launchpad connection, profile (what they sell and to whom), templates, keys and usage log, all managed from an admin panel.

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
3. **Templates**: the ready-made requests on the Ask tab, grouped by theme.
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

**Updating later:** `cd ~/prospectiq && git pull && npm install && npm run build && pm2 restart prospectiq`.

The site is https (the sign-in cookie is `SameSite=None; Secure`, which Launchpad's iframe needs). Finders run inside the pm2 process; no cron. `pm2 logs prospectiq` shows the finder runs and API errors.

## How a client uses it

- **Ask**: type a request; the "Understood as" chips show how it was read; tick leads; *Push to Launchpad*. *Refine with all filters* opens the same search on the People or Companies tab.
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
