const S = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function WeatherIcon({ kind, size }: { kind: string; size?: number }) {
  const s = size ? { ...S, width: size, height: size } : S;
  switch (kind) {
    case 'bounty': return (
      <svg {...s}><path d="M3 15c2.5-3 5-3 7.5 0s5 3 7.5 0" /><path d="M3 10c2.5-3 5-3 7.5 0s5 3 7.5 0" /><path d="M3 20c2.5-3 5-3 7.5 0s5 3 7.5 0" /></svg>
    );
    case 'shuffle': return (
      <svg {...s}><path d="M12 3a9 9 0 0 1 6.36 2.64" /><path d="M21 3v4h-4" /><path d="M12 21a9 9 0 0 1-6.36-2.64" /><path d="M3 21v-4h4" /><circle cx="12" cy="12" r="2.5" /></svg>
    );
    case 'surge': return (
      <svg {...s}><path d="M13 2L4.5 13H12l-1 9 8.5-11H12l1-9z" /></svg>
    );
    case 'ban': return (
      <svg {...s}><circle cx="12" cy="12" r="9" /><path d="M5.7 5.7l12.6 12.6" /></svg>
    );
    case 'veer': return (
      <svg {...s}><path d="M4 7h10l4-4" /><path d="M18 3v4" /><path d="M20 17H10l-4 4" /><path d="M6 21v-4" /></svg>
    );
    case 'bless': return (
      <svg {...s}><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><path d="M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /><circle cx="12" cy="12" r="3" /></svg>
    );
    default: return null;
  }
}
