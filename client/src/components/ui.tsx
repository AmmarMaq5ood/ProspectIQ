import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { nf, peopleAtHref } from '../api';
import type { CompaniesPushed, PeoplePushed, SearchResult } from '../types';
import { Icon } from './Icon';

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
                <div className="m">{c.role}{c.new ? ' · created' : ' · updated'}{c.email ? ` · ${c.email}` : ' · no work email on file'}</div>
              </li>
            )),
          ];
        })}
      </ul>
      {data.errors.length > 0 && data.errors.map((e, i) => <p key={i}>{e}</p>)}
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
