import { ARTMARK_PROFILE } from './clients.js';
import { cleanFilters, filtersActive, intentFilters, rulesIntent } from './rules.js';
import { companyBody, peopleBody, DEP_CODES } from './apollo.js';
import { fitRule } from './llm.js';
import { sampleCompanies, sampleEnrich, sampleLookup, samplePeople } from './samples.js';
import { describe, isDue, nextRun, runFinder, zonedMidnight } from './finders.js';
import { usageCompute } from './usage.js';
import { draftNote, roleFromTitle, sizeBucket } from './launchpad.js';
import type { Client, Finder, UsageRow } from './types.js';

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

const client: Client = { slug: 'test', name: 'Test', access_key: 'k', enabled: true, created: 0, launchpad: { location_id: '', token: '', app_url: '', pipeline: 'Business Development', quote_stage: '', owner: '', timezone: tz, users: {} }, keys: { openai: '', openai_model: '', apollo: '' }, limits: { credits_per_month: 0 }, profile: ARTMARK_PROFILE };
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

console.log(process.exitCode ? `FAILURES in ${n} checks` : `all ${n} checks pass`);
