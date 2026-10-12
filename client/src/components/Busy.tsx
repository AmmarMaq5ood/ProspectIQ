import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * The "hang tight" overlay: every search, lookup and push runs through
 * `useBusy().run(message, work)` so the page is blocked until it settles.
 * The message reads "Title… detail"; the title shows big, the detail under it.
 */

const STEPS: Record<string, string[]> = {
  search: ['Reading your request…', 'Searching the research database…', 'Checking what is on file for each lead…', 'Writing the fit notes…', 'Almost there…'],
  push: ['Looking each person up…', 'Creating the company records…', 'Adding the contacts and notes…', 'Opening the outreach deals…'],
  finder: ['Searching…', 'Skipping leads already in Launchpad…', 'Looking the new ones up…', 'Writing them into Launchpad…'],
  draft: ['Reading the website…', 'Working out what they sell and to whom…', 'Drafting the angles and the templates…'],
  other: ['One moment…'],
};

interface BusyApi { run<T>(message: string, work: () => Promise<T>): Promise<T>; active: boolean }

const Ctx = createContext<BusyApi>({ run: (_m, w) => w(), active: false });

export const useBusy = () => useContext(Ctx);

export function BusyProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const run = useCallback(async <T,>(message: string, work: () => Promise<T>): Promise<T> => {
    setMsg(message);
    try {
      return await work();
    } finally {
      setMsg(null);
    }
  }, []);
  return (
    <Ctx.Provider value={{ run, active: msg !== null }}>
      {children}
      {msg !== null && <Overlay msg={msg} />}
    </Ctx.Provider>
  );
}

function Overlay({ msg }: { msg: string }) {
  const kind = /push/i.test(msg) ? 'push' : /finder/i.test(msg) ? 'finder' : /draft/i.test(msg) ? 'draft' : /search|look/i.test(msg) ? 'search' : 'other';
  const steps = STEPS[kind];
  const [i, setI] = useState(0);
  useEffect(() => {
    document.body.setAttribute('aria-busy', 'true');
    const t = setInterval(() => setI((x) => x + 1), 2400);
    return () => { clearInterval(t); document.body.removeAttribute('aria-busy'); };
  }, []);
  const [title, detail] = msg.split('…');
  return (
    <div className="busy-overlay" role="status" aria-live="polite">
      <div className="busy-card">
        <div className="busy-orb"><Icon name="spark" /></div>
        <h3>{(title || 'Working') + '…'}</h3>
        <p>{(detail || '').trim()}</p>
        <div className="busy-step">{steps[i % steps.length]}</div>
      </div>
    </div>
  );
}
