import { useEffect, useState } from 'react';
import { PlayerView } from '../engine/types';
import { useT } from '../i18n';
import { useGame } from '../store/gameStore';
import { TutorialLesson } from './TutorialLesson';

interface Step {
  key: string;
  text: string;
}

// 新手引导 = 开打前的「整本教学」（TutorialLesson）+ 实战时贴边的简短指令气泡（不挡对面、不挡桌心）。
export function Coach({ view }: { view: PlayerView }) {
  const { t } = useT();
  const [lesson, setLesson] = useState(true);
  const [shown, setShown] = useState<Set<string>>(() => new Set());
  const [current, setCurrent] = useState<Step | null>(null);

  useEffect(() => {
    if (lesson || current) return; // 教学中 / 已有气泡：不打断
    const p = view.prompt;
    const hand = view.yourHand;
    let step: Step | null = null;
    if (view.lastReveal && !shown.has('reveal')) {
      step = { key: 'reveal', text: '翻牌见真假：报真→截牌方受罚，报假→出牌方受罚，整摞牌堆归赢家。' };
    } else if (p.kind === 'play') {
      if (!shown.has('play')) {
        step = {
          key: 'play',
          text: p.isFirst
            ? '轮到你起头：点高亮的手牌选中，再点下方「宣称」（报某色 1–3，可诈）。'
            : '轮到你出牌：点一张手牌，再选宣称（同色更大 / 同数字换色）。',
        };
      } else if (hand.some((c) => c.kind === 'number' && c.num === 0) && !shown.has('zero')) {
        step = { key: 'zero', text: '你有一张 0：打出能终结本梯、领 1 张计分卡。被高压逼急时用它止损。' };
      } else if (hand.some((c) => c.kind === 'wild') && !shown.has('wild')) {
        step = { key: 'wild', text: '你有万能牌：盖着出可冒充任一合法牌，被截也判真——脱困王牌。' };
      } else if (hand.length === 1 && !shown.has('runout')) {
        step = { key: 'runout', text: '只剩最后一张！出掉且不被截就「跑成」、独吞牌堆，再摸 6 张继续。' };
      }
    } else if (p.kind === 'respond' && !shown.has('respond')) {
      step = { key: 'respond', text: '轮到你裁断：信下家点「放行」，疑他点「截牌」当场摊牌对质。' };
    } else if (p.kind === 'penalty' && !shown.has('penalty')) {
      step = { key: 'penalty', text: '你受罚了——不是卡住了！点下方高亮的任意一个骰子＝赌那个点数并掷出，掷中就掉 1 命。连环受罚越来越险。' };
    }
    if (step) setCurrent(step);
  }, [view, current, shown, lesson]);

  function dismiss() {
    if (current) setShown((s) => new Set(s).add(current.key));
    setCurrent(null);
  }

  function endTutorial() {
    useGame.setState({ tutorial: false });
  }

  if (lesson) {
    return <TutorialLesson onStart={() => setLesson(false)} onSkip={() => setLesson(false)} />;
  }

  if (!current) {
    return (
      <div className="coach-tabs">
        <button className="coach-tab" type="button" onClick={() => setLesson(true)} title={t('重看教学')}>
          {t('重看教学')}
        </button>
        <button className="coach-tab" type="button" onClick={endTutorial} title={t('结束引导')}>
          {t('结束引导')}
        </button>
      </div>
    );
  }

  return (
    <div className="coach">
      <div className="coach-bubble">
        <span className="coach-tag">{t('新手引导')}</span>
        <p className="coach-text">{t(current.text)}</p>
        <div className="coach-btns">
          <button className="coach-skip" type="button" onClick={endTutorial}>
            {t('结束引导')}
          </button>
          <button className="coach-ok" type="button" onClick={dismiss}>
            {t('知道了')}
          </button>
        </div>
      </div>
    </div>
  );
}
