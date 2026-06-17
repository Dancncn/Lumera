import { CSSProperties, useEffect, useState } from 'react';
import { Claim, Color, COLORS, COLOR_META } from '../engine/types';
import { ClaimChip } from './Card';

// 窄屏检测（跟随旋转/缩放）
function useIsMobile(): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

const numTxt = (n: number): string => (n === 0 ? '0·顶' : String(n));

// 宣称选择器：桌面一排芯片（带快捷键）；移动端二级菜单——先选颜色（附可选数字提示），再选数字。
export function ClaimPicker({
  claims,
  truthfulFor,
  onPick,
  tutorial,
}: {
  claims: Claim[];
  truthfulFor: (c: Claim) => boolean;
  onPick: (c: Claim) => void;
  tutorial: boolean;
}) {
  const isMobile = useIsMobile();
  const [pickColor, setPickColor] = useState<Color | null>(null);

  useEffect(() => {
    setPickColor(null); // 牌面/梯子变了，重置二级选择
  }, [claims]);

  if (!isMobile) {
    return (
      <div className={`claim-row${tutorial ? ' tut-glow' : ''}`}>
        {claims.map((c, i) => (
          <ClaimChip key={i} claim={c} truthful={truthfulFor(c)} hotkey={i < 9 ? i + 1 : undefined} onClick={() => onPick(c)} />
        ))}
      </div>
    );
  }

  // 移动端一级：选颜色（每色显示可选数字）
  if (pickColor == null) {
    const groups = COLORS.map((col) => ({ col, nums: claims.filter((c) => c.color === col).map((c) => c.num) })).filter((g) => g.nums.length);
    return (
      <div className={`claim-2lv${tutorial ? ' tut-glow' : ''}`}>
        {groups.map(({ col, nums }) => {
          const meta = COLOR_META[col];
          return (
            <button
              key={col}
              className="claim-color-btn"
              type="button"
              style={{ '--c': meta.hex } as CSSProperties}
              onClick={() => setPickColor(col)}
            >
              <span className="ccb-head">
                <span className="ccb-dot" style={{ background: meta.hex }} />
                {meta.name}
              </span>
              <span className="ccb-nums">可选 {nums.map(numTxt).join('  ')}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // 移动端二级：选数字
  const meta = COLOR_META[pickColor];
  const nums = claims.filter((c) => c.color === pickColor);
  return (
    <div className="claim-2lv-nums">
      <div className="c2n-head">
        <button className="c2n-back" type="button" onClick={() => setPickColor(null)}>
          ‹ 换色
        </button>
        <span className="c2n-color" style={{ color: meta.hex }}>
          <span className="ccb-dot" style={{ background: meta.hex }} />
          {meta.name}
        </span>
      </div>
      <div className="c2n-grid">
        {nums.map((c, i) => (
          <button
            key={i}
            className={`c2n-num${truthfulFor(c) ? ' c2n-true' : ''}`}
            type="button"
            style={{ '--c': meta.hex } as CSSProperties}
            onClick={() => onPick(c)}
          >
            <span className="c2n-val">{numTxt(c.num)}</span>
            {truthfulFor(c) && <span className="c2n-truth">真</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
