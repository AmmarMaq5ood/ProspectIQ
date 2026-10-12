const PATHS: Record<string, string> = {
  calendar: 'M3 4h18v17H3zM3 9h18M8 2v4M16 2v4',
  refresh: 'M20 11a8 8 0 0 0-14.5-4.6M4 13a8 8 0 0 0 14.5 4.6M20 4v7h-7M4 20v-7h7',
  chevron: 'm6 9 6 6 6-6',
  search: 'M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0zm2 9-3.5-3.5',
  external: 'M14 4h6v6M20 4l-9 9M18 13v6H5V6h6',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12 5 5L20 7',
  push: 'M12 4v12M6 10l6-6 6 6M4 20h16',
  people: 'M13 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM2 21a7 7 0 0 1 14 0M17 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-5-6.7',
  building: 'M4 3h16v18H4zM8 7h3M13 7h3M8 11h3M13 11h3M8 15h3M13 15h3M10 21v-3h4v3',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8zM4 15l.6 1.6L6.2 17l-1.6.6L4 19.2 3.4 17.6 1.8 17l1.6-.4z',
  'arrow-up': 'M12 19V5M5 12l7-7 7 7',
  'arrow-right': 'M5 12h14M12 5l7 7-7 7',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 7v5l3 2',
  key: 'M15 7a4 4 0 1 1-4.6 3.95L4 17.4V20h3v-2h2v-2h2l1.6-1.6A4 4 0 0 1 15 7z',
  copy: 'M9 9h10v12H9zM5 15V3h10',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: string }) {
  return (
    <svg className={`i i-${name}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] || ''} />
    </svg>
  );
}
