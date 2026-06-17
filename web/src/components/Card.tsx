import { CSSProperties } from 'react';
import { Card, Claim, Color, COLOR_META } from '../engine/types';

export function numLabel(num: number): string {
  return num === 0 ? '0' : String(num);
}

// 四力的线条标记：尽量用曲线勾勒，柔一点、贵一点。
const MARK = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function ForceMark({ color }: { color: Color }) {
  switch (color) {
    case 'aurel': // 阳 —— 日轮 + 旋转的火焰光线（带曲线）
      return (
        <svg viewBox="0 0 32 32" className="force-mark">
          <circle cx="16" cy="16" r="5.6" {...MARK} />
          <circle cx="16" cy="16" r="1.8" fill="currentColor" stroke="none" opacity="0.55" />
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i * Math.PI) / 4;
            const r1 = 7.4, r2 = 12.8, rm = (r1 + r2) / 2;
            const p = a + Math.PI / 2; // 沿切向偏移控制点 → 火焰般的弯曲
            const x1 = 16 + Math.cos(a) * r1, y1 = 16 + Math.sin(a) * r1;
            const x2 = 16 + Math.cos(a) * r2, y2 = 16 + Math.sin(a) * r2;
            const cx = 16 + Math.cos(a) * rm + Math.cos(p) * 1.7;
            const cy = 16 + Math.sin(a) * rm + Math.sin(p) * 1.7;
            return <path key={i} d={`M${x1.toFixed(1)} ${y1.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`} {...MARK} />;
          })}
        </svg>
      );
    case 'selvar': // 月 —— 残月 + 两颗小星
      return (
        <svg viewBox="0 0 32 32" className="force-mark">
          <path d="M21.6 6.2 A10.6 10.6 0 1 0 21.6 25.8 A8.4 8.4 0 1 1 21.6 6.2 Z" {...MARK} />
          <circle cx="12.2" cy="9.4" r="0.95" fill="currentColor" stroke="none" />
          <circle cx="9.6" cy="13.6" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'verda': // 地 —— 起伏的丘峦（曲线）+ 地平线
      return (
        <svg viewBox="0 0 32 32" className="force-mark">
          <path d="M3.5 22 Q9 12 14.5 22 T25.5 22" {...MARK} />
          <path d="M16 22 Q19 13 25 11 Q23 18 16 22" {...MARK} />
          <path d="M3 25.6 H29" {...MARK} opacity="0.7" />
        </svg>
      );
    case 'thalos': // 海 —— 三叠水波
      return (
        <svg viewBox="0 0 32 32" className="force-mark">
          <path d="M4 11.5 q4 -4.6 8 0 t8 0 t8 0" {...MARK} />
          <path d="M4 17.5 q4 -4.6 8 0 t8 0 t8 0" {...MARK} />
          <path d="M4 23.5 q4 -4.6 8 0 t8 0 t8 0" {...MARK} />
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
          {card.num === 0 && <span className="card-zero-note">顶 · 10</span>}
        </div>
        <div className="card-name">{m.name}</div>
      </div>
    );
  }

  if (card.kind === 'functional') {
    const isRev = card.func === 'reverse';
    const fstroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    return (
      <div className={`${cls} card-func`} onClick={onClick}>
        <svg viewBox="0 0 32 32" className="force-mark force-mark-ink">
          {isRev ? (
            // 转向 —— 两道相对的弧形箭头（回转）
            <g {...fstroke}>
              <path d="M10 11.5 A7.6 7.6 0 0 1 23 13.6" />
              <path d="M23 13.6 l-3.6 -0.5 M23 13.6 l-0.5 -3.6" />
              <path d="M22 20.5 A7.6 7.6 0 0 1 9 18.4" />
              <path d="M9 18.4 l3.6 0.5 M9 18.4 l0.5 3.6" />
            </g>
          ) : (
            // 禁止 —— 弧形双折跳过 + 竖栏（跳过下家）
            <g {...fstroke}>
              <path d="M9.5 10.5 Q16.5 16 9.5 21.5" />
              <path d="M15.5 10.5 Q22.5 16 15.5 21.5" />
              <line x1="23.6" y1="10" x2="23.6" y2="22" />
            </g>
          )}
        </svg>
        <span className="card-func-label">{isRev ? '转向' : '禁止'}</span>
        <div className="card-name">{isRev ? 'reverse' : 'skip'}</div>
      </div>
    );
  }

  // wild —— 四色环 + Lumera 字标（不再写「源」）
  return (
    <div className={`${cls} card-wild`} onClick={onClick}>
      <svg viewBox="0 0 32 32" className="force-mark wild-ring">
        <circle cx="16" cy="16" r="8.6" fill="none" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="16" cy="7.4" r="2" fill={COLOR_META.aurel.hex} stroke="none" />
        <circle cx="24.6" cy="16" r="2" fill={COLOR_META.thalos.hex} stroke="none" />
        <circle cx="16" cy="24.6" r="2" fill={COLOR_META.selvar.hex} stroke="none" />
        <circle cx="7.4" cy="16" r="2" fill={COLOR_META.verda.hex} stroke="none" />
      </svg>
      <span className="card-wild-glyph">Lumera</span>
      <div className="card-name">万能</div>
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
        <circle cx="30" cy="27" r="2" fill="#E0A92E" />
        <circle cx="45" cy="42" r="2" fill="#2E8AD0" />
        <circle cx="30" cy="57" r="2" fill="#8FA0B8" />
        <circle cx="15" cy="42" r="2" fill="#54AC4F" />
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
