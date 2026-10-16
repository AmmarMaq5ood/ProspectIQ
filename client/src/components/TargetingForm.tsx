import { Chips } from './Chips';
import { Checks, Field, Group, Range } from './ui';
import type { Options, Profile, Targeting } from '../types';

/**
 * The ideal customer profile, as a form. Used by the client's Targeting tab
 * and by the admin's copy of it on the client page. Every list is free text
 * chips except seniority, department and company size, which use the same
 * option lists as the filter tabs.
 */
export function TargetingForm({ value, onChange, options, profile }: { value: Targeting; onChange: (t: Targeting) => void; options: Options; profile?: Profile }) {
  const t = value;
  const set = (patch: Partial<Targeting>) => onChange({ ...t, ...patch });
  const setEx = (patch: Partial<Targeting['exclude']>) => onChange({ ...t, exclude: { ...t.exclude, ...patch } });
  const nConf = [t.titles.length, t.seniorities.length, t.departments.length, t.industries.length, t.locations.length, t.employee_ranges.length, t.revenue_min || t.revenue_max ? 1 : 0].filter(Boolean).length;
  const nEx = t.exclude.titles.length + t.exclude.industries.length + t.exclude.locations.length + t.exclude.companies.length;
  return (
    <div className="tgt">
      <div className="form-grid">
        <div className="full"><Chips id="tg-titles" label="Job titles or title words" values={t.titles} onChange={(v) => set({ titles: v })} placeholder="purchasing manager, sourcing, plant manager" hint="A lead matches when its title contains one of these. Short words catch more: “purchasing” also matches “Purchasing Manager” and “VP Purchasing”." suggestions={profile?.default_titles} /></div>
        <Field label="Seniority"><Checks options={options.seniority} selected={t.seniorities} onChange={(v) => set({ seniorities: v })} /></Field>
        <Field label="Department">{Object.entries(options.departments).map(([g, opts]) => <div key={g}><span className="f" style={{ marginBottom: 4 }}>{g}</span><Checks options={opts} selected={t.departments} onChange={(v) => set({ departments: v })} /></div>)}</Field>
        <div className="full"><Chips id="tg-ind" label="Industries" values={t.industries} onChange={(v) => set({ industries: v })} placeholder="industrial machinery, valves, water treatment" hint="Checked against the company's industry, keywords and description." suggestions={profile?.industries} /></div>
        <div className="full"><Chips id="tg-loc" label="Locations" values={t.locations} onChange={(v) => set({ locations: v })} placeholder="Texas, Ohio, United States" hint="A state, country or city. The person's location or the company's headquarters can match." /></div>
        <Field label="Company size (employees)"><Checks options={options.employee_ranges} selected={t.employee_ranges} onChange={(v) => set({ employee_ranges: v })} /></Field>
        <Range label="Company revenue (USD)" min={t.revenue_min ? String(t.revenue_min) : ''} max={t.revenue_max ? String(t.revenue_max) : ''} phMin="10000000" phMax="500000000" onMin={(v) => set({ revenue_min: Number(v.replace(/[^0-9]/g, '')) || 0 })} onMax={(v) => set({ revenue_max: Number(v.replace(/[^0-9]/g, '')) || 0 })} />
      </div>
      <Group label="Exclude" count={nEx}>
        <div className="form-grid">
          <div className="full"><Chips id="tg-ex-t" label="Titles to skip" values={t.exclude.titles} onChange={(v) => setEx({ titles: v })} placeholder="intern, assistant, recruiter" /></div>
          <div className="full"><Chips id="tg-ex-i" label="Industries to skip" values={t.exclude.industries} onChange={(v) => setEx({ industries: v })} placeholder="staffing, consulting" /></div>
          <div className="full"><Chips id="tg-ex-l" label="Locations to skip" values={t.exclude.locations} onChange={(v) => setEx({ locations: v })} placeholder="Houston" /></div>
          <div className="full"><Chips id="tg-ex-c" label="Companies to skip" values={t.exclude.companies} onChange={(v) => setEx({ companies: v })} placeholder="competitors, existing customers" /></div>
        </div>
      </Group>
      <div className="checks one" style={{ marginTop: 12 }}>
        <label><input type="checkbox" checked={!!t.finders_icp_only} onChange={(e) => set({ finders_icp_only: e.target.checked })} /> New daily finders push <b>only ICP matches</b> by default (each finder can still be changed)</label>
      </div>
      <p className="hint" style={{ marginTop: 10 }}>{nConf ? `${nConf} condition${nConf === 1 ? '' : 's'} set. A lead that meets every condition we can check is an ICP match (hot lead); one that meets at least half is a target match (high priority). Conditions we cannot check yet, such as company size before a lead is revealed, never count against a lead.` : 'Nothing set yet. Searches work as before; matching starts as soon as one condition is saved.'}</p>
    </div>
  );
}
