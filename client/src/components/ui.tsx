import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { lpContactHref, nf, peopleAtHref } from '../api';
import { useApp } from '../App';
import type { CompaniesPushed, PeoplePushed, Person, SearchResult, IcpMatch } from '../types';
import { Icon } from './Icon';
import { Num } from './Motion';

/* ---- small shared pieces ---- */

export function Notice({ kind, children }: { kind: 'ok' | 'err'; children: ReactNode }) {
  return <div className={kind} role={kind === 'err' ? 'alert' : 'status'}>{children}</div>;
}

export function Errors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return <Notice kind="err">{errors.map((m, i) => <p key={i}>{m}</p>)}</Notice>;
}

export function LpLink({ href, children }: { href: string; children: ReactNode }) {
  if (!href) return <span>{children}</span>;
  return <a className="lp" href={href} target="_blank" rel="noopener">{children} <Icon name="external" /></a>;
}

export function Pager({ res, onPage }: { res: SearchResult<unknown>; onPage: (p: number) => void }) {
  const page = res.page;
  const pages = Math.max(1, res.pages);
  const from = (page - 1) * res.per_page + 1;
  const to = Math.min(res.total, page * res.per_page);
  return (
    <div className="pager">
      <span>{res.total ? `${nf(from)}–${nf(to)} of ${nf(res.total)}` : 'No results'}</span>
      <span className="sp">
        <a className={`btn secondary sm${page <= 1 ? ' dis' : ''}`} onClick={() => onPage(page - 1)}>Previous</a>
        <span style={{ margin: '0 6px' }}>Page {page} of {nf(pages)}</span>
        <a className={`btn secondary sm${page >= pages ? ' dis' : ''}`} onClick={() => onPage(page + 1)}>Next</a>
      </span>
    </div>
  );
}

export function PerPage({ value, options, onChange }: { value: number; options: number[]; onChange: (n: number) => void }) {
  return (
    <span className="sp">Show <select className="in" aria-label="Results per page" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {options.map((n) => <option key={n} value={n}>{n}</option>)}
    </select></span>
  );
}

export function Group({ label, count, open, children }: { label: string; count: number; open?: boolean; children: ReactNode }) {
  return (
    <details className="fg" open={open || count > 0}>
      <summary>{label}{count > 0 && <span className="cnt">{count}</span>}</summary>
      <div className="fb">{children}</div>
    </details>
  );
}

export function Checks({ options, selected, onChange, one }: { options: Record<string, string>; selected: string[]; onChange: (v: string[]) => void; one?: boolean }) {
  return (
    <div className={`checks${one ? ' one' : ''}`}>
      {Object.entries(options).map(([v, label]) => (
        <label key={v}>
          <input type="checkbox" checked={selected.includes(v)} onChange={(e) => onChange(e.target.checked ? [...selected, v] : selected.filter((x) => x !== v))} /> {label}
        </label>
      ))}
    </div>
  );
}

export function Field({ id, label, children }: { id?: string; label: string; children: ReactNode }) {
  return <div><label className="f" htmlFor={id}>{label}</label>{children}</div>;
}

export function Range({ label, min, max, phMin, phMax, onMin, onMax }: { label: string; min: string; max: string; phMin: string; phMax: string; onMin: (v: string) => void; onMax: (v: string) => void }) {
  return (
    <div>
      <span className="f">{label}</span>
      <div className="range">
        <input type="number" value={min} placeholder={phMin} min={0} aria-label={`${label} minimum`} onChange={(e) => onMin(e.target.value)} />
        <span>to</span>
        <input type="number" value={max} placeholder={phMax} min={0} aria-label={`${label} maximum`} onChange={(e) => onMax(e.target.value)} />
      </div>
    </div>
  );
}

/** "already a contact", linking to the record in Launchpad. */
export function InLp({ p }: { p: Person }) {
  const { me } = useApp();
  if (!p.in_lp) return null;
  const href = me.client ? lpContactHref(me.client, p.in_lp.id) : '';
  const label = 'already a contact';
  return href ? <a className="pill inlp" href={href} target="_blank" rel="noopener" title={`In Launchpad as ${p.in_lp.name}`} onClick={(e) => e.stopPropagation()}>{label}</a> : <span className="pill inlp" title={`In Launchpad as ${p.in_lp.name}`}>{label}</span>;
}

/** The row under results: hide what is already in Launchpad. */
export function LpFilter({ n, hide, onChange }: { n: number; hide: boolean; onChange: (v: boolean) => void }) {
  if (!n) return null;
  return (
    <button type="button" role="switch" aria-checked={hide} className="toggle-row" onClick={() => onChange(!hide)}>
      <span className={`switch${hide ? ' on' : ''}`} />
      <span>Hide the {n} already in Launchpad</span>
    </button>
  );
}

/* ---- "Pushed to Launchpad" ---- */

export function PushedPeople({ data }: { data: PeoplePushed }) {
  return (
    <Notice kind="ok">
      <p><strong>Pushed to Launchpad.</strong> Each record opens in a new tab:</p>
      <ul className="items">
        {data.results.map((r, i) => {
          const l = data.links[i] || { company: '', opportunity: '', contacts: [] };
          return [
            <li key={`c${i}`}>
              <div className="t"><LpLink href={r.company.id ? l.company : ''}>{r.company.name}</LpLink></div>
              <div className="m">Company record{!r.company.id && ' (not created: contacts are grouped by company name instead)'}
                {r.opportunity.id && <> · <LpLink href={l.opportunity}>{r.opportunity.name}</LpLink> {r.opportunity.created ? 'created at the first stage' : 'already existed'}</>}
              </div>
            </li>,
            ...r.contacts.map((c, j) => (
              <li key={`c${i}p${j}`}>
                <div className="t"><LpLink href={c.id ? l.contacts[j] : ''}>{c.name}</LpLink></div>
                <div className="m">{c.priority && c.priority !== 'Normal' && <span className={`pill ${c.priority === 'Hot' ? 'hot' : 'high'}`} style={{ marginRight: 6 }}>{c.priority === 'Hot' ? 'ICP match · hot lead' : 'target match · high priority'}</span>}{c.role}{c.new ? ' · created' : ' · updated'}{c.email ? <> · {c.email}{c.email_source === 'waterfall' && <span className={`pill ${c.email_verified ? 'good' : ''}`} style={{ marginLeft: 6 }}>{c.email_verified ? 'found by the email waterfall' : 'found by the email waterfall · unverified'}</span>}</> : ' · no work email on file'}</div>
              </li>
            )),
          ];
        })}
      </ul>
      {data.errors.length > 0 && data.errors.map((e, i) => <p key={i}>{e}</p>)}
      {typeof data.credits_left === 'number' && <p>{data.credits_spent ? `${data.credits_spent} credit${data.credits_spent === 1 ? '' : 's'} used` : 'No credits used'} · {nf(data.credits_left)} left.</p>}
      <p>{data.bd ? <>Next: <a href={data.bd} target="_blank" rel="noopener">open the pipeline in Launchpad</a>, or keep searching.</> : 'Keep searching, or open the pipeline in Launchpad.'}</p>
    </Notice>
  );
}

export function PushedCompanies({ data }: { data: CompaniesPushed }) {
  return (
    <Notice kind="ok">
      <p><strong>Pushed to Launchpad.</strong> Company records, each opens in a new tab:</p>
      <ul className="items">
        {data.results.map((r, i) => (
          <li key={i}>
            <div className="t"><LpLink href={r.id ? data.links[i] : ''}>{r.name}</LpLink></div>
            <div className="m">{r.domain}{!r.id && ' · not created'} · <Link to={peopleAtHref(r.domain)}>find people here</Link></div>
          </li>
        ))}
      </ul>
      {data.errors.map((e, i) => <p key={i}>{e}</p>)}
    </Notice>
  );
}

/* ---- organisation pass (14 Oct 2026): shared layout pieces ---- */

/** Card header: an icon, the title, one line of help, actions on the right. */
export function CardHead({ icon, title, sub, children }: { icon?: string; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="card-h">
      {icon && <span className="ic"><Icon name={icon} /></span>}
      <div className="tt"><h2>{title}</h2>{sub && <span className="sub">{sub}</span>}</div>
      {children && <div className="act">{children}</div>}
    </div>
  );
}

/** Results header: the count is the headline, the summary follows, actions sit right. */
export function ResultsHead({ total, noun, summary, children }: { total: number; noun: string; summary?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rhead">
      <div className="n"><b className={total ? '' : 'zero'}><Num value={total} /></b><span className="noun">{noun}</span>{summary && <span className="sum">{summary}</span>}</div>
      {children && <div className="act">{children}</div>}
    </div>
  );
}

export type Facet = 'title' | 'people' | 'industry' | 'place' | 'size' | 'tech' | 'not' | 'other';
export interface CritGroup { label: string; facet: Facet; values: string[] }

/** "Understood as": the parsed request, grouped by facet and colour-coded. */
export function Criteria({ groups, edit }: { groups: CritGroup[]; edit?: ReactNode }) {
  const live = groups.filter((g) => g.values.length);
  const n = live.reduce((s, g) => s + g.values.length, 0);
  return (
    <div className="crit" aria-label="Search criteria">
      <div className="crit-h"><Icon name="spark" />Understood as{n > 0 && <span className="cnt">{n} condition{n === 1 ? '' : 's'}</span>}{edit && <span className="edit">{edit}</span>}</div>
      {live.length ? live.map((g) => (
        <div className="crit-g" key={g.label}>
          <span className="crit-l">{g.label}</span>
          <span className="crit-v">{g.values.map((v, i) => <span className={`fpill f-${g.facet}`} key={`${v}${i}`}>{v}</span>)}</span>
        </div>
      )) : <span className="none">Nothing specific: the words were searched as keywords.</span>}
    </div>
  );
}

/** The selection toolbar: real buttons, and the "hide already in Launchpad" switch on the right. */
export function SelectBar({ onPick, icp, email, newOnly, nLp, hide, onHide }: { onPick: (m: 'all' | 'none' | 'email' | 'new' | 'icp') => void; icp?: boolean; email?: boolean; newOnly?: boolean; nLp?: number; hide?: boolean; onHide?: (v: boolean) => void }) {
  return (
    <div className="selbar">
      <span className="lbl">Select</span>
      <span className="seg" role="group" aria-label="Select rows">
        <button type="button" onClick={() => onPick('all')}>All on this page</button>
        <button type="button" onClick={() => onPick('none')}>None</button>
        {email && <button type="button" onClick={() => onPick('email')}>With an email</button>}
        {newOnly && <button type="button" onClick={() => onPick('new')}>New to Launchpad</button>}
        {icp && <button type="button" onClick={() => onPick('icp')}>ICP matches</button>}
      </span>
      {onHide && typeof nLp === 'number' && <LpFilter n={nLp} hide={!!hide} onChange={onHide} />}
    </div>
  );
}

/** An empty state that says what to do next. */
export function EmptyState({ icon = 'search', title, text, children }: { icon?: string; title: string; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="emptys" role="status">
      <span className="ic"><Icon name={icon} /></span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children && <div className="act">{children}</div>}
    </div>
  );
}

/** The help footer: collapsed until wanted. */
export function Help({ title = 'How this works', more, children }: { title?: string; more?: string; children: ReactNode }) {
  return (
    <details className="help">
      <summary><Icon name="chevron" />{title}</summary>
      <div>
        {children}
        {more && <p><a href={`${import.meta.env.BASE_URL}docs/${more}`} target="_blank" rel="noopener">Read the full guide</a></p>}
      </div>
    </details>
  );
}

/** A card that stays folded until opened: a header row with a "Set up" button. */
export function Fold({ icon, title, sub, open, label = 'Set up', children }: { icon: string; title: ReactNode; sub?: ReactNode; open?: boolean; label?: string; children: ReactNode }) {
  return (
    <details className="card fold" open={open}>
      <summary>
        <span className="ic"><Icon name={icon} /></span>
        <div className="tt"><h2>{title}</h2>{sub && <span className="sub">{sub}</span>}</div>
        <span className="open-btn">{label}<Icon name="chevron" /></span>
      </summary>
      <div className="fold-b">{children}</div>
    </details>
  );
}

/** The left side of the push bar: the number, then one quiet line about what gets created. */
export function PushCount({ n, people, nEmail, left, waterfall }: { n: number; people: boolean; nEmail: number; left: number; waterfall?: boolean }) {
  const upTo = waterfall ? n : nEmail;
  return (
    <span className="cnt">
      <span><b>{n}</b> selected{people && <> · up to <b>{upTo}</b> credit{upTo === 1 ? '' : 's'} of {nf(left)} left</>}</span>
      <span className="det">{people ? `Creates the company, the contacts with roles, a research note and the outreach deal.${waterfall ? ' The email waterfall looks for a work email where the research database has none.' : ''}` : 'Creates a company record for each.'}</span>
    </span>
  );
}

const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** One line on a lead's targeting verdict: what matched, what did not, what is not known yet. */
export function matchTextOf(m: IcpMatch): string {
  if (m.excluded) return `Excluded by the targeting: ${m.excluded}.`;
  const bits: string[] = [];
  if (m.hits.length) bits.push(`Matches ${listOf(m.hits)}`);
  if (m.misses.length) bits.push(`${listOf(m.misses)} ${m.misses.length === 1 ? 'differs' : 'differ'}`);
  if (m.unknown.length) bits.push(`${listOf(m.unknown)} not known yet`);
  return bits.length ? bits.join('; ') + '.' : '';
}

/** The targeting verdict on a lead: every condition met is an ICP match (hot lead); at least half is a target match (high priority). */
export function IcpPill({ m }: { m?: IcpMatch | null }) {
  if (!m || m.level === 'none') return null;
  return <span className={`pill ${m.level === 'icp' ? 'hot' : 'high'}`} title={matchTextOf(m)}>{m.level === 'icp' ? 'ICP match · hot lead' : 'target match · high priority'}</span>;
}
