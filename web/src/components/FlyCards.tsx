import { CSSProperties, useEffect, useState } from 'react';
import { useGame } from '../store/gameStore';
import { CardBack } from './Card';

interface Burst {
  id: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  n: number;
}

// 收牌堆动画：有人夺得整摞牌堆时，几张牌背从桌心飞向赢家的座位（→ 计分区）。
export function FlyCards() {
  const events = useGame((s) => s.lastEvents);
  const [burst, setBurst] = useState<Burst | null>(null);

  useEffect(() => {
    let taken: { seat: number; count: number } | null = null;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === 'PileTaken') {
        taken = { seat: e.seat, count: e.count };
        break;
      }
    }
    if (!taken || taken.count <= 0) return;
    const pileEl = document.querySelector('[data-pile]');
    const seatEl = document.querySelector(`[data-seat="${taken.seat}"]`);
    if (!pileEl || !seatEl) return;
    const p = pileEl.getBoundingClientRect();
    const s = seatEl.getBoundingClientRect();
    const id = events.length * 8 + taken.seat;
    setBurst({
      id,
      from: { x: p.left + p.width / 2, y: p.top + p.height / 2 },
      to: { x: s.left + s.width / 2, y: s.top + s.height / 2 },
      n: Math.min(taken.count, 6),
    });
    const tmr = setTimeout(() => setBurst((cur) => (cur && cur.id === id ? null : cur)), 740);
    return () => clearTimeout(tmr);
  }, [events]);

  if (!burst) return null;
  const dx = burst.to.x - burst.from.x;
  const dy = burst.to.y - burst.from.y;
  return (
    <div className="flycards">
      {Array.from({ length: burst.n }).map((_, i) => (
        <div
          key={i}
          className="flycard"
          style={
            {
              left: burst.from.x,
              top: burst.from.y,
              '--dx': `${dx}px`,
              '--dy': `${dy}px`,
              animationDelay: `${i * 55}ms`,
            } as CSSProperties
          }
        >
          <CardBack small />
        </div>
      ))}
    </div>
  );
}
