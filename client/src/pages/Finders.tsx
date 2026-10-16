import { Link } from 'react-router-dom';
import { FindersList } from '../components/FindersList';
import { CardHead, Help } from '../components/ui';

export default function Finders() {
  return (
    <>
      <section className="card">
        <CardHead icon="calendar" title="Daily Leads Finders" sub={'Each one runs a saved search on its schedule, skips anyone already in Launchpad and adds the new leads with a note on why they fit. "Run now" pulls a batch immediately.'} />
        <FindersList />
      </section>
      <Help title="How finders work" more="client-guide#daily-finders">
        <p>To add one, run a search on the <Link to="/">Scout</Link> tab, then open "Make this a daily finder" under the results.</p>
        <p>People finders spend up to the chosen number of lookup credits per run; company finders spend none. A Launchpad workflow on the tag <code>leads-finder-new</code> sends the "found N new leads" message by SMS, WhatsApp or email.</p>
      </Help>
    </>
  );
}
