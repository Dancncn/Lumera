import { useEffect, useRef, useState } from 'react';
import { Card, Claim, Color, COLORS, COLOR_META, PlayerView } from '../engine/types';
import { legalClaims, val } from '../engine/game';
import { useT } from '../i18n';
import { useGame, Mode } from '../store/gameStore';
import { CardFace, ClaimChip } from './Card';
import { ClaimPicker } from './ClaimPicker';
import { DiceFace } from './DiceFace';

const TURN_SECS = 20;
const CHALLENGE_SECS = 10;

export function TurnCountdown({ deadline, compact, totalSecs = TURN_SECS }: { deadline: number; compact?: boolean; totalSecs?: number }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, deadline - Date.now()));
  const rafRef = useRef(0);

  useEffect(() => {
    function tick() {
      const left = Math.max(0, deadline - Date.now());
      setRemaining(left);
      if (left > 0) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [deadline]);

  const secs = Math.ceil(remaining / 1000);
  const pct = Math.min(100, (remaining / (totalSecs * 1000)) * 100);
  const urgent = secs <= 5;

  return (
    <div className={`turn-countdown${compact ? ' tc-compact' : ''}${urgent ? ' tc-urgent' : ''}`}>
      <div className="tc-bar" style={{ width: `${pct}%` }} />
      <span className="tc-label">{secs}s</span>
    </div>
  );
}

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
  const pass = useGame((s) => s.pass);
  const tutorial = useGame((s) => s.tutorial);
  const { t } = useT();
  const [selId, setSelId] = useState<number | null>(null);
  const p = view.prompt;

  useEffect(() => {
    setSelId(null);
  }, [view.current, p.kind]);

  const myTurnPlay = p.kind === 'play';
  const needsReveal = myTurnPlay && p.needsReveal;
  const selCard = view.yourHand.find((c) => c.id === selId) ?? null;
  const claims = myTurnPlay && !needsReveal ? legalClaims(view.ladderTop, p.isFirst) : [];

  const wild = selCard?.kind === 'wild';
  // 如实出牌：所选数字牌恰好有一个合法的「同色同数」宣称（万能牌无所谓真假，不给如实键）
  const honestClaim =
    selCard && selCard.kind === 'number'
      ? claims.find((c) => c.color === selCard.color && c.num === selCard.num) ?? null
      : null;

  function onCardClick(card: Card) {
    if (!myTurnPlay) return;
    if (needsReveal) {
      human({ type: 'RevealCard', cardId: card.id });
      return;
    }
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
        if (k === 'd' || k === 'q') human({ type: 'Challenge' });
        else if (k === ' ' || k === 'enter') pass();
        else return;
        e.preventDefault();
        return;
      }
      if (p.kind === 'penalty') return; // 受罚多选交由 PenaltyPick 自管键盘
      if (p.kind === 'play') {
        if (p.needsReveal) {
          if (digit >= 1 && digit <= 9 && view.yourHand[digit - 1]) {
            human({ type: 'RevealCard', cardId: view.yourHand[digit - 1].id });
          } else if (e.key === '0' && view.yourHand[9]) {
            human({ type: 'RevealCard', cardId: view.yourHand[9].id });
          } else return;
          e.preventDefault();
        } else if (selCard) {
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

      {myTurnPlay && needsReveal && (
        <div className="play-controls">
          <span className="ctrl-tip ctrl-tip-reveal">{t('摸牌后须亮 1 张手牌给全场看，点击选择要亮的牌')}</span>
        </div>
      )}

      {myTurnPlay && !needsReveal && (
        <div className="play-controls">
          <span className="ctrl-tip">
            {p.isFirst ? t('首家：盖一张牌，宣称某色 1–3（可撒谎）') : t('接牌：同色更大或相同 / 同数字换色（可撒谎）')}
          </span>
          {(p.canDraw || p.canFallback || p.drawCooldown > 0) && (
            <span className="ctrl-mini">
              {p.canDraw && (
                <button className="btn btn-mini" type="button" onClick={() => human({ type: 'Draw' })}>
                  {t('摸一张')}
                </button>
              )}
              {!p.canDraw && p.drawCooldown > 0 && (
                <span className="ctrl-cd" title={t('反囤牌：摸牌冷却，过 N 回合才能再摸')}>
                  ❄ {t('摸牌冷却 · 还需 {n} 回合', { n: p.drawCooldown })}
                </span>
              )}
              {p.canFallback && (
                <button className="btn btn-mini" type="button" onClick={() => human({ type: 'Fallback' })}>
                  {t('兜底')}
                </button>
              )}
            </span>
          )}
        </div>
      )}

      {myTurnPlay && !needsReveal && selCard && (
        <div className="claim-picker">
          <ClaimPicker claims={claims} honestClaim={honestClaim} wild={!!wild} onPick={onClaimClick} tutorial={tutorial} />
        </div>
      )}

      <div className="hand">
        <div className="hand-label">
          {t('你的手牌')} · {view.yourHand.length}
          {myTurnPlay && !needsReveal && <span className="kbd-hint">　{t('点牌选中 · 回车出最稳 · Esc 取消')}</span>}
          {needsReveal && <span className="kbd-hint kbd-hint-reveal">　{t('点击一张牌亮给全场')}</span>}
        </div>
        <HandSummary hand={view.yourHand} />
        <div className={`hand-cards${tutorial && myTurnPlay && !selCard ? ' tut-glow' : ''}${needsReveal ? ' hand-reveal-mode' : ''}`}>
          {view.yourHand.length === 0 && <span className="hand-empty">{t('（空）')}</span>}
          {view.yourHand.map((card, i) => (
            <div className="hand-card" key={card.id} style={{ animationDelay: `${Math.min(i, 9) * 35}ms` }}>
              {myTurnPlay && i < 9 && <span className="hot hot-card">{i + 1}</span>}
              <CardFace
                card={card}
                selected={card.id === selId}
                dimmed={!myTurnPlay || (!needsReveal && card.kind === 'functional' && p.kind === 'play' && p.isFirst)}
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
  const { t } = useT();
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
      <span className="hs-label">{t('速览')}</span>
      {COLORS.map((col) => {
        const a = byColor.get(col);
        if (!a) return null;
        const m = COLOR_META[col];
        return (
          <span key={col} className="hs-group" style={{ color: m.hex }}>
            <span className="hs-dot" style={{ background: m.hex }} />
            {m.name} {a.sort((x, y) => val(x) - val(y)).map((n) => (n === 0 ? '0' : n)).join(' ')}
          </span>
        );
      })}
      {nWild > 0 && <span className="hs-group hs-special">{t('万能')}×{nWild}</span>}
      {nRev > 0 && <span className="hs-group hs-special">{t('转向')}×{nRev}</span>}
      {nSkip > 0 && <span className="hs-group hs-special">{t('禁止')}×{nSkip}</span>}
    </div>
  );
}

function PenaltyPick({ need, dice }: { need: number; dice: number }) {
  const human = useGame((s) => s.human);
  const { t } = useT();
  const [picked, setPicked] = useState<number[]>([]);

  useEffect(() => {
    setPicked([]); // 受罚累进数变化（新一轮受罚）即清空已选
  }, [need]);

  const full = picked.length >= need;
  const left = need - picked.length;

  function toggle(n: number) {
    setPicked((cur) => {
      if (cur.includes(n)) return cur.filter((x) => x !== n);
      if (cur.length >= need) return cur; // 已选满：需先取消一个再换
      return [...cur, n].sort((a, b) => a - b);
    });
  }

  function roll() {
    if (picked.length !== need) return;
    human({ type: 'ChooseNumber', ns: picked });
    setPicked([]);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('.overlay')) return;
      const k = e.key.toLowerCase();
      const digit = e.key >= '0' && e.key <= '9' ? Number(e.key) : -1;
      if (digit >= 1 && digit <= 6) {
        toggle(digit);
        e.preventDefault();
      } else if ((k === 'enter' || k === ' ') && picked.length === need) {
        roll();
        e.preventDefault();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked, need]);

  return (
    <div className="prompt prompt-penalty">
      <span className="penalty-tip">
        {t('你受罚了！本轮赌定 {n} 个点数，掷 {d} 颗骰，任一颗落在所选点就掉 1 命、轮盘重置。', { n: need, d: dice })}
        {dice > 1 && <strong className="penalty-tip-warn" style={{ color: '#c2502f' }}>{t('（第三枪起两颗骰子夹击，尾部极凶）')}</strong>}
      </span>
      <div className="penalty-steps">
        <span className={`penalty-step ${!full ? 'penalty-step-active' : 'penalty-step-done'}`}>
          {!full ? `(1) ${t('选择 {n} 个点数', { n: need })}` : t('已选定')}
        </span>
        <span className="penalty-step-arrow">&rarr;</span>
        <span className={`penalty-step ${full ? 'penalty-step-active' : ''}`}>
          (2) {t('掷骰')}
        </span>
      </div>
      <div className="dice-pick-hint">
        {full ? `↓ ${t('已选满，点击掷骰决定命运')}` : `↓ ${t('点击下方骰子选择 {b} 个点数', { b: left })}`}
      </div>
      <div className="dice-pick dice-pick-live">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button
            key={n}
            className={`die-btn ${picked.includes(n) ? 'die-on' : ''}`}
            type="button"
            onClick={() => toggle(n)}
            title={t('赌 {n} 点', { n })}
          >
            <DiceFace value={n} size={28} />
            <span className="die-n">{n}</span>
          </button>
        ))}
      </div>
      <button className={`btn btn-challenge penalty-roll ${full ? 'penalty-roll-ready' : ''}`} type="button" disabled={!full} onClick={roll}>
        {full ? t('掷骰！') : t('再选 {b} 个', { b: left })}
      </button>
    </div>
  );
}

function Prompt({ view }: { view: PlayerView }) {
  const human = useGame((s) => s.human);
  const pass = useGame((s) => s.pass);
  const tutorial = useGame((s) => s.tutorial);
  const mode = useGame((s) => s.mode);
  const deadline = useGame((s) => s.turnDeadline);
  const { t, tn } = useT();
  const p = view.prompt;
  const nameOf = (seat: number) => tn(view.players[seat]?.name ?? `#${seat}`);
  const hasDeadline = deadline && deadline > Date.now();
  const showOnlineTimer = mode === 'online' && hasDeadline;

  if (p.kind === 'idle') {
    return (
      <div className="prompt prompt-idle">
        {t('等待 {name} 行动…', { name: nameOf(view.current) })}
        {showOnlineTimer && <TurnCountdown deadline={deadline} compact />}
      </div>
    );
  }
  if (p.kind === 'respond') {
    return (
      <div className="prompt prompt-respond">
        {hasDeadline && <TurnCountdown deadline={deadline} totalSecs={CHALLENGE_SECS} />}
        <span>
          <strong>{nameOf(p.player)}</strong> {t('盖牌出了一张，宣称')} <ClaimChip claim={p.claim} />。
          {t('看穿了就截牌翻开（夺牌堆 {n} 张），不疑就放行。', { n: view.pileCount })}
        </span>
        <div className={`ctrl-btns${tutorial ? ' tut-glow' : ''}`}>
          <button className="btn btn-accept" type="button" onClick={() => pass()}>
            {t('放行')} <kbd>空格</kbd>
          </button>
          <button className="btn btn-challenge" type="button" onClick={() => human({ type: 'Challenge' })}>
            {t('截牌！')} <kbd>D</kbd>
          </button>
        </div>
      </div>
    );
  }
  if (p.kind === 'penalty') {
    return <PenaltyPick need={p.rollsRemaining} dice={p.dice} />;
  }
  if (p.kind === 'play') {
    return (
      <div className={`prompt prompt-play${p.needsReveal ? ' prompt-reveal' : ''}`}>
        {p.needsReveal ? t('摸牌成功 · 请选择一张牌亮给全场') : t('轮到你出牌')}{!p.needsReveal && p.isFirst ? ` · ${t('你是首家')}` : ''}
        {showOnlineTimer && <TurnCountdown deadline={deadline} />}
      </div>
    );
  }
  return null;
}
