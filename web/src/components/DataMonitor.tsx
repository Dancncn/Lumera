import { useEffect, useState } from 'react';

interface StatsData {
  visits: number;
  games: number;
  peakOnline: number;
  online: number;
}

// 服务器无 /stats（如纯前端 dev）时的兜底种子，与后端 SEED 一致。
const SEED: StatsData = { visits: 56, games: 24, peakOnline: 8, online: 0 };

const CARDS: { key: keyof StatsData; label: string; suffix: string }[] = [
  { key: 'visits', label: '网站访问', suffix: '次' },
  { key: 'games', label: '进行对局', suffix: '局' },
  { key: 'peakOnline', label: '峰值同时在线', suffix: '人' },
  { key: 'online', label: '当前在线', suffix: '人' },
];

export function DataMonitor() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<StatsData>(SEED);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch('/stats', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d && typeof d.visits === 'number') {
          setData({ visits: d.visits, games: d.games, peakOnline: d.peakOnline, online: d.online ?? 0 });
        }
      })
      .catch(() => undefined);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button className="rules-icon" type="button" onClick={() => setOpen(true)} title="数据监控" aria-label="数据监控">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18" />
          <rect x="5" y="11" width="3.4" height="7" rx="0.6" />
          <rect x="10.3" y="6" width="3.4" height="12" rx="0.6" />
          <rect x="15.6" y="13.5" width="3.4" height="4.5" rx="0.6" />
        </svg>
      </button>

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rules-head">
              <span className="rules-title">源河 · 数据监控</span>
              <button className="flog-close" type="button" onClick={() => setOpen(false)} aria-label="关闭">
                ✕
              </button>
            </div>
            <div className="stats-grid">
              {CARDS.map((c) => (
                <div key={c.key} className="stat-card">
                  <span className="stat-num">
                    {data[c.key].toLocaleString()}
                    <i>{c.suffix}</i>
                  </span>
                  <span className="stat-cap">{c.label}</span>
                </div>
              ))}
            </div>
            <p className="stats-foot">数据实时统计 · 每次访问 / 对局自动累计</p>
          </div>
        </div>
      )}
    </>
  );
}
