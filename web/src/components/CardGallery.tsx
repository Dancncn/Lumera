import { Card } from '../engine/types';
import { CardFace } from './Card';

// 认牌图卡：把每种牌的真实牌面摆出来，让玩家一眼记住四色、0、功能牌、万能牌。
export function CardGallery({ compact }: { compact?: boolean }) {
  const items: [Card, string][] = compact
    ? [
        [{ id: -1, kind: 'number', color: 'aurel', num: 5 }, '阳 · 金'],
        [{ id: -2, kind: 'number', color: 'selvar', num: 5 }, '月 · 银'],
        [{ id: -3, kind: 'number', color: 'verda', num: 5 }, '地 · 绿'],
        [{ id: -4, kind: 'number', color: 'thalos', num: 5 }, '海 · 蓝'],
      ]
    : [
        [{ id: -1, kind: 'number', color: 'aurel', num: 5 }, '阳 Aurel · 金'],
        [{ id: -2, kind: 'number', color: 'selvar', num: 5 }, '月 Selvar · 银'],
        [{ id: -3, kind: 'number', color: 'verda', num: 5 }, '地 Verda · 绿'],
        [{ id: -4, kind: 'number', color: 'thalos', num: 5 }, '海 Thalos · 蓝'],
        [{ id: -5, kind: 'number', color: 'aurel', num: 0 }, '0 = 顶格·最大'],
        [{ id: -6, kind: 'functional', func: 'reverse' }, '转向'],
        [{ id: -7, kind: 'functional', func: 'skip' }, '禁止'],
        [{ id: -8, kind: 'wild' }, '万能牌'],
      ];
  return (
    <div className={`card-gallery${compact ? ' cg-compact' : ''}`}>
      {items.map(([card, label], i) => (
        <div className="cg-item" key={i}>
          <CardFace small card={card} />
          <span className="cg-label">{label}</span>
        </div>
      ))}
    </div>
  );
}
