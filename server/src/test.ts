import { ARTMARK_PROFILE } from './clients.js';
import { cleanFilters, filtersActive, intentFilters, rulesIntent } from './rules.js';
import { companyBody, peopleBody, DEP_CODES } from './apollo.js';
import { fitRule } from './llm.js';
import { sampleCompanies, sampleEnrich, sampleLookup, samplePeople } from './samples.js';
import { describe, isDue, nextRun, runFinder, zonedMidnight } from './finders.js';
import { usageCompute } from './usage.js';
import { draftNote, roleFromTitle, sizeBucket } from './launchpad.js';
import { matchesPerson, normCo } from './lpindex.js';
import { creditCheck, creditsLeft, currentPeriod, resetDate } from './credits.js';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { logActivity, readActivity, readActivityAll } from './activity.js';
import { autoPushState, dayKeyIn, finderLimitText, maxFinders } from './autopush.js';
import { costReport, featureOf, lastMonths, monthKey } from './costs.js';
import { isFreeMail, pickEmail, waterfall } from './treg.js';
import { DOC_PAGES, DOCS_DIR, fillPlaceholders, renderDoc } from './docs.js';
import { parsePeopleList, sourceOf, statsFromRows } from './wfadmin.js';
import type { Client, Finder, Person, UsageRow } from './types.js';

/** Pure checks, no network: the parser, filters, samples, schedule maths, usage, drafting. */

let n = 0;
const ok = (name: string, cond: boolean) => { n++; if (!cond) { console.error('FAIL', name); process.exitCode = 1; } else console.log('PASS', name); };

const i = rulesIntent('Purchasing and supply chain managers at valve and pump makers in Texas, 100 to 1,000 employees', ARTMARK_PROFILE);
ok('rules: titles', i.titles.includes('purchasing manager') && i.titles.includes('supply chain manager'));
ok('rules: industries', i.industry_keywords.includes('industrial valves') && i.industry_keywords.includes('pumps') && !i.industry_keywords.includes('valves'));
ok('rules: person location + sizes', i.person_locations[0] === 'Texas, US' && i.employee_ranges.join() === '51,100,101,200,201,500,501,1000');
ok('rules: kind people, summary', i.kind === 'people' && /Purchasing/.test(i.summary));
const c = rulesIntent('Industrial valve manufacturers in Ohio and Pennsylvania');
ok('rules: companies with HQ states', c.kind === 'companies' && c.company_locations.join('|') === 'Ohio, US|Pennsylvania, US' && c.departments.length === 0);
const b = rulesIntent('Owners and executives of electrical equipment manufacturers with $10M to $200M revenue');
ok('rules: revenue + seniority', b.revenue_min === 10000000 && b.revenue_max === 200000000 && b.seniorities.includes('owner') && b.seniorities.includes('c_suite'));
const h = rulesIntent('Purchasing managers at hotel groups in Florida', { ...ARTMARK_PROFILE, industries: ['hotels', 'resorts'] });
ok('rules: profile industries extend the vocabulary', h.industry_keywords.includes('hotels') && h.person_locations[0] === 'Florida, US');
ok('rules: unknown words become keywords', rulesIntent('lorem ipsum dolor').keywords === 'lorem ipsum dolor');

const f = intentFilters(i);
const body = peopleBody(f);
ok('intent → filters → body', (body.person_titles as string[]).length === 2 && (body.person_locations as string[])[0] === 'Texas, US' && (body.organization_num_employees_ranges as string[]).length === 4);
const cf = cleanFilters({ titles: 'a|b', sen: ['vp', 'bogus'], dep: ['supply_chain', 'purchasing'], domains: ['https://www.DeZURIK.com/x'], rev_min: '10,000,000', oids: ['abc', 'bad id'] });
ok('cleanFilters validates', cf.titles.join() === 'a,b' && cf.sen.join() === 'vp' && cf.dep.join() === 'supply_chain' && cf.domains[0] === 'dezurik.com' && cf.rev_min === '10000000' && cf.oids.join() === 'abc' && filtersActive(cf));
ok('company body keys', Object.keys(companyBody(cleanFilters({ oname: 'x', okw: ['y'], fund: ['12'], tech: ['Sales Force'] }))).join() === 'q_organization_name,q_organization_keyword_tags,currently_using_any_of_technology_uids,organization_latest_funding_stage_cd');
ok('department codes exclude unverified ones', DEP_CODES.includes('supply_chain') && !DEP_CODES.includes('purchasing'));

const sp = samplePeople(f, 2, 25);
ok('sample people paged and masked', sp.rows.length === 25 && sp.total === 412 && sp.rows[0].id === 'sp25' && sp.rows[0].last_obf);
const sc = sampleCompanies({ okw: ['pumps'] }, 1, 10);
ok('sample companies enriched', sc.rows.length === 10 && sc.rows[0].employees > 0 && !!sc.rows[0].city);
const en = sampleEnrich(sp.rows[0]);
ok('sample enrich unmasks', !en.last_obf && !en.last.includes('*') && !!en.org?.name);
ok('fit line (people)', /role/.test(fitRule(sp.rows[0], i, 'people')) || /buying side/.test(fitRule(sp.rows[0], i, 'people')));
ok('fit line (company)', /employees/.test(fitRule(sc.rows[0], c, 'companies')));

ok('role mapping', roleFromTitle('Purchasing Manager', ARTMARK_PROFILE.roles) === 'Purchasing' && roleFromTitle('VP Operations', ARTMARK_PROFILE.roles) === 'Executive' && roleFromTitle('Landscape Architect', ['Design', 'Other']) === 'Design');
ok('size bucket', sizeBucket(320) === '200-500' && sizeBucket(0) === '');
const lk = sampleLookup('gulfflowsystems.example.com');
const [note, msg] = draftNote(ARTMARK_PROFILE, lk.org, lk.people.slice(0, 2));
ok('draft note + message', note.startsWith('RESEARCH (ProspectIQ') && /Angle:/.test(note) && /Contacts: Dana Wh\*\*\*d/.test(note) && msg.startsWith('Hi Dana — Artmark helps manufacturers and OEMs in the Americas like Gulf Flow Systems with'));

const tz = 'America/New_York';
const mid = zonedMidnight(2026, 10, 13, tz);
ok('zoned midnight is 04:00 UTC in October', new Date(mid).toISOString() === '2026-10-13T04:00:00.000Z');
const fd: Finder = { id: 'x', name: 'T', q: '', intent: i, per_run: 5, hour: 8, minute: 30, start: zonedMidnight(2026, 10, 12, tz), repeat: 'weekdays', notify: true, enabled: true, created: 0, last_run: 0, last_result: '', seen: [] };
const mon = mid + 12 * 3600000; // Tue 13 Oct 2026 noon NY
const sat = zonedMidnight(2026, 10, 17, tz) + 12 * 3600000;
ok('weekdays finder due Tue noon, not Sat, not before 08:30', isDue(fd, tz, mon) && !isDue(fd, tz, sat) && !isDue(fd, tz, mid + 8 * 3600000));
ok('next run from Sat is Mon 08:30', new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(nextRun(fd, tz, sat))).replace(',', '') === 'Mon 08:30');
ok('describe', describe({ ...fd, start: 0 }, tz) === '5 a day at 08:30, weekdays');
ok('not twice a day', !isDue({ ...fd, last_run: mon - 60000 }, tz, mon));

const client: Client = { slug: 'test', name: 'Test', access_key: 'k', enabled: true, created: 0, launchpad: { location_id: '', token: '', app_url: '', pipeline: 'Business Development', quote_stage: '', owner: '', timezone: tz, users: {} }, keys: { openai: '', openai_model: '', apollo: '', treg: '' }, credits: { monthly: 1000, used: 0, period: '2026-10', extra: 0 }, flags: { show_usage: false, show_activity: true, email_waterfall: false }, auto_push: { daily: 50, day: '', used: 0 }, profile: ARTMARK_PROFILE };
process.env.DATA_DIR = process.env.DATA_DIR || './data-test';
const run = await runFinder(client, { ...fd, per_run: 4 }, false);
ok('finder sample run: 4 leads, nothing written', run.ok && run.pushed.length === 4 && /Sample run/.test(run.text) && run.seen.length >= 4);
const run2 = await runFinder(client, { ...fd, per_run: 4, seen: run.seen }, false);
ok('finder skips what it delivered', run2.pushed.length === 4 && run2.pushed[0].name !== run.pushed[0].name);

const rows: UsageRow[] = [
  { t: Date.now(), ctx: 'research:ask', p: 'apollo', ep: '/mixed_people/api_search', ok: 1, ms: 800, n: 10, credit: 0 },
  { t: Date.now(), ctx: 'research:ask', p: 'apollo', ep: '/people/match', ok: 1, ms: 900, n: 1, credit: 1 },
  { t: Date.now(), ctx: 'finder:V', p: 'openai', model: 'gpt-6-luna', kind: 'intent', ok: 1, ms: 1200, in: 1000, out: 200, cost: 0.0002 },
  { t: Date.now(), ctx: 'finder:V', p: 'openai', model: 'gpt-6-astra', kind: 'fits', ok: 1, ms: 1500, in: 2000, out: 400, cost: null },
];
const u = usageCompute(rows, 7, tz);
ok('usage totals', u.totals.searches === 1 && u.totals.lookups === 1 && u.totals.credits === 1 && u.totals.gpt_calls === 2 && u.totals.tokens_in === 3000 && !u.totals.cost_known && u.by_day.length === 7 && u.by_model['gpt-6-luna'].known && !u.by_model['gpt-6-astra'].known);

const lpc = { id: 'c1', first: 'Dana', last: 'Whitfield', company: 'Crane Pumps & Systems Inc.', email: 'dana@cranepumps.com' };
const masked = { ...sp.rows[0], first: 'Dana', last: 'Wh***d', last_obf: true, company: 'Crane Pumps and Systems', domain: 'cranepumps.com', email: '' };
ok('masked surname + company matches a Launchpad contact', matchesPerson(lpc, masked) && normCo('Crane Pumps & Systems Inc.') === normCo('crane pumps and systems'));
ok('masked surname with other letters does not match', !matchesPerson(lpc, { ...masked, last: 'Wa***d' }) && !matchesPerson(lpc, { ...masked, first: 'Dan' }));
ok('different company, no email: no match; same email: match', !matchesPerson(lpc, { ...masked, company: 'Other Co', domain: 'other.com' }) && matchesPerson(lpc, { ...masked, company: 'Other Co', domain: 'other.com', email: 'DANA@cranepumps.com' }));
const cr = (monthly: number, used: number, extra = 0) => ({ ...client, credits: { monthly, used, period: '2026-10', extra } });
ok('credit check', creditCheck(cr(10, 10), 1).startsWith('You are out of credits. Your 10 monthly credits reset on') && creditCheck(cr(10, 8), 3).includes('Only 2 credits left') && creditCheck(cr(10, 8), 2) === '' && creditsLeft(cr(5, 9)) === 0 && creditsLeft(cr(5, 5, 3)) === 3);
ok('period + reset date in a timezone', currentPeriod('America/New_York', Date.UTC(2026, 10, 1, 2, 0)) === '2026-10' && resetDate('America/New_York', Date.UTC(2026, 10, 1, 2, 0)).iso === '2026-11-01' && resetDate('UTC', Date.UTC(2026, 11, 15)).label === 'Jan 1, 2027');

fs.rmSync(path.join(config.dataDir, 'clients', 'test', 'activity.jsonl'), { force: true }); // the counts below assume an empty log
for (let k = 0; k < 7; k++) logActivity('test', { kind: k % 2 ? 'push' : 'finder', title: `event ${k}`, by: 'client', ok: true, credits: k, ref: k % 2 ? '' : 'f1' });
const pg = readActivity('test', { page: 2, per: 5 });
ok('activity paging newest first', pg.total === 7 && pg.pages === 2 && pg.page === 2 && pg.rows.map((r) => r.title).join() === 'event 1,event 0');
ok('activity filters', readActivity('test', { kind: 'push' }).total === 3 && readActivity('test', { ref: 'f1' }).total === 4 && readActivity('test', { page: 99, per: 10 }).page === 1);

/* ---- the daily cap on automatic pushes ---- */
{
  const tz = 'America/New_York';
  const noon = Date.UTC(2026, 9, 14, 16, 0); // 12:00 in New York on 14 Oct
  const base = { slug: 'x', launchpad: { timezone: tz } } as unknown as Client;
  ok('auto push: day key in the client timezone', dayKeyIn(tz, noon) === '2026-10-14' && dayKeyIn(tz, Date.UTC(2026, 9, 15, 3, 30)) === '2026-10-14');
  const same = autoPushState({ ...base, auto_push: { daily: 50, day: '2026-10-14', used: 12 } } as Client, noon);
  ok('auto push: used today counts', same.used === 12 && same.left === 38 && same.daily === 50);
  const next = autoPushState({ ...base, auto_push: { daily: 50, day: '2026-10-13', used: 50 } } as Client, noon);
  ok('auto push: a new day starts at zero', next.used === 0 && next.left === 50);
  const none = autoPushState({ ...base, auto_push: undefined as unknown as Client['auto_push'] } as Client, noon);
  ok('auto push: old records default to 50', none.daily === 50 && none.left === 50);
  const over = autoPushState({ ...base, auto_push: { daily: 50, day: '2026-10-14', used: 60 } } as Client, noon);
  ok('auto push: never negative', over.left === 0);
}

/* ---- the cost report ---- */
{
  const now = Date.UTC(2026, 9, 15, 12, 0); // 15 Oct 2026
  const sep = Date.UTC(2026, 8, 20, 12, 0), oct = Date.UTC(2026, 9, 3, 12, 0);
  const rows = (slug: string): UsageRow[] => [
    { t: sep, ctx: 'research:ask', p: 'apollo', ok: 1, ms: 10, ep: '/mixed_people/api_search', n: 50 },
    { t: oct, ctx: 'research:ask', p: 'apollo', ok: 1, ms: 10, ep: '/mixed_people/api_search', n: 50 },
    { t: oct, ctx: 'finder:Valves', p: 'apollo', ok: 1, ms: 10, ep: '/people/match', credit: 1 },
    { t: oct, ctx: 'finder:Valves', p: 'apollo', ok: 1, ms: 10, ep: '/people/match', credit: 1 },
    { t: oct, ctx: 'finder:Valves', p: 'openai', ok: 1, ms: 10, model: 'gpt-6-luna', kind: 'fit', in: 1000, out: 200, cost: 0.0002 },
    { t: oct, ctx: 'research:lookup', p: 'openai', ok: 1, ms: 10, model: 'mystery', kind: 'fit', in: 10, out: 10, cost: null },
    { t: oct, ctx: 'research:lookup', p: 'apollo', ok: 0, ms: 10, ep: '/people/match', err: 'boom' },
  ].map((r) => ({ ...r, ctx: slug === 'b' ? r.ctx.replace('finder:Valves', 'research:people') : r.ctx })) as UsageRow[];
  ok('costs: month keys and feature names', lastMonths(3, now).join() === '2026-08,2026-09,2026-10' && monthKey(oct, 'America/New_York') === '2026-10' && featureOf('finder:x') === 'Daily finders' && featureOf('research:lookup') === 'Company lookup');
  const rep = costReport([{ slug: 'a', name: 'A', timezone: 'America/New_York', rows: rows('a') }, { slug: 'b', name: 'B', timezone: 'UTC', rows: rows('b') }], { months: 3, creditCost: 0.5, now });
  ok('costs: selected month totals', rep.selected === '2026-10' && rep.totals.credits === 4 && rep.totals.research === 2 && Math.abs(rep.totals.gpt - 0.0004) < 1e-9 && rep.totals.searches === 2 && rep.totals.lookups === 4 && rep.totals.errors === 2 && !rep.totals.gpt_known);
  ok('costs: by month', rep.months.length === 3 && rep.months[1].month === '2026-09' && rep.months[1].searches === 2 && rep.months[1].total === 0 && rep.months[2].credits === 4);
  ok('costs: by account with shares', rep.clients.length === 2 && rep.clients[0].share === 50 && rep.clients[0].by_feature['Company lookup'].lookups === 0 && rep.totals.clients_active === 2);
  ok('costs: by feature', rep.features.find((f) => f.feature === 'Daily finders')!.credits === 2 && rep.features.find((f) => f.feature === 'People tab')!.credits === 2 && rep.features.find((f) => f.feature === 'Scout')!.searches === 2);
  ok('costs: models', rep.models.find((m) => m.model === 'mystery')!.known === false && rep.models.find((m) => m.model === 'gpt-6-luna')!.calls === 2);
  const unpriced = costReport([{ slug: 'a', name: 'A', timezone: 'UTC', rows: rows('a') }], { months: 2, now });
  ok('costs: no credit price means counts only', unpriced.credit_cost === 0 && unpriced.totals.research === 0 && unpriced.totals.credits === 2);
}

/* ---- the admin feed across clients ---- */
{
  fs.rmSync(path.join(config.dataDir, 'clients', 'test2', 'activity.jsonl'), { force: true });
  { const t0 = Date.now(); while (Date.now() === t0) { /* the second client's events must be strictly newer */ } }
  for (let k = 0; k < 3; k++) logActivity('test2', { kind: 'search', title: `other ${k}`, by: 'client', ok: true, items: [{ name: 'x' }] });
  const feed = readActivityAll([{ slug: 'test', name: 'Test' }, { slug: 'test2', name: 'Other' }], { page: 1, per: 5 });
  ok('admin feed: merged newest first, paged, items dropped', feed.total === 10 && feed.pages === 2 && feed.rows.length === 5 && feed.rows[0].client === 'Other' && feed.rows[0].title === 'other 2' && !('items' in feed.rows[0]));
  ok('admin feed: kind filter', readActivityAll([{ slug: 'test', name: 'Test' }, { slug: 'test2', name: 'Other' }], { kind: 'push' }).total === 3);
}

/* ---- the email waterfall ---- */
{
  ok('waterfall: free-mail domains are rejected', isFreeMail('a@gmail.com') && !isFreeMail('a@flowserve.com'));
  ok('waterfall: picks a verified work email on the company domain', JSON.stringify(pickEmail({ email: 'jane@gmail.com', emails: [{ email: 'jane@flowserve.com', verified: false }, { email: 'j.doe@flowserve.com', status: 'valid' }, { email: 'jane@other.io', verified: true }] }, 'flowserve.com')) === JSON.stringify({ email: 'j.doe@flowserve.com', verified: true }));
  ok('waterfall: nothing usable', pickEmail({ email: 'x@yahoo.com' }, 'acme.com') === null && pickEmail('not an object') === null);
  const mk = (id: string, email = '', last = 'Doe', obf = false): Person => ({ id, first: 'Jane', last, last_obf: obf, title: 'Buyer', seniority: '', linkedin: '', email, has_email: !!email, has_phone: false, city: '', has_city: false, company: 'Acme', company_id: '', domain: 'acme.com', departments: [] });
  const people = [mk('a', 'have@acme.com'), mk('b'), mk('c'), mk('d'), mk('e', '', 'Wh***d', true)];
  const calls: string[] = [];
  const fake = async (_t: unknown, p: { first: string; last: string; domain: string }) => { calls.push(p.last); return p.last === 'Doe' ? { email: `jane.${calls.length}@acme.com`, verified: calls.length % 2 === 1, provider: 'test', cost: 0.01 } : null; };
  const r = await waterfall({ slug: 'test', key: 'k', ctx: 'test' }, people, { budgetMs: 5000, maxFinds: 2, concurrency: 1, find: fake as never });
  ok('waterfall: fills the missing ones up to the credit room, skips masked surnames', r.found === 2 && r.tried === 2 && r.skipped === 1 && people[1].email_source === 'waterfall' && people[1].email_verified === true && people[2].tags!.includes('email-unverified') && !people[3].email && people[0].email === 'have@acme.com');
  let clock = 0;
  const slow = async () => { clock += 20000; return { email: 'late@acme.com', verified: true, provider: 'slow', cost: 0.02 }; };
  const r2 = await waterfall({ slug: 'test', key: 'k', ctx: 'test' }, [mk('x'), mk('y'), mk('z')], { budgetMs: 30000, maxFinds: 9, concurrency: 1, find: slow as never, now: () => clock });
  ok('waterfall: stops at the time budget', r2.tried === 2 && r2.found === 2);
}

/* ---- finders running at once ---- */
{
  const base = { slug: 'x', launchpad: { timezone: 'UTC' } } as unknown as Client;
  ok('finders at once: default 2, admin value wins', maxFinders({ ...base, auto_push: { daily: 50, day: '', used: 0 } } as Client) === 2 && maxFinders({ ...base, auto_push: { daily: 50, day: '', used: 0, max_finders: 5 } } as Client) === 5);
  ok('finders at once: room, then blocked, then off', finderLimitText(2, 1) === '' && /Pause or remove one/.test(finderLimitText(2, 2)) && /switched off/.test(finderLimitText(0, 0)));
}


/* ---- docs ---- */
{
  const pages = DOC_PAGES.map((p) => renderDoc(p.slug)!);
  ok('docs: every page renders with its title', pages.every((d, i) => d && d.html.includes(`<title>${DOC_PAGES[i].title}`) && /<h1[^>]*>/.test(d.body)));
  ok('docs: no placeholder left unfilled', pages.every((d) => !/\{\{\s*[a-z_]+\s*\}\}/.test(d.body)));
  ok('docs: numbers come from the app settings', pages.find((d) => d.page.slug === 'overview')!.body.includes('50, all finders together') && pages.find((d) => d.page.slug === 'client-guide')!.body.includes('<strong>2 finders</strong>'));
  ok('docs: headings get ids and an on-this-page list', pages.find((d) => d.page.slug === 'client-guide')!.toc.some((t) => t.id === 'daily-finders') && pages.find((d) => d.page.slug === 'client-guide')!.body.includes('<h2 id="scout">'));
  ok('docs: links between pages resolve under /docs', pages.find((d) => d.page.slug === 'overview')!.body.includes('/docs/admin-guide"'));
  ok('docs: unknown placeholders are left alone, known ones filled', fillPlaceholders('a {{daily_cap}} b {{nope}}', { daily_cap: '50' }) === 'a 50 b {{nope}}');
  ok('docs: unknown page is null', renderDoc('nope') === null);
  const imgs = DOC_PAGES.flatMap((p) => [...fs.readFileSync(path.join(DOCS_DIR, p.file), 'utf8').matchAll(/\]\(img\/([^)]+)\)/g)].map((m) => m[1]));
  ok('docs: every screenshot a guide references exists and is captioned', imgs.length >= 6 && imgs.every((f) => fs.existsSync(path.join(DOCS_DIR, 'img', f))) && pages.find((d) => d.page.slug === 'overview')!.body.includes('<p class="cap">'));
}


/* ---- email waterfall admin ---- */
{
  const ppl = parsePeopleList('Jane Smith, acme.com\n# a comment\nJohn Q Doe www.Example.co.uk\nhttps://www.linkedin.com/in/someone-123/\nOnly Name\nMary Jones <https://linkedin.com/in/mary> acme.com\n');
  ok('waterfall tester: parses name + domain, multi-word surnames, LinkedIn URLs; skips comments and incomplete lines', ppl.length === 4 && ppl[0].first === 'Jane' && ppl[0].last === 'Smith' && ppl[0].domain === 'acme.com' && ppl[1].last === 'Q Doe' && ppl[1].domain === 'example.co.uk' && ppl[2].linkedin === 'https://www.linkedin.com/in/someone-123' && ppl[3].linkedin === 'https://linkedin.com/in/mary' && ppl[3].domain === 'acme.com');
  const multi = parsePeopleList('Muhammad Zeeshan\nhttps://plumtreegroup.net/\nhttps://www.linkedin.com/in/muhammad-zeeshan-6b4a921b5/?lipi=urn%3Ali%3Apage\nAda Lovelace (ada@analytical.co)\nhttps://www.acme.com/about-us\nGrace Hopper');
  ok('waterfall tester: a name followed by website and LinkedIn lines is one person; URLs and emails give the domain; a lone name is dropped', multi.length === 2 && multi[0].first === 'Muhammad' && multi[0].last === 'Zeeshan' && multi[0].domain === 'plumtreegroup.net' && multi[0].linkedin === 'https://www.linkedin.com/in/muhammad-zeeshan-6b4a921b5' && multi[1].first === 'Ada' && multi[1].domain === 'analytical.co' && !multi[1].linkedin);
  const now = Date.UTC(2026, 9, 16, 12);
  const rows: UsageRow[] = [
    { t: now - 1000, ctx: 'research:ask', p: 'treg', ok: 1, ms: 4000, n: 1, model: 'verified', kind: 'prov-a', cost: 0.012 },
    { t: now - 2000, ctx: 'finder:abc', p: 'treg', ok: 1, ms: 6000, n: 1, model: 'unverified', kind: 'prov-b', cost: 0.008 },
    { t: now - 3000, ctx: 'admin:waterfall', p: 'treg', ok: 1, ms: 5000, n: 0, model: 'none', cost: 0 },
    { t: now - 4000, ctx: 'research:ask', p: 'treg', ok: 0, ms: 30000, err: 'timeout' },
    { t: now - 40 * 86400000, ctx: 'research:ask', p: 'treg', ok: 1, ms: 1000, n: 1, model: 'verified', cost: 0.01 },
    { t: now - 500, ctx: 'research:ask', p: 'apollo', ok: 1, ms: 100, ep: '/people/match', n: 1, credit: 1 },
  ];
  const st = statsFromRows([{ slug: 'a', name: 'Acme', rows }], 30, now);
  ok('waterfall stats: counts tried, found, verified, errors, cost within the period, ignores other providers', st.totals.tried === 4 && st.totals.found === 2 && st.totals.verified === 1 && st.totals.errors === 1 && Math.abs(st.totals.cost - 0.02) < 1e-9);
  ok('waterfall stats: hit rate on calls that answered, verified share, cost per email', Math.abs(st.totals.hit_rate - 2 / 3) < 1e-9 && st.totals.verified_share === 0.5 && Math.abs(st.totals.cost_per_email - 0.01) < 1e-9);
  ok('waterfall stats: by source and by day, recent newest first', st.by_source.length === 3 && sourceOf('finder:x') === 'Daily finders' && sourceOf('admin:waterfall') === 'Tests' && st.by_day.length === 1 && st.by_day[0].tried === 4 && st.recent[0].t === now - 1000 && st.recent[3].err === 'timeout');
}

console.log(process.exitCode ? `FAILURES in ${n} checks` : `all ${n} checks pass`);
