import { useState } from 'react';
import { api, errText } from '../api';
import { useApp } from '../App';
import { useBusy } from '../components/Busy';
import { Icon } from '../components/Icon';
import { TargetingForm } from '../components/TargetingForm';
import { CardHead, Errors, Help, Notice } from '../components/ui';
import type { PublicClient, Targeting } from '../types';

/** The client's ideal customer profile: what gets highlighted, tagged, and what finders may push alone. */
export default function TargetingPage() {
  const { me, options, reload } = useApp();
  const c = me.client!;
  const busy = useBusy();
  const [t, setT] = useState<Targeting>(c.targeting);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  const dirty = JSON.stringify(t) !== JSON.stringify(c.targeting);
  const save = async () => {
    setOk(''); setErr('');
    try {
      const r = await busy.run('Saving the targeting…', () => api<{ client: PublicClient }>('/targeting', { method: 'PUT', body: t }));
      setT(r.client.targeting);
      await reload();
      setOk('Saved. New searches mark the matches; finders set to ICP-only use it from their next run.');
    } catch (x) {
      setErr(errText(x));
    }
  };
  return (
    <>
      {ok && <Notice kind="ok"><p>{ok}</p></Notice>}
      <Errors errors={err ? [err] : []} />
      <section className="card">
        <CardHead icon="filter" title="Targeting" sub="Who you most want to reach. Scout still shows everything a request asks for; leads that fit this get highlighted first, land in Launchpad with the tags icp-match, hot-lead, target-match and high-priority, and daily finders can be told to push only the ICP matches." />
        <TargetingForm value={t} onChange={setT} options={options} profile={c.profile} />
        <div className="pushbar tgt-save">
          <span className="cnt"><b>{dirty ? 'Unsaved changes' : 'Saved'}</b><span className="det">{dirty ? 'Save to start matching new searches against this.' : c.targeting.updated ? `Last saved ${new Date(c.targeting.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.` : 'Nothing saved yet.'}</span></span>
          <button className="btn" type="button" onClick={save} disabled={!dirty || busy.active}><Icon name="check" />Save targeting</button>
        </div>
      </section>
      <Help title="How matching works" more="client-guide#targeting">
        <p>Each lead is checked against every condition set here. All conditions met is an <b>ICP match</b>, shown as a hot lead; at least half is a <b>target match</b>, shown as high priority. Company size, revenue and industry are known for sure once a lead is revealed during a push, so a result can move from target match to ICP match at that point.</p>
        <p>In Launchpad every pushed contact gets the ICP Match and Lead Priority fields, a short research summary written against this targeting, and the matching tags, so workflows can route hot leads differently.</p>
      </Help>
    </>
  );
}
