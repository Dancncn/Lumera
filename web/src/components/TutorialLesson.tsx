import { ReactNode, useState } from 'react';
import { useT } from '../i18n';
import { CardGallery } from './CardGallery';
import { ChallengeDemo, LadderDemo } from './RuleDemos';
import { PersonaGuide } from './PersonaGuide';

interface Page {
  tag: string;
  title: string;
  lines: string[];
  demo?: ReactNode;
}

// 开打前的一遍过教学：内容取自规则定稿，逐页讲清核心，最后一页进入实战练习。
const PAGES: Page[] = [
  {
    tag: '一句话',
    title: '盖牌出、报牌名、可以撒谎',
    lines: [
      '2–4 人对战：盖着出一张牌，口头宣称它是「某色某数」——可以如实，也可以骗。',
      '出牌后，全场在场玩家都可选择「放行」或「截牌」拆穿你。翻牌验真假，输的一方掷骰受罚。',
      '乐趣在撒谎、读人、把压力甩给下一个人。下面 10 页带你把规则走一遍。',
    ],
  },
  {
    tag: '认牌',
    title: '四色 + 数字，0 最大',
    lines: [
      '四种颜色＝四力：阳 Aurel（金）· 月 Selvar（银）· 地 Verda（绿）· 海 Thalos（蓝）。',
      '每色数字 0–9：1–9 各 2 张、0 仅 1 张。0＝该色「顶格」最大（相当于 10）。四色共 76 张数字牌。',
      '另有万能牌（数量 = 玩家人数），以及转向 / 禁止各 8 张功能牌（2 人局不含功能牌）。',
    ],
    demo: <CardGallery />,
  },
  {
    tag: '出牌',
    title: '数字梯子：只升不降',
    lines: [
      '接牌有两类：① 同色不降——更大、或与梯顶相同（Aurel 3 → Aurel 7 / Aurel 3）；② 同数字换色（Aurel 3 → Thalos 3）。',
      '数字只升不降，梯子一路往上叠，压力只增不减（唯梯顶 0 不能再出相同的 0）。',
      '本梯第一个出牌的人（首家）随便盖一张、报某色 1–3 起头（1–3 也能撒谎；没想盖的牌也可先摸 1 张再起）。',
    ],
    demo: <LadderDemo />,
  },
  {
    tag: '接不上',
    title: '摸牌补给，但躲不掉',
    lines: [
      '接不上当前牌堆顶时，可以先摸 1 张再出——但摸牌不让你跳过，摸完照样得接；接不上就只能诈牌。',
      '摸牌只是补给，不能用来逃避压力。',
      '万一手里全是功能牌（没有数字牌），可以「兜底」：亮明手牌自证、弃 1 张功能牌、摸 1 张，本回合结束。',
    ],
  },
  {
    tag: '裁断',
    title: '放行，还是截牌？',
    lines: [
      '出牌后进入反应窗口：全场任何在场玩家都能裁断——信他就「放行」，疑他就「截牌」，不限下家。',
      '截牌即摊牌：翻开出牌方刚打的那张，逐项比对。属实 → 截牌方受罚；是假 → 出牌方受罚。',
      '对质赢家收走台面整摞牌堆，按张数计入计分区。牌堆随之清空，进入新一梯。',
    ],
    demo: <ChallengeDemo />,
  },
  {
    tag: '万能牌',
    title: '指定＝宣称，永远判真',
    lines: [
      '盖着出，心里把它指定成一张「能合法接上当前牌堆」的牌，并照此宣称（指定＝宣称，强制一致）。',
      '被截牌摊牌时，万能牌按你指定的牌验证，所以永远判真——一张能变成任何合法牌的真牌。',
      '是被逼到墙角时的脱困王牌；但打出即暴露，用掉就没了。',
    ],
  },
  {
    tag: '打 0',
    title: '终结高压梯、领计分卡',
    lines: [
      '打出 0（顶格）会终结当前这一梯，并让你领 1 张计分卡入账。',
      '牌堆不清空、继续累积；下家当首家，盖牌报 1–3 重启梯子。',
      '用法是止损：梯子高到你被迫诈牌、快中枪时，主动打 0 把全场拉回低位重来。',
    ],
  },
  {
    tag: '受罚',
    title: '源涌轮盘：越赖越险',
    lines: [
      '受罚时一次性赌定若干个点、只掷一次骰，掷中其一就「中枪」：掉 1 点凝聚度（−5 分），轮盘随后重置。',
      '关键：要赌的点数个数＝你自上次中枪以来累计的受罚次数。第 1 次赌 1 个点、第 2 次赌 2 个……封顶 6（必中枪），连环受罚命中率飙升。',
      '中枪者把本该轮到的首家位让给下家（保护期），避免刚掉命又被推到最暴露的位置。',
    ],
  },
  {
    tag: '跑成',
    title: '打空手牌，独吞牌堆',
    lines: [
      '打出最后一张牌后，照样进入反应窗口——全场可截，最后一手也逃不掉审判。',
      '没人截、或被截但翻真 → 跑成了！收走整摞牌堆、摸 6 张重新上路。打 0 跑成也算，照领计分卡。',
      '被截且翻假 → 跑不成：照常受罚，之后补 2 张手牌继续（只补 2 张、不补满）。最后一手的极限博弈，高风险高回报。',
    ],
  },
  {
    tag: '怎么赢',
    title: '三条得分路线',
    lines: [
      '质疑流：蹲对手破绽、赌一次截牌，赢则吞下整摞牌堆。',
      '清手牌流：技术性打空手牌、扛住最后一张被截的风险，跑成则吞牌堆，再摸 6 张继续。',
      '抢 0 流：打 0 止损、稳领计分卡。总分＝计分区张数＋计分卡面值 − 失去的凝聚度（每命 −5，死亡 −15）。牌库摸空时分高者胜。',
    ],
  },
  {
    tag: '读对面',
    title: '对面打法：看人下菜',
    lines: [
      '每个对手都有性格，还会记你的诈牌史、会因牌堆变肥而更想截你。摸清脾气，才知道何时该诈、何时该截。',
    ],
    demo: <PersonaGuide />,
  },
];

export function TutorialLesson({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const { t } = useT();
  const [i, setI] = useState(0);
  const page = PAGES[i];
  const last = i === PAGES.length - 1;
  return (
    <div className="overlay lesson-overlay">
      <div className="lesson" onClick={(e) => e.stopPropagation()}>
        <div className="lesson-head">
          <span className="lesson-kicker">
            {t('新手教学')} · {i + 1}/{PAGES.length}
          </span>
          <button className="flog-close" type="button" onClick={onSkip} aria-label={t('跳过教学')}>
            ✕
          </button>
        </div>

        <div className="lesson-body" key={i}>
          <span className="lesson-tag">{t(page.tag)}</span>
          <h3 className="lesson-title">{t(page.title)}</h3>
          <ul className="lesson-lines">
            {page.lines.map((l, k) => (
              <li key={k}>{t(l)}</li>
            ))}
          </ul>
          {page.demo && <div className="lesson-demo">{page.demo}</div>}
        </div>

        <div className="lesson-dots">
          {PAGES.map((_, k) => (
            <button
              key={k}
              type="button"
              className={`lesson-dot${k === i ? ' on' : ''}`}
              onClick={() => setI(k)}
              aria-label={`第 ${k + 1} 页`}
            />
          ))}
        </div>

        <div className="lesson-nav">
          <button className="lesson-skip" type="button" onClick={onSkip}>
            {t('跳过教学')}
          </button>
          <div className="lesson-nav-right">
            {i > 0 && (
              <button className="lesson-prev" type="button" onClick={() => setI(i - 1)}>
                {t('上一步')}
              </button>
            )}
            {last ? (
              <button className="lesson-go" type="button" onClick={onStart}>
                {t('开始练习 →')}
              </button>
            ) : (
              <button className="lesson-next" type="button" onClick={() => setI(i + 1)}>
                {t('下一步')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
