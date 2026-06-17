import { useEffect, useState } from 'react';
import { Card, Claim, Color, COLORS, COLOR_META, PlayerView } from '../engine/types';
import { legalClaims, val } from '../engine/game';
import { useGame } from '../store/gameStore';
import { CardFace, ClaimChip } from './Card';
import { ClaimPicker } from './ClaimPicker';

function recommendedClaim(card: Card, claims: Claim[]): Claim | null {
  if (!claims.length) return null;
  if (card.kind === 'number') {
    const truth = claims.find((c) => c.color === card.color && c.num === card.num);
    if (truth) return truth; // 能如实接就如实
  }
  let best = claims[0]; // 否则取升幅最小的合法宣称（最自然的诈牌）
  for (const c of claims) if (val(c.num) < val(best.num)) best = c;
  return best;
}

export function ActionBar({ view }: { view: PlayerView }) {
  const human = useGame((s) => s.human);
  const tutorial = useGame((s) => s.tutorial);
  const [selId, setSelId] = useState<number | null>(null);
  const p = view.prompt;

  useEffect(() => {
    setSelId(null);
  }, [view.current, p.kind]);

  const myTurnPlay = p.kind === 'play';
  const selCard = view.yourHand.find((c) => c.id === selId) ?? null;
  const claims = myTurnPlay ? legalClaims(view.ladderTop, p.isFirst) : [];

  const wild = selCard?.kind === 'wild';
  // 如实出牌：所选数字牌恰好有一个合法的「同色同数」宣称（万能牌无所谓真假，不给如实键）
  const honestClaim =
    selCard && selCard.kind === 'number'
      ? claims.find((c) => c.color === selCard.color && c.num === selCard.num) ?? null
      : null;

  function onCardClick(card: Card) {
    if (!myTurnPlay) return;
    if (card.kind === 'functional') {
      if (p.kind === 'play' && !p.isFirst) human({ type: 'PlayFunctional', cardId: card.id });
      return;
    }
    setSelId((cur) => (cur === card.id ? null : card.id));
  }

  function onClaimClick(claim: Claim) {
    if (selId == null) return;
    human({ type: 'PlayCard', cardId: selId, claim });
    setSelId(null);
  }

  // ---- 快捷键（杀戮尖塔式）：数字选牌/选宣称、回车出牌、空格接受、D 质疑、1–6 掷骰 ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('.overlay')) return; // 有弹窗时不抢键
      const k = e.key.toLowerCase();
      const digit = e.key >= '0' && e.key <= '9' ? Number(e.key) : -1;

      if (p.kind === 'respond') {
        if (k === ' ' || k === 'enter' || k === 'a' || e.key === '1') human({ type: 'Accept' });
        else if (k === 'd' || k === 'q' || e.key === '2') human({ type: 'Challenge' });
        else return;
        e.preventDefault();
        return;
      }
      if (p.kind === 'penalty') {
        if (digit >= 1 && digit <= 6) {
          human({ type: 'ChooseNumber', n: digit });
          e.preventDefault();
        }
        return;
      }
      if (p.kind === 'play') {
        if (selCard) {
          if (k === 'escape') setSelId(null);
          else if (k === 'enter' || k === ' ') {
            const rc = recommendedClaim(selCard, claims);
            if (rc) onClaimClick(rc);
          } else if (digit >= 1 && digit <= 9 && claims[digit - 1]) onClaimClick(claims[digit - 1]);
          else return;
          e.preventDefault();
        } else {
          if (digit >= 1 && digit <= 9 && view.yourHand[digit - 1]) onCardClick(view.yourHand[digit - 1]);
          else if (e.key === '0' && view.yourHand[9]) onCardClick(view.yourHand[9]);
          else if (k === 'w' && p.canDraw) human({ type: 'Draw' });
          else if (k === 'f' && p.canFallback) human({ type: 'Fallback' });
          else return;
          e.preventDefault();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, selId]);

  return (
    <div className="actionbar">
      <Prompt view={view} />

      {myTurnPlay && (
        <div className="play-controls">
          <span className="ctrl-tip">
            {p.isFirst ? '首家：盖一张牌，宣称某色 1–3（可撒谎）' : '接牌：同色更大 / 同数字换色（可撒谎）'}
          </span>
          {(p.canDraw || p.canFallback) && (
            <span className="ctrl-mini">
              {p.canDraw && (
                <button className="btn btn-mini" type="button" onClick={() => human({ type: 'Draw' })}>
                  摸一张
                </button>
              )}
              {p.canFallback && (
                <button className="btn btn-mini" type="button" onClick={() => human({ type: 'Fallback' })}>
                  兜底
                </button>
              )}
            </span>
          )}
        </div>
      )}

      {myTurnPlay && selCard && (
        <div className="claim-picker">
          <ClaimPicker claims={claims} honestClaim={honestClaim} wild={!!wild} onPick={onClaimClick} tutorial={tutorial} />
        </div>
      )}

      <div className="hand">
        <div className="hand-label">
          你的手牌 · {view.yourHand.length}
          {myTurnPlay && <span className="kbd-hint">　点牌选中 · 回车出最稳 · Esc 取消</span>}
        </div>
        <HandSummary hand={view.yourHand} />
        <div className={`hand-cards${tutorial && myTurnPlay && !selCard ? ' tut-glow' : ''}`}>
          {view.yourHand.length === 0 && <span className="hand-empty">（空）</span>}
          {view.yourHand.map((card, i) => (
            <div className="hand-card" key={card.id} style={{ animationDelay: `${Math.min(i, 9) * 35}ms` }}>
              {myTurnPlay && i < 9 && <span className="hot hot-card">{i + 1}</span>}
              <CardFace
                card={card}
                selected={card.id === selId}
                dimmed={!myTurnPlay || (card.kind === 'functional' && p.kind === 'play' && p.isFirst)}
                onClick={() => onCardClick(card)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 手牌速览：按颜色归并，移动端只露 4 张时也能一眼知道手里有什么。
function HandSummary({ hand }: { hand: Card[] }) {
  if (hand.length === 0) return null;
  const byColor = new Map<Color, number[]>();
  let nWild = 0;
  let nRev = 0;
  let nSkip = 0;
  for (const c of hand) {
    if (c.kind === 'number') {
      const a = byColor.get(c.color) ?? [];
      a.push(c.num);
      byColor.set(c.color, a);
    } else if (c.kind === 'wild') nWild++;
    else if (c.func === 'reverse') nRev++;
    else nSkip++;
  }
  return (
    <div className="hand-summary">
      <span className="hs-label">速览</span>
      {COLORS.map((col) => {
        const a = byColor.get(col);
        if (!a) return null;
        const m = COLOR_META[col];
        return (
          <span key={col} className="hs-group" style={{ color: m.hex }}>
            <span className="hs-dot" style={{ background: m.hex }} />
            {m.say} {a.sort((x, y) => val(x) - val(y)).map((n) => (n === 0 ? '0' : n)).join(' ')}
          </span>
        );
      })}
      {nWild > 0 && <span className="hs-group hs-special">万能×{nWild}</span>}
      {nRev > 0 && <span className="hs-group hs-special">转向×{nRev}</span>}
      {nSkip > 0 && <span className="hs-group hs-special">禁止×{nSkip}</span>}
    </div>
  );
}

function Prompt({ view }: { view: PlayerView }) {
  const human = useGame((s) => s.human);
  const tutorial = useGame((s) => s.tutorial);
  const p = view.prompt;
  const nameOf = (seat: number) => view.players[seat]?.name ?? `#${seat}`;

  if (p.kind === 'idle') {
    return <div className="prompt prompt-idle">等待 {nameOf(view.current)} 行动…</div>;
  }
  if (p.kind === 'respond') {
    return (
      <div className="prompt prompt-respond">
        <span>
          <strong>{nameOf(p.player)}</strong> 盖牌出了一张，宣称 <ClaimChip claim={p.claim} />。信就放行，疑就截牌翻开（夺牌堆 {view.pileCount} 张）。
        </span>
        <div className={`ctrl-btns${tutorial ? ' tut-glow' : ''}`}>
          <button className="btn btn-accept" type="button" onClick={() => human({ type: 'Accept' })}>
            放行 <kbd>空格</kbd>
          </button>
          <button className="btn btn-challenge" type="button" onClick={() => human({ type: 'Challenge' })}>
            截牌！ <kbd>D</kbd>
          </button>
        </div>
      </div>
    );
  }
  if (p.kind === 'penalty') {
    return (
      <div className="prompt prompt-penalty">
        <span>
          源涌起 —— 你受罚。本轮还需投 <strong>{p.rollsRemaining}</strong> 次，任一掷中即被淹没。按数字键 <kbd>1</kbd>–<kbd>6</kbd> 选点掷骰：
        </span>
        <div className={`dice-pick${tutorial ? ' tut-glow' : ''}`}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} className="die-btn" type="button" onClick={() => human({ type: 'ChooseNumber', n })}>
              {['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][n]}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (p.kind === 'play') {
    return <div className="prompt prompt-play">轮到你出牌{p.isFirst ? ' · 你是首家' : ''}</div>;
  }
  return null;
}
