import { Icon } from '../components/Icon';

/** Shown when the universal menu link is opened in a sub-account the agency has not set up yet. */
export default function NotSetUp() {
  return (
    <div className="notsetup page">
      <span className="ask-kicker dark"><Icon name="spark" />ProspectIQ</span>
      <h2>Not switched on for this account yet</h2>
      <p className="sub">ProspectIQ finds the buyers and companies you ask for in plain words and adds them to Launchpad. Your Launchpad team can switch it on for this account in a few minutes.</p>
      <p className="hint">If you were expecting it to be ready, tell them the account name and that the ProspectIQ menu link showed this page.</p>
    </div>
  );
}
