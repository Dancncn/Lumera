import { CSSProperties } from 'react';
import { Card, Claim, Color, COLOR_META } from '../engine/types';

export function numLabel(num: number): string {
  return num === 0 ? '0' : String(num);
}

// 四力的极简线条标记（只用细线勾勒，无实心填充、无假打光）。
function ForceMark({ color }: { color: Color }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (color) {
    case 'aurel': // 阳 —— 日轮 + 光线
      return (
        <svg viewBox="0 0 32 32" className="force-mark">
          <circle cx="16" cy="16" r="6" {...common} />
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i * Math.PI) / 4;
            return <line key={i} x1={16 + Math.cos(a) * 9.5} y1={16 + Math.sin(a) * 9.5} x2={16 + Math.cos(a) * 13} y2={16 + Math.sin(a) * 13} {...common} />;
          })}
        </svg>
      );
    case 'selvar': // 月 —— 残月
      return (
        <svg viewBox="0 0 32 32" className="force-mark">
          <path d="M21 6 a11 11 0 1 0 0 20 A8.5 8.5 0 1 1 21 6 Z" {...common} />
        </svg>
      );
    case 'verda': // 地 —— 山峦
      return (
        <svg viewBox="0 0 32 32" className="force-mark">
          <path d="M4 24 L12 11 L17 18 L22 8 L28 24" {...common} />
          <line x1="3" y1="26.5" x2="29" y2="26.5" {...common} />
        </svg>
      );
    case 'thalos': // 海 —— 水波
      return (
        <svg viewBox="0 0 32 32" className="force-mark">
          <path d="M4 12 q4 -4 8 0 t8 0 t8 0" {...common} />
          <path d="M4 18 q4 -4 8 0 t8 0 t8 0" {...common} />
          <path d="M4 24 q4 -4 8 0 t8 0 t8 0" {...common} />
        </svg>
      );
  }
}

/** 一张明牌的牌面。 */
export function CardFace({
  card,
  selected,
  dimmed,
  onClick,
  small,
}: {
  card: Card;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  small?: boolean;
}) {
  const cls = ['card', small ? 'card-sm' : '', selected ? 'card-sel' : '', dimmed ? 'card-dim' : '', onClick ? 'card-click' : ''].join(' ');

  if (card.kind === 'number') {
    const m = COLOR_META[card.color];
    const style = { '--bg': m.bg, '--ink': m.ink } as CSSProperties;
    return (
      <div className={`${cls} card-number`} style={style} onClick={onClick}>
        <ForceMark color={card.color} />
        <div className="card-center">
          <span className="card-num">{numLabel(card.num)}</span>
          {card.num === 0 && <span className="card-zero-note">源顶 · 10</span>}
        </div>
        <div className="card-name">{m.name}</div>
      </div>
    );
  }

  if (card.kind === 'functional') {
    const isRev = card.func === 'reverse';
    return (
      <div className={`${cls} card-func`} onClick={onClick}>
        <svg viewBox="0 0 32 32" className="force-mark force-mark-ink">
          {isRev ? (
            <path d="M9 13 a7 7 0 1 1 -1 6 M9 13 H5 M9 13 V9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="16" cy="16" r="9" />
              <line x1="9.6" y1="9.6" x2="22.4" y2="22.4" />
            </g>
          )}
        </svg>
        <span className="card-func-label">{isRev ? '转向' : '禁止'}</span>
        <div className="card-name">{isRev ? 'reverse' : 'skip'}</div>
      </div>
    );
  }

  // wild —— 含着四色的源（细线圆环 + 四节点，呼应标志）
  return (
    <div className={`${cls} card-wild`} onClick={onClick}>
      <svg viewBox="0 0 32 32" className="force-mark wild-ring">
        <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="16" cy="7" r="2" fill={COLOR_META.aurel.hex} stroke="none" />
        <circle cx="25" cy="16" r="2" fill={COLOR_META.thalos.hex} stroke="none" />
        <circle cx="16" cy="25" r="2" fill={COLOR_META.selvar.hex} stroke="none" />
        <circle cx="7" cy="16" r="2" fill={COLOR_META.verda.hex} stroke="none" />
      </svg>
      <span className="card-wild-glyph">源</span>
      <div className="card-name">Lumera</div>
    </div>
  );
}

/** 盖着的牌（背面）—— Lumera 圆环母题。 */
export function CardBack({ small }: { small?: boolean }) {
  return (
    <div className={`card card-back ${small ? 'card-sm' : ''}`}>
      <svg viewBox="0 0 60 84" className="card-back-svg" aria-hidden>
        <circle cx="30" cy="42" r="15" fill="none" stroke="#C2A158" strokeWidth="0.8" />
        <circle cx="30" cy="42" r="10" fill="none" stroke="#C2A158" strokeWidth="0.4" strokeOpacity="0.5" />
        <circle cx="30" cy="42" r="2" fill="#C2A158" />
        <circle cx="30" cy="27" r="2" fill="#C79A3A" />
        <circle cx="45" cy="42" r="2" fill="#4C77A8" />
        <circle cx="30" cy="57" r="2" fill="#7C8595" />
        <circle cx="15" cy="42" r="2" fill="#5F8C5A" />
      </svg>
    </div>
  );
}

/** 一条宣称的小标签（色 + 数）。 */
export function ClaimChip({
  claim,
  truthful,
  selected,
  onClick,
  hotkey,
}: {
  claim: Claim;
  truthful?: boolean;
  selected?: boolean;
  onClick?: () => void;
  hotkey?: number;
}) {
  const m = COLOR_META[claim.color];
  return (
    <button
      className={`claim-chip ${selected ? 'claim-sel' : ''} ${onClick ? '' : 'claim-static'}`}
      style={{ '--c': m.hex } as CSSProperties}
      onClick={onClick}
      type="button"
    >
      {hotkey !== undefined && <span className="hot">{hotkey}</span>}
      <span className="claim-dot" />
      <span className="claim-name">{m.name}</span>
      <span className="claim-num">
        {numLabel(claim.num)}
        {claim.num === 0 && <span className="claim-top">顶</span>}
      </span>
      {truthful && <span className="claim-true">真</span>}
    </button>
  );
}
