import { useEffect, useState } from 'react';
import { Card, PlayerView } from '../engine/types';
import { useT } from '../i18n';
import { playerColor } from '../playerColors';
import { useGame } from '../store/gameStore';
import { CardFace } from './Card';

// 反囤牌·摸牌亮牌：谁摸牌就把随机亮出的那张牌在屏幕中央闪现给全场看（像受罚掷骰那样）。
export function RevealSpotlight({ view }: { view: PlayerView }) {
  const events = useGame((s) => s.lastEvents);
  const { t, tn } = useT();
  const [flash, setFlash] = useState<{ id: number; seat: number; card: Card } | null>(null);

  useEffect(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === 'HandRevealed') {
        setFlash({ id: Date.now(), seat: e.seat, card: e.card });
        return;
      }
    }
  }, [events]);

  useEffect(() => {
    if (!flash) return;
    const tm = setTimeout(() => setFlash(null), 2400);
    return () => clearTimeout(tm);
  }, [flash]);

  if (!flash) return null;
  const name = view.players[flash.seat]?.name ?? '';
  const mine = flash.seat === view.you;

  return (
    <div className="reveal-spotlight" aria-hidden>
      <div className="reveal-spot-dim" />
      <div key={flash.id} className="reveal-spot-card">
        <div className="reveal-spot-cap" style={{ color: playerColor(flash.seat) }}>
          {tn(name)} · {t('摸牌 · 亮牌')}
        </div>
        <CardFace card={flash.card} />
        <div className="reveal-spot-sub">{mine ? t('你摸的牌已亮给全场') : t('对手摸牌，亮给全场')}</div>
      </div>
    </div>
  );
}
