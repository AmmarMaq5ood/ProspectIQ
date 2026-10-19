import { Chips } from './Chips';
import { Checks, Group, Range } from './ui';
import { Icon } from './Icon';
import type { Options, Profile, Targeting } from '../types';

/**
 * The ideal customer profile, as a form. Used by the client's Targeting tab
 * and by the admin's copy of it on the client page. Two panels: who the
 * person is, and what the company is; the long department list and the
 * exclusions fold away until wanted. Seniority, department and company size
 * use the same option lists as the filter tabs.
 */
export function TargetingForm({ value, onChange, options, profile }: { value: Targeting; onChange: (t: Targeting) => void; options: Options; profile?: Profile }) {
  const t = value;
  const set = (patch: Partial<Targeting>) => onChange({ ...t, ...patch });
  const setEx = (patch: Partial<Targeting['exclude']>) => onChange({ ...t, exclude: { ...t.exclude, ...patch } });
  const who = [t.titles.length, t.seniorities.length, t.departments.length].filter(Boolean).length;
  const what = [t.industries.length, t.locations.length, t.employee_ranges.length, t.revenue_min || t.revenue_max ? 1 : 0].filter(Boolean).length;
  const nConf = who + what;
  const nEx = t.exclude.titles.length + t.exclude.industries.length + t.exclude.locations.length + t.exclude.companies.length;
  const depLabel = (code: string) => { for (const g of Object.values(options.departments)) if (g[code]) return g[code]; return code; };
  return (
    <div className="tgt">
      <div className="tgt-sum">
        <span className={`pill ${nConf ? 'high' : ''}`}><Icon name="filter" />{nConf ? `${nConf} condition${nConf === 1 ? '' : 's'} set` : 'Nothing set yet'}</span>
        <span className="pill hot">ICP match: every condition met</span>
        <span className="pill high">Target match: at least half</span>
        <span className="hint">Conditions that cannot be checked yet, such as company size before a lead is revealed, never count against a lead.</span>
      </div>

      <div className="tgt-cols">
        <section className="tgt-sec" aria-label="The person">
          <h3><span className="ic"><Icon name="people" /></span>The person <span className="cnt">{who}</span></h3>
          <Chips id="tg-titles" label="Job titles or title words" values={t.titles} onChange={(v) => set({ titles: v })} placeholder="purchasing manager, sourcing, plant manager" hint="Short words catch more: “purchasing” also matches “Purchasing Manager” and “VP Purchasing”." suggestions={profile?.default_titles} />
          <div className="tgt-f"><span className="f">Seniority</span><Checks options={options.seniority} selected={t.seniorities} onChange={(v) => set({ seniorities: v })} /></div>
          <Group label="Department" count={t.departments.length}>
            {t.departments.length > 0 && <div className="tgt-picked">{t.departments.map((d) => <span key={d} className="pill high">{depLabel(d)}</span>)}</div>}
            {Object.entries(options.departments).map(([g, opts]) => <div key={g} className="tgt-f"><span className="f">{g}</span><Checks options={opts} selected={t.departments} onChange={(v) => set({ departments: v })} /></div>)}
          </Group>
        </section>

        <section className="tgt-sec" aria-label="The company">
          <h3><span className="ic"><Icon name="building" /></span>The company <span className="cnt">{what}</span></h3>
          <Chips id="tg-ind" label="Industries" values={t.industries} onChange={(v) => set({ industries: v })} placeholder="industrial machinery, valves, water treatment" hint="Checked against the company's industry, keywords and description." suggestions={profile?.industries} />
          <Chips id="tg-loc" label="Locations" values={t.locations} onChange={(v) => set({ locations: v })} placeholder="Texas, Ohio, United States" hint="A state, country or city. The person's location or the company's headquarters can match." />
          <div className="tgt-f"><span className="f">Company size (employees)</span><Checks options={options.employee_ranges} selected={t.employee_ranges} onChange={(v) => set({ employee_ranges: v })} /></div>
          <div className="tgt-f"><Range label="Company revenue (USD)" min={t.revenue_min ? String(t.revenue_min) : ''} max={t.revenue_max ? String(t.revenue_max) : ''} phMin="10000000" phMax="500000000" onMin={(v) => set({ revenue_min: Number(v.replace(/[^0-9]/g, '')) || 0 })} onMax={(v) => set({ revenue_max: Number(v.replace(/[^0-9]/g, '')) || 0 })} /></div>
        </section>
      </div>

      <section className="tgt-sec" aria-label="Exclusions and finders">
        <Group label="Exclude" count={nEx}>
          <div className="form-grid">
            <Chips id="tg-ex-t" label="Titles to skip" values={t.exclude.titles} onChange={(v) => setEx({ titles: v })} placeholder="intern, assistant, recruiter" />
            <Chips id="tg-ex-i" label="Industries to skip" values={t.exclude.industries} onChange={(v) => setEx({ industries: v })} placeholder="staffing, consulting" />
            <Chips id="tg-ex-l" label="Locations to skip" values={t.exclude.locations} onChange={(v) => setEx({ locations: v })} placeholder="Houston" />
            <Chips id="tg-ex-c" label="Companies to skip" values={t.exclude.companies} onChange={(v) => setEx({ companies: v })} placeholder="competitors, existing customers" />
          </div>
        </Group>
        <label className="tgt-toggle"><input type="checkbox" checked={!!t.finders_icp_only} onChange={(e) => set({ finders_icp_only: e.target.checked })} /><span><b>New daily finders push only ICP matches</b><small>Each finder can still be changed on the Daily finders tab.</small></span></label>
      </section>
    </div>
  );
}
