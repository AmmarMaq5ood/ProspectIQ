/** Guess the Launchpad role from a job title, against the client's own role list. The server re-checks on push. */

const SYN: Record<string, RegExp> = {
  executive: /\b(ceo|coo|cfo|cto|cio|president|owner|founder|co-founder|partner|chief|managing director|general manager|vp|vice president|director|principal)\b/,
  purchasing: /purchas|procure|buyer|sourcing|commodit|category|supplier/,
  'supply chain': /supply|logistic|material|warehouse|distribution|planning/,
  operations: /operation|plant|production|manufactur|facilit|maintenance|quality|site|project/,
  engineering: /engineer|design|r&d|technical|product/,
  marketing: /market|brand|communicat|content|growth/,
  sales: /sales|business development|account|revenue/,
  design: /design|architect|creative|interior|landscape/,
  finance: /financ|account|controller|treasur/,
  'human resources': /human resource|people|talent|recruit|hr\b/,
  it: /\bit\b|information|technology|software|systems|data/,
};

export function roleFromTitle(title: string, roles: string[]): string {
  const t = (title || '').toLowerCase();
  const ordered = [...roles].sort((a, b) => (a.toLowerCase() === 'executive' ? -1 : b.toLowerCase() === 'executive' ? 1 : 0));
  for (const r of ordered) {
    const key = r.toLowerCase();
    if (key === 'other') continue;
    const re = SYN[key] || new RegExp(key.replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean).join('|') || '$^');
    if (re.test(t)) return r;
  }
  return roles.find((r) => r.toLowerCase() === 'other') || roles[roles.length - 1] || 'Other';
}
