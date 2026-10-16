# Admin guide

*Onboarding, credits, keys and costs for the agency. Last updated {{updated}}.*

## Signing in

Open {{app_url}}/admin and enter the admin key. The sidebar has Overview, Clients, Costs and Settings, a dark mode toggle, and **Open as** to see the app the way a client does. Add `?as=<client slug>` to any client URL to act as that client.

## Overview

Totals across all clients and the agency-wide activity feed, newest first. The feed is paged and can be filtered by kind (pushes, finder runs, searches, credits, admin changes) and by client.

## Adding a client

Clients → **New client**, then work through the sections on the client page.

1. **Launchpad connection**. The sub-account's location id, a private integration token, the Launchpad app address and the outreach pipeline. **Test connection** lists the sub-account's pipelines so you can pick one. Save the location id: it is how the one menu link finds this client.
2. **Profile**. What they sell, who buys it, the industries to search, the roles to assign and the outreach angles. **Draft with GPT** reads the client's website and writes a first pass; edit it before saving. The profile shapes how requests are read, which titles Company lookup searches for and what the research notes say.
3. **Templates**. Ready-made requests the client sees on the Scout tab, grouped by theme, one per line, written the way a person would ask. Up to six per group are shown.
4. **Keys & limits**. Leave the keys blank to use the agency keys from Settings. Set the daily cap on automatic pushes and how many finders may run at a time, and switch the email waterfall on if the client should get it.
5. **Access & links**. The client's own menu link with their access key. **Rotate** the key if it leaks. Most agencies use the one universal link from Settings instead and add it once at agency level.

## The client page, section by section

### Credits & visibility

- **Monthly allowance**: the credits that reset on the 1st in the client's timezone. Default {{monthly_credits}}.
- **Bonus credits**: extra credits for the current month only.
- **Top up to full**: resets the month's usage so the client is back at 100% of the allowance. Use it when a client has run out mid-month and you have agreed to cover it.
- **Show Activity** and **Show Usage**: whether the client sees those tabs.
- The ledger under the controls lists every allowance change, bonus and top-up with who did it.

### Keys & limits

- **Research database key** and **AI key** per client, for clients who bring their own. Blank means the agency keys.
- **Automatic pushes per day**: the cap for all of the client's finders together. Default {{daily_cap}}.
- **Finders at a time**: how many finders may be running. Default {{max_finders}}. Zero switches finders off for the account.
- **Email waterfall**: on or off for this client. When on, pushes ask a second source for emails the research database lacks, within a time budget. The agency pays for those lookups; the client sees them as ordinary credits.

### Finders

Every finder the client saved, with its schedule, last run and next run. You can pause, run or remove any of them.

### Activity and Usage

The client's own log and usage, the same views the client sees, plus the entries made by admins.

## Settings

- **Universal menu link**: `…/?loc={{location.id}}&k=<secret>`. Added once in Launchpad at agency level under custom menu links, it opens each sub-account's own ProspectIQ, matched by the location id saved on the client's connection. Sub-accounts not set up yet see a "not switched on" page. **Rotate** the secret if it leaks; the old link stops working at once.
- **Support email**: shown to clients when they run out of credits, and in the finders' limit messages.
- **Cost per lookup credit**: what the agency pays per credit, used by the Costs page.
- **API keys**: the research database, the AI model and the email waterfall. Keys are shown masked once saved. **Remove** clears one. A key pasted here is used by every client without a key of their own.

## Costs

Pick a month. The page shows the agency's spend by account, by feature (Scout, the research tabs, company lookups, daily finders, the email waterfall), by AI model and by day, with searches, lookups, credits, AI calls, tokens and errors. Costs come from the usage log, so they cover every call the app made, not only the pushes.

## Day-to-day tasks

| Task | Where |
| --- | --- |
| A client ran out of credits | Client → Credits & visibility → add bonus credits or **Top up to full** |
| A client wants more automatic leads | Client → Keys & limits → raise **Automatic pushes per day** or **Finders at a time** |
| Switch on the email waterfall for a client | Client → Keys & limits → **Email waterfall** |
| A finder is misbehaving | Client → Finders → pause it, or open the client's Scout tab with **Open as** and inspect the search |
| Rotate a leaked key | Client → Access & links → **Rotate**, or Settings → **Rotate** for the universal link |
| See what a client did today | Client → Activity, or Overview with the client filter |
| Check what this month cost | Costs |

## Behind the scenes

- Each client's data lives in its own folder on the server: profile, pushed leads, finders, activity, credit ledger and usage log. The agency settings live beside them. Back up the data folder; everything else is rebuilt from the code.
- Finders run inside the server process every five minutes, in each client's timezone. No cron is needed.
- Without a research key the app runs in sample mode: canned results, nothing written, pushes disabled. Add `?sample=1` to any URL to force it for a demo.
- Deploying, logs and the update script are described in the project README.
