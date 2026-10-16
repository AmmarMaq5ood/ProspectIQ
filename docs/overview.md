# Product overview

*For the Launchpad team and sales. Last updated {{updated}}.*

ProspectIQ is Launchpad's lead research tool. A client describes the buyers they want in plain words. ProspectIQ finds matching people and companies in a research database of business contacts, fills in work emails, skips anyone already in the client's Launchpad, and pushes the chosen leads into Launchpad as companies, contacts, research notes and outreach deals. Daily finders repeat a saved search on a schedule, so new leads keep arriving without anyone searching.

It opens inside Launchpad from a custom menu link, so clients never leave their CRM. Every client has their own Launchpad connection, profile, templates, credits and usage, all managed from the agency's admin panel.

## Who it is for

- Launchpad clients who sell to other businesses and want a steady supply of named decision-makers at the right companies: OEM suppliers, distributors, agencies, consultancies, B2B services, lenders.
- The agency's own outbound team, with the same tool pointed at the agency's prospects.

It is not for consumer businesses. The research database holds business contacts only.

## What a client gets

| Tab | What it does |
| --- | --- |
| **Scout** | Type a request such as "purchasing managers at valve makers in Texas with 100 to 1,000 employees". ProspectIQ reads it, shows how it was understood, lists the matches with a one-line reason each fits, and pushes the ticked ones to Launchpad. Any search can become a daily finder. |
| **People, Companies, Industries** | The same research with every filter laid out: titles, seniority, department, locations, company size, revenue, funding, technologies, email status. Industries adds a size and headquarters breakdown and a one-click "find buyers at these companies". |
| **Company lookup** | One website address in; the company, its buyers, a drafted research note and a connection message out. |
| **Daily finders** | Saved searches that run on their own schedule and push only new leads, with a notification through Launchpad. |
| **Activity** | Every push, finder run, search and credit change, newest first. |
| **Usage** | Searches, lookups and credits by day and by feature. |

## What a push creates in Launchpad

For each ticked lead:

- A **company record**, with website, location, industry and size.
- A **contact** with full name, title, work email where one was found, LinkedIn URL, and the fields Role, Industry and Company Size. Contacts are tagged `research`; finder leads also get `leads-finder` and `leads-finder-new`.
- A **research note** on the first contact at each company: why these people fit, a short company brief and a suggested connection message, written from the client's profile.
- An **outreach deal** at the first stage of the client's chosen pipeline, one per company.

Existing contacts are updated, never duplicated. Results already in Launchpad are marked "already a contact", and finders skip them.

## Credits

- Each client has a monthly allowance of lookup credits, {{monthly_credits}} by default, resetting on the 1st in the client's timezone.
- Searching is free, and so are company pushes. One credit is spent for each person who lands in Launchpad as a **new contact with a work email**. Updating an existing contact costs nothing.
- At zero, pushes and finders stop. The client sees the reset date and the agency's support address.
- The agency can raise the allowance, add bonus credits for the current month, or top a client up to the full allowance in one click. Every change is listed in the client's credit ledger.

## Email coverage

The research database returns a work email for most decision-makers at mid-size and larger companies. For the rest, the **email waterfall** asks a second source during the push, within a time budget (30 seconds for a manual push, 90 seconds for a finder run) and only for people whose surname is fully known. It is off by default and the agency switches it on per client. An email found this way counts like any other: one credit when the contact is new.

## Daily finders and their limits

| Rule | Value |
| --- | --- |
| Automatic pushes per account per day | {{daily_cap}}, all finders together, counted in the client's timezone |
| Finders running at the same time | {{max_finders}} |
| Leads per run | Chosen per finder, 1 to 100 |
| Schedule | Start date, run time, every day, weekdays only, or once a week |
| Notification | A Launchpad workflow on the tag `leads-finder-new` sends the "found N new leads" message by SMS, WhatsApp or email |

The agency can change the daily cap and the finders-at-a-time limit for each client. When the cap is reached, finders pause until the next day.

## How requests are read

AI reads each request into titles, seniority, department, industry, location, company size, revenue, technologies and keywords, then writes a one-line "why they fit" for every result. A built-in parser covers the same ground when no AI key is set. The client sees the reading as "Understood as" chips and can change every condition on the filter tabs.

## The agency's admin panel

- **Overview**: totals across clients and a paged, filterable activity feed.
- **Clients**: add a client in five steps (Launchpad connection, profile drafted from their website, templates, keys and limits, menu links). Each client has credits and visibility settings, a top-up button, finders, activity and usage.
- **Costs**: what each month cost by account, feature, model and day.
- **Settings**: the one menu link that works for every sub-account, the support email, and the API keys, shown masked.

The [admin guide](admin-guide) covers each screen.

## Data, access and privacy

- Clients sign in through their menu link. The key becomes a cookie and disappears from the address bar. The app opens only inside Launchpad or at its own address.
- Each client's data lives in its own folder: profile, pushed leads, finders, activity, credits and usage. Nothing is shared between clients.
- Search results show first name, masked surname, title and company. Full names and emails are fetched only for the people a client pushes.
- With no research key the app runs in sample mode: canned results, nothing written. Useful for demos.

## Questions prospects ask

**Does it need Launchpad?** Yes. ProspectIQ pushes into a Launchpad sub-account and opens from its menu.

**Where do the leads come from?** A research database of business contacts and companies, plus a second email source when the waterfall is on. ProspectIQ never scrapes the client's own CRM or inbox.

**Will it create duplicates?** No. Pushes update existing contacts, and results already in Launchpad are flagged and skipped by finders.

**How many leads a day?** As many as the client pushes by hand, within their credits, plus up to {{daily_cap}} automatic pushes a day from finders.

**Can the client control what gets pushed?** Yes. Every lead is ticked by hand on Scout and the filter tabs, and finders are limited per run and per day.

## Links

- The app: {{app_url}}/
- [Client guide](client-guide), [Admin guide](admin-guide), [What's new](changelog)
