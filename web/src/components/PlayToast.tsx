import { ReactNode, useEffect, useState } from 'react';
import { COLOR_META, PlayerView } from '../engine/types';
import { useGame } from '../store/gameStore';

// 注意提示：对手出牌/甩功能牌时，中上方弹一条带色横幅，停留约 1.4s，
// 给你「线下说话 + 放牌」那样的过渡时间去留意对手做了什么。
export function PlayToast({ view }: { view: PlayerView }) {
  const events = useGame((s) => s.lastEvents);
  const [toast, setToast] = useState<{ id: number; node: ReactNode } | null>(null);

  useEffect(() => {
    let hit: { node: ReactNode } | null = null;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === 'CardPlayed' && e.seat !== view.you) {
        const m = COLOR_META[e.claim.color];
        const numTxt = e.claim.num === 0 ? '0·顶' : String(e.claim.num);
        hit = {
          node: (
            <>
              <strong>{view.players[e.seat]?.name}</strong> 宣称
              <span className="toast-claim" style={{ color: m.hex }}>
                <span className="toast-dot" style={{ background: m.hex }} />
                {m.say} {numTxt}
              </span>
              {e.endsLadder && <span className="toast-mark">打 0 · 终结本梯</span>}
            </>
          ),
        };
        break;
      }
      if (e.type === 'FunctionalPlayed' && e.seat !== view.you) {
        hit = {
          node: (
            <>
              <strong>{view.players[e.seat]?.name}</strong> 明牌甩出「{e.func === 'reverse' ? '转向' : '禁止'}」
            </>
          ),
        };
        break;
      }
    }
    if (!hit) return;
    const id = view.log.length + events.length;
    setToast({ id, node: hit.node });
    const t = setTimeout(() => setToast((cur) => (cur && cur.id === id ? null : cur)), 1500);
    return () => clearTimeout(t);
  }, [events, view.you, view.players, view.log.length]);

  if (!toast) return null;
  return (
    <div className="play-toast" key={toast.id}>
      {toast.node}
    </div>
  );
}
