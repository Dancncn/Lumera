import { useEffect, useState } from 'react';
import { WEATHER_META, WEATHER_KINDS } from '../engine/types';
import { useT } from '../i18n';
import { CardGallery } from './CardGallery';
import { PersonaGuide } from './PersonaGuide';
import { ChallengeDemo, LadderDemo } from './RuleDemos';
import { WeatherIcon } from './WeatherIcon';

type RulesTab = 'classic' | 'weather';

interface Section {
  h: string;
  lines: string[];
  demo?: 'ladder' | 'challenge' | 'cards' | 'persona' | 'weather';
}

const CLASSIC_SECTIONS: Section[] = [
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
      '数字牌（76 张）：四色各 0–9。1–9 每色各 2 张，0 每色仅 1 张（顶格＝10、该色最大）。',
      '四力之色：阳 Aurel（金）· 月 Selvar（银）· 地 Verda（绿）· 海 Thalos（蓝）。',
      '万能牌（= 玩家人数）：盖着出、指定成任一能接上的牌（指定即宣称），被翻开永远算真 —— 脱困王牌。',
      '转向 / 禁止（各 8 张，仅 3 人及以上）：明牌甩出的功能牌（转向＝改方向，禁止＝跳过下家），甩完本回合仍要再出一张数字牌。',
      '计分卡：打出 0 时领取的小额计分凭证，按面值计入总分（不在牌库中）。',
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
    h: '摸牌代价：反囤牌机制',
    lines: [
      '摸牌冷却：摸牌后进入冷却，手牌 ≤2 张时冷却 1 回合、>2 张时冷却 2 回合，冷却期间不能再摸。',
      '摸牌亮牌：摸牌后须选择 1 张手牌亮给全场看——摸牌有暴露底细的代价，但你可以选择亮哪张。',
      '手牌上限：手牌超过 6 张时，回合开始会随机弃 2 张回牌库。囤牌反而亏牌。',
    ],
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
      '受罚时一次性赌定若干个点——前两枪掷 1 颗骰，第三枪起掷 2 颗，任一颗掷中所选就「被源淹没」掉 1 点凝聚度，尾部死亡率骤升。',
      '要赌的点数个数 = 自上次中枪以来累计的受罚次数（第 1 次赌 1 个点、第 2 次赌 2 个…，封顶 6），中枪率随之飙升 —— 严惩连环诈牌。',
      '中枪掉 1 命后轮盘清零；中枪者把首家位让给下家（保护期），不至于刚掉命又被推到最暴露处。',
      '没中（险过）：不掉命，还补 3 张手牌——补回缩水的手牌、也推着牌库稳步见底，破「囤着牌库不耗、靠连环抓你的 1-3 把你拖死」的僵局。',
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
      '被截且翻假 → 跑不成：照常受罚，之后补 2 张手牌（只补 2 张、不补满）。高风险高回报。',
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

const WEATHER_SECTIONS: Section[] = [
  {
    h: '混沌天气是什么',
    lines: [
      '混沌天气是一个可选的休闲玩法模块。开启后，每开一条新梯时有 28% 的几率降下一种随机天气。',
      '天气分两类：一次性结算（开梯即生效、牌堆开始叠）和持续整梯（直到本梯结束持续影响每次出牌）。',
      '天气不改变核心出牌、截牌、受罚规则——所有经典规则仍然有效，天气只是额外附加的调味。',
    ],
  },
  {
    h: '触发时机',
    lines: [
      '首家宣称起头后，系统掷骰决定是否触发天气（概率 28%）。触发时，所有人会看到天气横幅和效果动画。',
      '每条梯只降一种天气，梯子结束后天气自动解除。',
      '天气完全随机，不偏向任何一方——既可能帮你，也可能坑你。',
    ],
  },
  {
    h: '六种天气一览',
    lines: [],
    demo: 'weather',
  },
  {
    h: '一次性天气详解',
    lines: [
      '丰沛（Bounty）：开梯瞬间全场各摸 2 张手牌。手牌变多、选择变多，利好「跑成流」。',
      '乱流（Turbulence）：全场各随机抽走 2 张手牌，混在一起洗匀后重新分发。可能分到宝牌、也可能失去王牌——纯粹的混沌。',
      '源涌（Surge）：全场所有人的受罚累进额外 +1~2——本来赌 1 个点变成赌 2~3 个。使截牌更致命，不敢轻易截、也不敢连续诈。',
    ],
  },
  {
    h: '持续天气详解',
    lines: [
      '禁制（Interdict）：本梯每次出牌后 40% 概率触发「禁止」效果——跳过下一位应对者。被跳过的人无法截牌，让诈牌更容易得逞。',
      '乱向（Veer）：本梯每次出牌后 60% 概率触发「转向」——方向反转。出牌顺序不再可预期，计划好的连环打被打乱。',
      '恩泽（Blessing）：本梯打出 0 或跑成的勇者额外 +3~5 分；若本梯以截牌收场，则改奖收走牌堆的赢家 +2~4 分——几乎每梯必有人受益，鼓励主动终结这一梯。',
    ],
  },
  {
    h: '天气下的战术调整',
    lines: [
      '丰沛降临？手牌变多，试试大胆跑成，一波清空赚大的。',
      '源涌肆虐？保守为上，别连环诈牌——受罚累进额外加码，一旦被抓后果很严重。',
      '禁制笼罩？40% 跳过应对者，诈牌被放行的概率大增——但对手也知道这一点，截牌决心可能更强。',
      '乱向横行？别指望出牌顺序了，随时可能反转到你面前——保持灵活应变。',
      '恩泽时期？抢着打 0、跑成、或干脆截穿对手收下牌堆——主动终结这一梯就能多赚分。',
    ],
  },
];

function WeatherGuide() {
  const { t } = useT();
  return (
    <div className="weather-guide">
      {WEATHER_KINDS.map((k, i) => {
        const m = WEATHER_META[k];
        const isInstant = k === 'bounty' || k === 'shuffle' || k === 'surge';
        return (
          <div key={k} className="weather-card" style={{ animationDelay: `${i * 0.08}s` }}>
            <span className="weather-card-icon"><WeatherIcon kind={k} /></span>
            <div className="weather-card-body">
              <span className="weather-card-name">{t(m.name)}</span>
              <span className={`weather-card-tag ${isInstant ? 'instant' : 'persist'}`}>
                {isInstant ? t('一次性') : t('持续整梯')}
              </span>
              <p className="weather-card-desc">{t(m.desc)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderSections(sections: Section[], t: (k: string) => string) {
  return sections.map((s) => (
    <section key={s.h} className="rules-sec">
      <h3>{t(s.h)}</h3>
      {s.lines.length > 0 && (
        <ul>
          {s.lines.map((l, i) => (
            <li key={i}>{t(l)}</li>
          ))}
        </ul>
      )}
      {s.demo === 'cards' && <CardGallery />}
      {s.demo === 'ladder' && <LadderDemo />}
      {s.demo === 'challenge' && <ChallengeDemo />}
      {s.demo === 'persona' && <PersonaGuide />}
      {s.demo === 'weather' && <WeatherGuide />}
    </section>
  ));
}

export function RulesButton({ initialTab }: { initialTab?: RulesTab } = {}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<RulesTab>(initialTab ?? 'classic');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function openTab(which: RulesTab) {
    setTab(which);
    setOpen(true);
  }

  return (
    <>
      <button className="rules-icon" type="button" onClick={() => openTab(initialTab ?? 'classic')} title={t('规则说明')} aria-label={t('规则说明')}>
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
            <div className="rules-tabs">
              <button
                className={`rules-tab ${tab === 'classic' ? 'rules-tab-on' : ''}`}
                type="button"
                onClick={() => setTab('classic')}
              >
                {t('经典规则')}
              </button>
              <button
                className={`rules-tab ${tab === 'weather' ? 'rules-tab-on' : ''}`}
                type="button"
                onClick={() => setTab('weather')}
              >
                {t('混沌天气')}
              </button>
            </div>
            <div className="rules-body">
              {tab === 'classic'
                ? renderSections(CLASSIC_SECTIONS, t)
                : renderSections(WEATHER_SECTIONS, t)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
