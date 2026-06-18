import { useEffect, useRef, useState } from 'react';
import { Card, Color, COLORS } from '../engine/types';
import { viewFor } from '../engine/game';
import { useGame } from '../store/gameStore';
import { useT } from '../i18n';

// ---- 牌构造 helpers ----
let _id = 0;
function nc(color: Color, num: number): Card {
  return { id: _id++, kind: 'number', color, num };
}
function wc(): Card {
  return { id: _id++, kind: 'wild' };
}
function resetIds() {
  _id = 0;
}
function buildStageDeck(p0: Card[], p1: Card[]): Card[] {
  const saved = _id;
  _id = 200;
  const filler: Card[] = [];
  for (const c of COLORS) for (let n = 1; n <= 9; n++) filler.push(nc(c, n));
  for (let i = 0; i < 2; i++) filler.push(wc());
  _id = saved;
  const deal: Card[] = [];
  for (let i = 0; i < 6; i++) {
    deal.push(p0[i]);
    deal.push(p1[i]);
  }
  return [...filler, ...deal.reverse()];
}

// ---- 关卡定义 ----
interface Stage {
  tag: string;
  title: string;
  desc: string;
  guide: string;
  result: string;
  setup: () => void;
  isDone: () => boolean;
  afterPlayer?: () => void;
}

function makeStages(): Stage[] {
  const { stageGame, stageCmd } = useGame.getState();

  return [
    // ── 关卡 1：出牌基础 ──
    {
      tag: '出牌',
      title: '选牌 · 宣称 · 出牌',
      desc: '游戏开始，你是首家。选一张手牌、报一个宣称，把牌盖着打出去。',
      guide: '选中手牌中的 Aurel 1（金色 1），然后在宣称面板选「Aurel 1」如实出牌。首家报 1~3 起头。',
      result: '出牌成功！对手放行了，轮到下家继续。这就是最基本的出牌流程。',
      setup() {
        resetIds();
        const p0 = [nc('aurel', 1), nc('aurel', 3), nc('selvar', 5), nc('thalos', 2), nc('verda', 7), nc('selvar', 6)];
        const p1 = [nc('thalos', 4), nc('verda', 2), nc('selvar', 8), nc('aurel', 6), nc('thalos', 7), nc('verda', 9)];
        stageGame(0, buildStageDeck(p0, p1));
      },
      isDone() {
        const s = useGame.getState().state;
        return !!s && s.phase.kind === 'respond';
      },
      afterPlayer() {
        setTimeout(() => useGame.getState().stageCmd(1, { type: 'Accept' }), 800);
      },
    },

    // ── 关卡 2：截牌拆穿 ──
    {
      tag: '截牌',
      title: '翻牌验真 · 抓住谎言',
      desc: '对手盖着出了一张牌，宣称是 Aurel 2——但他其实在撒谎。',
      guide: '对手宣称打了 Aurel 2——你怀疑他在撒谎。点「截牌」拆穿他！',
      result: '抓到了！翻开是 Thalos 3，根本不是 Aurel 2。对手撒谎被拆穿，受罚！你赢走了牌堆。',
      setup() {
        resetIds();
        const p0 = [nc('aurel', 4), nc('selvar', 3), nc('verda', 5), nc('thalos', 6), nc('aurel', 8), nc('selvar', 7)];
        const aiThalos3 = nc('thalos', 3);
        const p1 = [aiThalos3, nc('verda', 4), nc('selvar', 6), nc('aurel', 2), nc('thalos', 8), nc('verda', 9)];
        stageGame(1, buildStageDeck(p0, p1));
        stageCmd(1, { type: 'PlayCard', cardId: aiThalos3.id, claim: { color: 'aurel', num: 2 } });
      },
      isDone() {
        const s = useGame.getState().state;
        return !!s && (s.phase.kind === 'penalty' || s.phase.kind === 'play');
      },
      afterPlayer() {
        const check = () => {
          const s = useGame.getState().state;
          if (s && s.phase.kind === 'penalty' && s.players[s.phase.roller].isAI) {
            const ns = [3, 1, 2, 4, 5, 6].slice(0, s.phase.rollsRemaining);
            setTimeout(() => useGame.getState().stageCmd(1, { type: 'ChooseNumber', ns }), 1000);
          }
        };
        setTimeout(check, 300);
      },
    },

    // ── 关卡 3：诈牌过关 ──
    {
      tag: '诈牌',
      title: '撒谎蒙混 · 瞒天过海',
      desc: '梯子已经到了 Aurel 5。你手里没有能如实接上的牌——只能撒谎了！',
      guide: '选一张任意手牌，然后宣称它是 Aurel 6 或更大。大胆撒谎吧！',
      result: '诈牌成功！对手信了你的谎言。撒谎、读心、甩压力——这就是源河的核心乐趣。',
      setup() {
        resetIds();
        const humanSetupCard = nc('thalos', 4);
        const p0 = [humanSetupCard, nc('thalos', 2), nc('verda', 3), nc('selvar', 1), nc('thalos', 7), nc('verda', 6)];
        const aiAurel2 = nc('aurel', 2);
        const aiAurel5 = nc('aurel', 5);
        const p1 = [aiAurel2, nc('selvar', 5), aiAurel5, nc('verda', 4), nc('thalos', 8), nc('verda', 9)];
        stageGame(1, buildStageDeck(p0, p1));
        // 链式铺牌：AI Aurel 2 → 接 → 人 Aurel 3 → 接 → AI Aurel 5 → 接
        stageCmd(1, { type: 'PlayCard', cardId: aiAurel2.id, claim: { color: 'aurel', num: 2 } });
        stageCmd(0, { type: 'Accept' });
        stageCmd(0, { type: 'PlayCard', cardId: humanSetupCard.id, claim: { color: 'aurel', num: 3 } });
        stageCmd(1, { type: 'Accept' });
        stageCmd(1, { type: 'PlayCard', cardId: aiAurel5.id, claim: { color: 'aurel', num: 5 } });
        stageCmd(0, { type: 'Accept' });
      },
      isDone() {
        const s = useGame.getState().state;
        return !!s && s.phase.kind === 'respond';
      },
      afterPlayer() {
        setTimeout(() => useGame.getState().stageCmd(1, { type: 'Accept' }), 800);
      },
    },

    // ── 关卡 4：受罚掷骰 ──
    {
      tag: '受罚',
      title: '源涌轮盘 · 赌运气',
      desc: '你的诈牌被对手拆穿了！翻牌对不上，你要掷骰受罚。选一个点数赌运气吧。',
      guide: '选一个你觉得不会掷中的点数——掷中就掉 1 点凝聚度。祝你好运！',
      result: '这就是受罚的感觉！连续受罚次数越多，要赌的点数越多，掷中率越高——所以尽量别连输。',
      setup() {
        resetIds();
        const humanThalos2 = nc('thalos', 2);
        const p0 = [humanThalos2, nc('verda', 3), nc('selvar', 1), nc('thalos', 7), nc('verda', 6), nc('selvar', 4)];
        const p1 = [nc('aurel', 5), nc('verda', 4), nc('selvar', 6), nc('aurel', 2), nc('thalos', 8), nc('verda', 9)];
        stageGame(0, buildStageDeck(p0, p1));
        // human plays bluff
        stageCmd(0, { type: 'PlayCard', cardId: humanThalos2.id, claim: { color: 'aurel', num: 1 } });
        // AI challenges
        stageCmd(1, { type: 'Challenge' });
        // now human should be in penalty phase
      },
      isDone() {
        const s = useGame.getState().state;
        if (!s) return false;
        if (s.phase.kind === 'play' || s.phase.kind === 'respond') return true;
        return false;
      },
    },

    // ── 关卡 5：打 0 止损 ──
    {
      tag: '打 0',
      title: '顶格终结 · 领计分卡',
      desc: '梯子已经到了 Aurel 7，越往上越危险。你手里正好有 Aurel 0（顶格=10）——打出来终结本梯、领计分卡！',
      guide: '选中 Aurel 0（金色 0），宣称「Aurel 0」打出。0 是该色最大（顶格=10），能终结整条梯子。',
      result: '终结本梯，领到计分卡！打 0 是高压时刻的最佳止损手段——把全场拉回低位重来。',
      setup() {
        resetIds();
        const humanSetupCard = nc('selvar', 3);
        const humanAurel0 = nc('aurel', 0);
        const p0 = [humanSetupCard, humanAurel0, nc('verda', 5), nc('thalos', 2), nc('aurel', 4), nc('selvar', 6)];
        const aiAurel2 = nc('aurel', 2);
        const aiAurel7 = nc('aurel', 7);
        const p1 = [aiAurel2, nc('verda', 4), aiAurel7, nc('thalos', 6), nc('thalos', 8), nc('verda', 9)];
        stageGame(1, buildStageDeck(p0, p1));
        // 链式铺牌：AI Aurel 2 → 接 → 人 Aurel 4 → 接 → AI Aurel 7 → 接
        stageCmd(1, { type: 'PlayCard', cardId: aiAurel2.id, claim: { color: 'aurel', num: 2 } });
        stageCmd(0, { type: 'Accept' });
        stageCmd(0, { type: 'PlayCard', cardId: humanSetupCard.id, claim: { color: 'aurel', num: 4 } });
        stageCmd(1, { type: 'Accept' });
        stageCmd(1, { type: 'PlayCard', cardId: aiAurel7.id, claim: { color: 'aurel', num: 7 } });
        stageCmd(0, { type: 'Accept' });
      },
      isDone() {
        const s = useGame.getState().state;
        return !!s && s.phase.kind === 'respond';
      },
      afterPlayer() {
        setTimeout(() => useGame.getState().stageCmd(1, { type: 'Accept' }), 800);
      },
    },
  ];
}

// ---- 组件 ----

type Phase = 'intro' | 'play' | 'result';

export function TutorialStages({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const { t } = useT();
  const stagesRef = useRef<Stage[] | null>(null);
  if (!stagesRef.current) stagesRef.current = makeStages();
  const stages = stagesRef.current;

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('intro');
  const [doneHandled, setDoneHandled] = useState(false);
  const state = useGame((s) => s.state);

  const stage = stages[idx];

  // setup game when entering play phase
  useEffect(() => {
    if (phase !== 'play') return;
    setDoneHandled(false);
    useGame.setState({ tutorialStage: idx });
    stage.setup();
  }, [phase, idx]);

  // watch for stage completion
  useEffect(() => {
    if (phase !== 'play' || doneHandled || !state) return;
    if (stage.isDone()) {
      setDoneHandled(true);
      if (stage.afterPlayer) stage.afterPlayer();
      setTimeout(() => setPhase('result'), 1200);
    }
  }, [state, phase, doneHandled]);

  const isLast = idx === stages.length - 1;

  function next() {
    if (isLast) {
      useGame.setState({ tutorialStage: null });
      onDone();
    } else {
      setIdx((i) => i + 1);
      setPhase('intro');
    }
  }

  // ---- intro overlay ----
  if (phase === 'intro') {
    return (
      <div className="overlay stage-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="stage-panel">
          <div className="stage-head">
            <span className="stage-kicker">
              {t('教学关卡')} · {idx + 1}/{stages.length}
            </span>
            <button className="flog-close" type="button" onClick={onSkip} aria-label={t('跳过')}>
              ✕
            </button>
          </div>
          <span className="stage-tag">{t(stage.tag)}</span>
          <h3 className="stage-title">{t(stage.title)}</h3>
          <p className="stage-desc">{t(stage.desc)}</p>
          <div className="stage-nav">
            <button className="stage-skip" type="button" onClick={onSkip}>
              {t('跳过关卡')}
            </button>
            <button className="stage-go" type="button" onClick={() => setPhase('play')}>
              {t('开始 →')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- result overlay ----
  if (phase === 'result') {
    return (
      <div className="overlay stage-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="stage-panel stage-result">
          <span className="stage-tag">{t(stage.tag)}</span>
          <h3 className="stage-title stage-done-title">{t('过关！')}</h3>
          <p className="stage-desc">{t(stage.result)}</p>
          <div className="stage-nav">
            <button className="stage-go" type="button" onClick={next}>
              {isLast ? t('开始实战练习 →') : t('下一关 →')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- play phase: floating guide ----
  return (
    <div className="stage-guide">
      <div className="stage-guide-bubble">
        <span className="stage-guide-tag">
          {t('关卡')} {idx + 1} · {t(stage.tag)}
        </span>
        <p className="stage-guide-text">{t(stage.guide)}</p>
      </div>
    </div>
  );
}
