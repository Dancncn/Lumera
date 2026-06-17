import { CSSProperties, useEffect, useState } from 'react';
import { Claim, Color, COLORS, COLOR_META } from '../engine/types';

const numTxt = (n: number): string => (n === 0 ? '0·顶' : String(n));

// 宣称选择器（PC / 移动统一）：先一个「如实出牌」大键（出真牌一步到位、不用想），
// 再按「先选颜色 → 再选数字」两级诈称，颜色一律用金/银/绿/蓝。
export function ClaimPicker({
  claims,
  honestClaim,
  wild,
  onPick,
  tutorial,
}: {
  claims: Claim[];
  honestClaim: Claim | null;
  wild: boolean;
  onPick: (c: Claim) => void;
  tutorial: boolean;
}) {
  const [pickColor, setPickColor] = useState<Color | null>(null);
  useEffect(() => {
    setPickColor(null); // 牌面/梯子变了，重置二级选择
  }, [claims]);

  const groups = COLORS.map((col) => ({ col, nums: claims.filter((c) => c.color === col).map((c) => c.num) })).filter(
    (g) => g.nums.length,
  );

  return (
    <div className={`claimpick${tutorial ? ' tut-glow' : ''}`}>
      {honestClaim &&
        (() => {
          const m = COLOR_META[honestClaim.color];
          return (
            <button
              className="claim-true-btn"
              type="button"
              style={{ '--c': m.hex } as CSSProperties}
              onClick={() => onPick(honestClaim)}
            >
              <span className="ctb-tag">如实出牌</span>
              <span className="ctb-claim">
                <span className="ctb-dot" style={{ background: m.hex }} />
                {m.say} {numTxt(honestClaim.num)}
              </span>
              <span className="ctb-hint">出真牌点这里</span>
            </button>
          );
        })()}

      {wild && <p className="claim-wild-note">万能牌 · 喊什么都判真，随意指定</p>}

      <div className="claim-bluff">
        <span className="claim-bluff-cap">{honestClaim ? '或，诈称为' : wild ? '指定为' : '只能诈称为'}</span>
        {pickColor == null ? (
          <div className="claim-colors">
            {groups.map(({ col, nums }) => {
              const m = COLOR_META[col];
              return (
                <button
                  key={col}
                  className="claim-color-btn"
                  type="button"
                  style={{ '--c': m.hex } as CSSProperties}
                  onClick={() => setPickColor(col)}
                >
                  <span className="ccb-say">
                    <span className="ccb-dot" style={{ background: m.hex }} />
                    {m.say}
                  </span>
                  <span className="ccb-nums">{nums.map(numTxt).join(' ')}</span>
                </button>
              );
            })}
          </div>
        ) : (
          (() => {
            const m = COLOR_META[pickColor];
            const nums = claims.filter((c) => c.color === pickColor);
            return (
              <div className="claim-nums">
                <div className="c2n-head">
                  <button className="c2n-back" type="button" onClick={() => setPickColor(null)}>
                    ‹ 换色
                  </button>
                  <span className="c2n-color" style={{ color: m.hex }}>
                    <span className="ccb-dot" style={{ background: m.hex }} />
                    {m.say}
                  </span>
                </div>
                <div className="c2n-grid">
                  {nums.map((c, i) => (
                    <button
                      key={i}
                      className="c2n-num"
                      type="button"
                      style={{ '--c': m.hex } as CSSProperties}
                      onClick={() => onPick(c)}
                    >
                      {numTxt(c.num)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}
