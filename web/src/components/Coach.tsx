import { ReactNode, useEffect, useState } from 'react';
import { PlayerView } from '../engine/types';
import { useGame } from '../store/gameStore';
import { CardGallery } from './CardGallery';
import { ChallengeDemo, LadderDemo } from './RuleDemos';

interface Step {
  key: string;
  text: string;
  demo?: ReactNode;
}

// 新手引导：在真实牌桌上，按你当前的处境弹一条对应说明 + 实景小动画（每种只弹一次）。
export function Coach({ view }: { view: PlayerView }) {
  const [shown, setShown] = useState<Set<string>>(() => new Set());
  const [current, setCurrent] = useState<Step | null>({
    key: 'intro',
    text: '欢迎！先认认牌：四种颜色 + 数字 0–9（0 当该色最大）。跟着提示走一遍就懂了。',
    demo: <CardGallery compact />,
  });

  useEffect(() => {
    if (current) return; // 正在显示就不打断
    const p = view.prompt;
    const hand = view.yourHand;
    let step: Step | null = null;
    if (view.lastReveal && !shown.has('reveal')) {
      step = { key: 'reveal', text: '翻牌见真假！报的是真，截牌方受罚；报的是假，出牌方受罚 —— 台面整摞牌归赢家。' };
    } else if (p.kind === 'play') {
      if (!shown.has('play')) {
        step = {
          key: 'play',
          text: p.isFirst
            ? '轮到你起头：点一张手牌选中，再点下方亮起的「宣称」（说它是某色 1–3，可以撒谎）。'
            : '轮到你出牌：先点一张手牌，再选宣称 —— 接牌只有两条路（看下图）。',
          demo: <LadderDemo />,
        };
      } else if (hand.some((c) => c.kind === 'number' && c.num === 0) && !shown.has('zero')) {
        step = { key: 'zero', text: '你手里有一张「0」：它是该色的顶格（最大）。打出它能终结当前这一梯，还顺手领一张计分卡入账。' };
      } else if (hand.some((c) => c.kind === 'wild') && !shown.has('wild')) {
        step = { key: 'wild', text: '你手里有「万能牌」：盖着出可冒充任何一张能接上的牌，被截牌翻开也永远算真 —— 绝境脱困的王牌。' };
      } else if (hand.length === 1 && !shown.has('runout')) {
        step = { key: 'runout', text: '只剩最后一张了！把它出掉、又没被截牌，就「跑成」—— 独吞台面整摞赌注牌，是赢局的关键一步。' };
      }
    } else if (p.kind === 'respond' && !shown.has('respond')) {
      step = {
        key: 'respond',
        text: '对方盖牌出了一张并宣称。信他就「放行」（轮到你出）；疑他就「截牌」当场翻开对质。',
        demo: <ChallengeDemo />,
      };
    } else if (p.kind === 'penalty' && !shown.has('penalty')) {
      step = { key: 'penalty', text: '你被罚了：选一个点数掷骰，掷中就掉 1 点凝聚度。连着受罚越来越险。' };
    }
    if (step) setCurrent(step);
  }, [view, current, shown]);

  function dismiss() {
    if (current) setShown((s) => new Set(s).add(current.key));
    setCurrent(null);
  }

  function endTutorial() {
    useGame.setState({ tutorial: false });
  }

  if (!current) {
    return (
      <button className="coach-tab" type="button" onClick={endTutorial} title="结束新手引导">
        结束引导
      </button>
    );
  }

  return (
    <div className={`coach${current.demo ? ' coach-wide' : ''}`}>
      <div className="coach-bubble">
        <span className="coach-tag">新手引导</span>
        <p className="coach-text">{current.text}</p>
        {current.demo && <div className="coach-demo">{current.demo}</div>}
        <div className="coach-btns">
          <button className="coach-skip" type="button" onClick={endTutorial}>
            结束引导
          </button>
          <button className="coach-ok" type="button" onClick={dismiss}>
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
