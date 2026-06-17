import { useEffect, useState } from 'react';
import { Card, PlayerView } from '../engine/types';
import { useGame } from '../store/gameStore';
import { CardBack, CardFace } from './Card';

const DICE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function Center({ view }: { view: PlayerView }) {
  const lastDie = useGame((s) => s.lastDie);
  const inPenalty = view.prompt.kind === 'penalty' || (view.current >= 0 && view.lastReveal !== undefined);
  const pileShown = Math.min(view.pileCount, 6);

  // 掷骰滚动：每次新结果先快速翻滚几下再落定
  const [rollFace, setRollFace] = useState<number | null>(null);
  useEffect(() => {
    if (!lastDie) return;
    let n = 0;
    setRollFace(1 + Math.floor(Math.random() * 6));
    const iv = setInterval(() => {
      n++;
      if (n >= 7) {
        clearInterval(iv);
        setRollFace(null);
        return;
      }
      setRollFace(1 + Math.floor(Math.random() * 6));
    }, 60);
    return () => clearInterval(iv);
  }, [lastDie]);

  // 桌心永远摆着「台面上最新那张牌」的牌样——轮到你裁断时就是对方刚出的那张，一眼读懂。
  const topClaim = view.prompt.kind === 'respond' ? view.prompt.claim : view.ladderTop;
  const claimActor = view.prompt.kind === 'respond' ? view.players[view.prompt.player]?.name ?? null : null;
  const claimCard: Card | null = topClaim ? { id: -1, kind: 'number', color: topClaim.color, num: topClaim.num } : null;
  const ladderVal = topClaim ? (topClaim.num === 0 ? 10 : topClaim.num) : 0; // 0=顶格(10)
  const pileFat = view.pileCount >= 6; // 牌堆叠肥：赌注变大的视觉信号

  return (
    <div className="center">
      <div className="deck-area">
        <div className="deck-stack">{view.deckCount > 0 ? <CardBack small /> : <div className="deck-empty">空</div>}</div>
        <div className="deck-label">牌库 {view.deckCount}</div>
      </div>

      <div className="ladder-claim">
        <div className="ladder-caption">
          {claimActor ? '对方宣称 · 待你裁断' : '梯顶 · 宣称'}
          <span className="dir">{view.direction === 1 ? '顺 ↻' : '逆 ↺'}</span>
        </div>
        {claimCard ? (
          <div
            key={`${claimCard.kind === 'number' ? claimCard.color + claimCard.num : 'x'}`}
            className={`claim-card-wrap ${claimActor ? 'claim-judging' : ''}`}
          >
            <CardFace card={claimCard} />
            <span className="claim-tag">{claimActor ? `${claimActor} 宣称` : '宣称'}</span>
          </div>
        ) : (
          <div className="ladder-fresh">
            新梯
            <span>待首家宣称 1–3</span>
          </div>
        )}
        {topClaim && (
          <div className="ladder-gauge" title={`梯压 ${ladderVal}/10`}>
            <div className="lg-track">
              <div
                className="lg-fill"
                style={{ width: `${ladderVal * 10}%`, background: `hsl(${46 - ((ladderVal - 1) / 9) * 40} 66% 47%)` }}
              />
            </div>
            <span className="lg-cap">梯压 {ladderVal}/10 · 只升不降</span>
          </div>
        )}
      </div>

      <div className={`pile-area${pileFat ? ' pile-fat' : ''}`}>
        <div className="pile-stack" data-pile>

          {pileShown === 0 ? (
            <div className="pile-empty">— 牌堆空 —</div>
          ) : (
            Array.from({ length: pileShown }).map((_, i) => (
              <div key={i} className="pile-card" style={{ transform: `translate(${i * 5 - 12}px, ${i * -3}px) rotate(${(i - 2) * 4}deg)` }}>
                <CardBack small />
              </div>
            ))
          )}
        </div>
        <div className="pile-label">赌注牌堆 {view.pileCount} 张{pileFat ? ' · 肥' : ''}</div>
      </div>

      {view.lastReveal && (
        <>
          <div className="focus-dim" />
          <div className={`reveal ${view.lastReveal.truthful ? 'reveal-true' : 'reveal-lie'}`}>
            <div className="reveal-cap">摊牌 · 真实牌</div>
            <CardFace card={view.lastReveal.card} />
            <div className="reveal-verdict">{view.lastReveal.truthful ? '宣称为真' : '撒谎被抓'}</div>
          </div>
        </>
      )}

      {inPenalty && lastDie && (
        <div className={`dice ${rollFace ? 'dice-rolling' : lastDie.hit ? 'dice-hit' : 'dice-miss'}`}>
          <span className="dice-face">{DICE[rollFace ?? lastDie.rolled]}</span>
          <span className="dice-info">
            {rollFace ? '源涌轮盘 · 掷骰中…' : `赌 ${lastDie.chosen} · 掷 ${lastDie.rolled} · ${lastDie.hit ? '被淹没' : '险过'}`}
          </span>
        </div>
      )}
    </div>
  );
}
