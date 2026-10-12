import { Link } from 'react-router-dom';
import { FindersList } from '../components/FindersList';

export default function Finders() {
  return (
    <>
      <section className="card">
        <h2>Daily Leads Finders</h2>
        <p className="sub">Each finder runs a saved search on its own schedule, skips anyone already in Launchpad, looks the new ones up and adds them with a note saying why they fit. The Launchpad workflow on the tag <code>leads-finder-new</code> sends the "found N new leads" message.</p>
        <FindersList />
      </section>
      <p className="foot">To add one: run a search on the <Link to="/">Ask</Link> tab, then "Save as a daily finder" under the results. People finders spend up to the chosen number of lookup credits per run; company finders spend none.</p>
    </>
  );
}
