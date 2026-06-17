import { useEffect, useState } from 'react';

const SECTIONS: { h: string; lines: string[] }[] = [
  {
    h: '你要做什么',
    lines: [
      '抢在别人之前，第一个把手里的牌出光；或者逮住别人说谎。',
      '凝聚度（命）掉光就出局。一局打到牌库摸空结算，分最高者赢。',
    ],
  },
  {
    h: '轮到你出牌',
    lines: [
      '盖着打出一张牌，同时报出它是「某色某数」—— 可以如实说，也可以撒谎。',
      '接牌只有两条路：同色但更大（Aurel 3 → Aurel 7），或同数字换个颜色（Aurel 3 → Thalos 3）。数字只升不降。',
      '本梯第一个出牌的人（首家）随便盖一张，报某色 1–3 起头。',
    ],
  },
  {
    h: '下家的选择：放行还是截牌',
    lines: [
      '放行：相信他，轮到自己出牌；台面的牌越叠越多。',
      '截牌：不信，当场翻开他刚出的牌对质 —— 报的属实，截牌方受罚；报的是假，出牌方受罚。',
      '对质赢家收走台面整摞牌，进自己的计分区（按张数计分）。',
    ],
  },
  {
    h: '受罚 · 源涌轮盘',
    lines: [
      '选一个点数掷骰，掷中就「被源淹没」，掉 1 点凝聚度。',
      '连着受罚会越掷越多次（任一掷中即止），被淹没后清零重来 —— 越赖着诈牌越危险。',
    ],
  },
  {
    h: '几张特殊牌',
    lines: [
      '0 = 该色最大（顶格）：打出它终结本梯、领 1 张计分卡（台面不清空）。',
      '万能牌：盖着出，指定成任一能接上的牌，被截牌翻开时永远算真 —— 走投无路时的脱困王牌。',
      '转向 / 禁止：明着甩出立刻生效、不可截牌；但甩完本回合仍要正常出一张牌。',
    ],
  },
  {
    h: '怎么得分',
    lines: ['总分 = 计分区张数 + 计分卡面值 − 失去的凝聚度（每点 −5）。'],
  },
];

export function RulesButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button className="rules-icon" type="button" onClick={() => setOpen(true)} title="规则说明" aria-label="规则说明">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.2 9.2a2.8 2.8 0 1 1 3.6 2.7c-.7.3-1.3.9-1.3 1.8" />
          <circle cx="12" cy="17.2" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      </button>

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rules-head">
              <span className="rules-title">源河 · 规则说明</span>
              <button className="flog-close" type="button" onClick={() => setOpen(false)} aria-label="关闭">
                ✕
              </button>
            </div>
            <div className="rules-body">
              {SECTIONS.map((s) => (
                <section key={s.h} className="rules-sec">
                  <h3>{s.h}</h3>
                  <ul>
                    {s.lines.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
