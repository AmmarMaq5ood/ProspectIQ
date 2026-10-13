import { useEffect, useState } from 'react';
import { Icon } from './Icon';

/** Dark mode for the admin side only: remembered per browser, applied as a data attribute the admin stylesheet keys off. */

const KEY = 'piq_admin_theme';

export function useAdminTheme(): [boolean, (v: boolean) => void] {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) return saved === 'dark';
    } catch { /* storage blocked */ }
    return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  useEffect(() => {
    document.documentElement.dataset.adminTheme = dark ? 'dark' : 'light';
    try { localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch { /* storage blocked */ }
    return () => { delete document.documentElement.dataset.adminTheme; };
  }, [dark]);
  return [dark, setDark];
}

export function ThemeToggle({ dark, onChange }: { dark: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className="theme-toggle" onClick={() => onChange(!dark)} aria-pressed={dark} title="Switch between light and dark">
      <Icon name={dark ? 'sun' : 'moon'} />
      <span>{dark ? 'Light mode' : 'Dark mode'}</span>
      <span className={`switch${dark ? ' on' : ''}`} style={{ marginLeft: 'auto' }} />
    </button>
  );
}
