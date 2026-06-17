import { useEffect, useState } from 'react';
import { COLOR_META, PublicPlayer, PlayerView } from '../engine/types';
import { useT } from '../i18n';
import { PLAYER_COLORS, playerColor } from '../playerColors';
import { useGame } from '../store/gameStore';

type ArrowKind = 'challenge' | 'skip' | 'draw' | 'play';

interface ArrowData {
  id: number;
  kind: ArrowKind;
  seat: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  label: string;
}

interface ReverseData {
  id: number;
  seat: number;
  x: number;
  y: number;
  dir: 1 | -1;
}

function elCenter(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function nextAlive(players: PublicPlayer[], from: number, dir: 1 | -1): number {
  const n = players.length;
  let i = from;
  for (let k = 0; k < n; k++) {
    i = (i + dir + n) % n;
    if (!players[i].out) return i;
  }
  return from;
}

export function ActionArrows({ view }: { view: PlayerView }) {
  const { t } = useT();
  const events = useGame((s) => s.lastEvents);
  const [arrows, setArrows] = useState<ArrowData[]>([]);
  const [rev, setRev] = useState<ReverseData | null>(null);

  useEffect(() => {
    const arr: ArrowData[] = [];
    let r: ReverseData | null = null;
    let id = 0;

    for (const e of events) {
      if (e.type === 'Challenged') {
        const f = document.querySelector(`[data-seat="${e.challenger}"]`);
        const to = document.querySelector(`[data-seat="${e.against}"]`);
        if (f && to)
          arr.push({ id: ++id, kind: 'challenge', seat: e.challenger, from: elCenter(f), to: elCenter(to), label: t('截牌！') });
      }
      if (e.type === 'FunctionalPlayed') {
        if (e.func === 'skip') {
          const f = document.querySelector(`[data-seat="${e.seat}"]`);
          const target = nextAlive(view.players, e.seat, view.direction);
          const to = document.querySelector(`[data-seat="${target}"]`);
          if (f && to)
            arr.push({ id: ++id, kind: 'skip', seat: e.seat, from: elCenter(f), to: elCenter(to), label: t('禁止') });
        }
        if (e.func === 'reverse') {
          const pile = document.querySelector('[data-pile]');
          if (pile) {
            const c = elCenter(pile);
            r = { id: ++id, seat: e.seat, x: c.x, y: c.y, dir: view.direction };
          }
        }
      }
      if (e.type === 'CardPlayed') {
        const f = document.querySelector(`[data-seat="${e.seat}"]`);
        const to = document.querySelector('[data-pile]');
        if (f && to) {
          const meta = COLOR_META[e.claim.color];
          const num = e.claim.num === 0 ? `0·${t('顶')}` : String(e.claim.num);
          arr.push({ id: ++id, kind: 'play', seat: e.seat, from: elCenter(f), to: elCenter(to), label: `${meta.name} ${num}` });
        }
      }
      if (e.type === 'CardDrawn') {
        const f = document.querySelector('.deck-stack');
        const to = document.querySelector(`[data-seat="${e.seat}"]`);
        if (f && to)
          arr.push({ id: ++id, kind: 'draw', seat: e.seat, from: elCenter(f), to: elCenter(to), label: `+${e.count}` });
      }
    }

    if (!arr.length && !r) {
      setArrows([]);
      setRev(null);
      return;
    }
    setArrows(arr);
    setRev(r);
    const timer = setTimeout(() => {
      setArrows([]);
      setRev(null);
    }, 1400);
    return () => clearTimeout(timer);
  }, [events]);

  if (!arrows.length && !rev) return null;

  return (
    <div className="action-arrows">
      {arrows.length > 0 && (
        <svg className="aa-svg" width="100%" height="100%">
          <defs>
            {PLAYER_COLORS.map((clr, i) => (
              <marker key={i} id={`ah-s${i}`} viewBox="0 0 12 8" refX="11" refY="4" markerWidth="10" markerHeight="7" orient="auto">
                <path d="M 0 0.5 L 11 4 L 0 7.5 Z" fill={clr} />
              </marker>
            ))}
          </defs>
          {arrows.map((a) => {
            const dx = a.to.x - a.from.x;
            const dy = a.to.y - a.from.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 30) return null;
            const ux = dx / dist;
            const uy = dy / dist;
            const inset = 24;
            const sx = a.from.x + ux * inset;
            const sy = a.from.y + uy * inset;
            const ex = a.to.x - ux * inset;
            const ey = a.to.y - uy * inset;
            const mx = (sx + ex) / 2;
            const my = (sy + ey) / 2;
            const off = Math.min(dist * 0.13, 35);
            const cx = mx - uy * off;
            const cy = my + ux * off;
            const d = `M ${sx},${sy} Q ${cx},${cy} ${ex},${ey}`;
            const clr = playerColor(a.seat);
            const lx = 0.25 * sx + 0.5 * cx + 0.25 * ex;
            const ly = 0.25 * sy + 0.5 * cy + 0.25 * ey;

            return (
              <g key={a.id} className={`aa-group aa-${a.kind}`}>
                <path d={d} className="aa-glow" stroke={clr} />
                <path d={d} className="aa-line" stroke={clr} markerEnd={`url(#ah-s${a.seat})`} />
                <text x={lx} y={ly - 10} className="aa-label" fill={clr} textAnchor="middle">
                  {a.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {rev && (
        <div key={rev.id} className="aa-reverse" style={{ left: rev.x, top: rev.y }}>
          <span className="aa-rev-icon" style={{ color: playerColor(rev.seat) }}>{rev.dir === 1 ? '↻' : '↺'}</span>
          <span className="aa-rev-text" style={{ color: playerColor(rev.seat) }}>{t('转向')}</span>
        </div>
      )}
    </div>
  );
}
