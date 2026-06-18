import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { CardGallery } from './CardGallery';
import { PersonaGuide } from './PersonaGuide';
import { ChallengeDemo, LadderDemo } from './RuleDemos';

const SECTIONS: { h: string; lines: string[]; demo?: 'ladder' | 'challenge' | 'cards' | 'persona' }[] = [
  {
    h: '一句话',
    lines: [
      '盖着牌出、报出它是什么（可以撒谎），全场在场玩家选择放行或截牌拆穿。',
      '抢先把手牌出光、或靠拆穿对手攒牌；凝聚度掉光出局，牌库摸空时分高者赢。',
    ],
  },
  {
    h: '牌型一览',
    lines: [
      '数字牌：四色各 0–9。0 当该色「最大」（顶格＝10）。',
      '四力之色：阳 Aurel（金）· 月 Selvar（银）· 地 Verda（绿）· 海 Thalos（蓝）。',
      '万能牌：盖着出、指定成任一能接上的牌（指定即宣称），被翻开永远算真 —— 脱困王牌。',
      '转向 / 禁止：明牌甩出的功能牌（转向＝改方向，禁止＝跳过下家），甩完本回合仍要再出一张数字牌。',
      '计分卡：打出 0 时领取的小额计分凭证，按面值计入总分。',
    ],
    demo: 'cards',
  },
  {
    h: '轮到你出牌',
    lines: [
      '盖着打出一张牌，同时报出它是「某色某数」—— 可以如实说，也可以撒谎。',
      '接牌有两类：同色不降——更大、或与梯顶相同（Aurel 3 → Aurel 7 / Aurel 3），或同数字换个颜色（Aurel 3 → Thalos 3）。数字只升不降，唯梯顶 0 不能再出相同的 0。',
      '本梯第一个出牌的人（首家）随便盖一张，报某色 1–3 起头；没想盖的牌也可先摸 1 张再起。',
      '接不上时可先摸 1 张再出，但摸牌不让你跳过、摸完照样要接；手里全是功能牌则可亮牌兜底（弃 1 功能牌、摸 1 张）。',
    ],
    demo: 'ladder',
  },
  {
    h: '反应窗口：放行还是截牌',
    lines: [
      '出牌后进入反应窗口——全场在场玩家（出牌方除外）都可截牌，不限下家；全体放行则下家接手。',
      '截牌：当场翻开出牌方刚出的牌对质 —— 报的属实，截牌方受罚；报的是假，出牌方受罚。',
      '对质赢家收走台面整摞牌，进自己的计分区（按张数计分）。',
    ],
    demo: 'challenge',
  },
  {
    h: '走一遍（例）',
    lines: [
      '① 首家盖一张牌，报「Aurel 1」起头。',
      '② 轮到你：手里有 Aurel 5 → 盖下报「Aurel 5」（同色更大）；没有 → 盖任意一张谎称「Thalos 1」（同数字换色）也行。',
      '③ 任何在场玩家若觉得你在吹，截牌翻开你刚出的那张：真是 Thalos 1，截牌方受罚；其实是别的牌，你受罚 —— 台面整摞牌归赢家。',
      '④ 没人截牌，牌就一路叠高、赌注越来越肥；谁先出光手牌、或攒牌最多，谁赢。',
    ],
  },
  {
    h: '受罚 · 源涌轮盘',
    lines: [
      '受罚时一次性赌定若干个点、只掷一次骰，掷中其一就「被源淹没」，掉 1 点凝聚度。',
      '要赌的点数个数 = 自上次中枪以来累计的受罚次数（第 1 次赌 1 个点、第 2 次赌 2 个…，封顶 6），中枪率随之飙升 —— 严惩连环诈牌。',
      '中枪掉 1 命后轮盘清零；中枪者把首家位让给下家（保护期），不至于刚掉命又被推到最暴露处。',
    ],
  },
  {
    h: '打 0 · 终结本梯',
    lines: [
      '打出同色 0（顶格 = 10）终结当前这一梯，并领 1 张计分卡入账。',
      '牌堆不清空、继续累积；下家当首家，盖牌报 1–3 重启梯子。',
      '用法是止损：梯子高到你被迫诈牌时，主动打 0 把全场拉回低位重来。',
    ],
  },
  {
    h: '跑成 · 清空手牌',
    lines: [
      '打出最后一张牌后照样进入反应窗口，全场可截——最后一手也逃不掉审判。',
      '没人截、或被截但翻真 → 跑成：收走整摞牌堆、摸 6 张继续。打 0 跑成同样算，照领计分卡。',
      '被截且翻假 → 跑不成：照常受罚，之后补满手牌。高风险高回报。',
    ],
  },
  {
    h: '三条得分路线',
    lines: [
      '质疑流：蹲对手破绽、赌一次截牌，赢则吞下整摞牌堆。',
      '清手牌流：技术性打空手牌、扛住最后一张被截的风险，跑成则吞牌堆，再摸 6 张继续。',
      '抢 0 流：打 0 止损、稳领 1 张计分卡。',
    ],
  },
  {
    h: '读对面 · 对面打法',
    lines: ['每个对手都有性格，还会记你的诈牌史、会因牌堆变肥更想截你。看人下菜：'],
    demo: 'persona',
  },
  {
    h: '怎么得分',
    lines: [
      '总分 = 计分区张数 + 计分卡面值 − 失去的凝聚度（每点 −5）。',
      '掉光 3 条命即死亡：背 −15 分负债，且不能再行动得分。',
      '牌库摸空（主）或全员死亡（次）时结算，总分最高者获胜。',
    ],
  },
];

export function RulesButton() {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button className="rules-icon" type="button" onClick={() => setOpen(true)} title={t('规则说明')} aria-label={t('规则说明')}>
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
              <span className="rules-title">{t('源河 · 规则说明')}</span>
              <button className="flog-close" type="button" onClick={() => setOpen(false)} aria-label={t('关闭')}>
                ✕
              </button>
            </div>
            <div className="rules-body">
              {SECTIONS.map((s) => (
                <section key={s.h} className="rules-sec">
                  <h3>{t(s.h)}</h3>
                  <ul>
                    {s.lines.map((l, i) => (
                      <li key={i}>{t(l)}</li>
                    ))}
                  </ul>
                  {s.demo === 'cards' && <CardGallery />}
                  {s.demo === 'ladder' && <LadderDemo />}
                  {s.demo === 'challenge' && <ChallengeDemo />}
                  {s.demo === 'persona' && <PersonaGuide />}
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
