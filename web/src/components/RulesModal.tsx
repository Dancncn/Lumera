import { useEffect, useState } from 'react';
import { CardGallery } from './CardGallery';
import { ChallengeDemo, LadderDemo } from './RuleDemos';

const SECTIONS: { h: string; lines: string[]; demo?: 'ladder' | 'challenge' | 'cards' }[] = [
  {
    h: '一句话',
    lines: [
      '盖着牌出、报出它是什么（可以撒谎），下家选择相信或拆穿。',
      '抢先把手牌出光、或靠拆穿对手攒牌；凝聚度掉光出局，牌库摸空时分高者赢。',
    ],
  },
  {
    h: '牌型一览',
    lines: [
      '数字牌：四色各 0–9。0 当该色「最大」（顶格＝10）。',
      '四力之色：阳 Aurel（金）· 月 Selvar（银）· 地 Verda（绿）· 海 Thalos（蓝）。',
      '万能牌：盖着出、指定成任一能接上的牌，被翻开永远算真 —— 脱困王牌。',
      '转向 / 禁止：明牌甩出的功能牌（转向＝改方向，禁止＝跳过下家），甩完本回合仍要再出一张数字牌。',
      '计分卡：打出 0 时领取的小额计分凭证，按面值计入总分。',
    ],
    demo: 'cards',
  },
  {
    h: '轮到你出牌',
    lines: [
      '盖着打出一张牌，同时报出它是「某色某数」—— 可以如实说，也可以撒谎。',
      '接牌只有两条路：同色但更大（Aurel 3 → Aurel 7），或同数字换个颜色（Aurel 3 → Thalos 3）。数字只升不降。',
      '本梯第一个出牌的人（首家）随便盖一张，报某色 1–3 起头。',
    ],
    demo: 'ladder',
  },
  {
    h: '下家的选择：放行还是截牌',
    lines: [
      '放行：相信他，轮到自己出牌；台面的牌越叠越多。',
      '截牌：不信，当场翻开他刚出的牌对质 —— 报的属实，截牌方受罚；报的是假，出牌方受罚。',
      '对质赢家收走台面整摞牌，进自己的计分区（按张数计分）。',
    ],
    demo: 'challenge',
  },
  {
    h: '走一遍（例）',
    lines: [
      '① 首家盖一张牌，报「Aurel 1」起头。',
      '② 轮到你：手里有 Aurel 5 → 盖下报「Aurel 5」（同色更大）；没有 → 盖任意一张谎称「Thalos 1」（同数字换色）也行。',
      '③ 下家若觉得你在吹，截牌翻开你刚出的那张：真是 Thalos 1，他受罚；其实是别的牌，你受罚 —— 台面整摞牌归赢家。',
      '④ 没人截牌，牌就一路叠高、赌注越来越肥；谁先出光手牌、或攒牌最多，谁赢。',
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
                  {s.demo === 'cards' && <CardGallery />}
                  {s.demo === 'ladder' && <LadderDemo />}
                  {s.demo === 'challenge' && <ChallengeDemo />}
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
