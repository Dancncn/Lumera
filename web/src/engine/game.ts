// ============================================================
// 《源河》引擎核心 —— 持有全部真相的确定性状态机。
//   apply(state, seat, cmd) -> { state, events }   命令进、事件出（纯函数，不改入参）
//   viewFor(state, seat)    -> PlayerView          把真相投影成某座位有权看到的部分
// 真实手牌 / 盖着的真实牌 / 洗牌顺序，永远只在 GameState 里。
// ============================================================

import {
  Card,
  Claim,
  Color,
  COLORS,
  COLOR_META,
  Command,
  DEFAULT_CONFIG,
  GameConfig,
  GameEvent,
  GameState,
  LogEntry,
  PlayerState,
  PlayerView,
  PublicPlayer,
  RankEntry,
  ViewPrompt,
} from './types';
import { rollDie, shuffle } from './rng';

export class GameError extends Error {}
// 函数声明而非箭头：能被 TS 控制流分析识别为 never 收窄。
function illegal(msg: string): never {
  throw new GameError(msg);
}

/** 数字的「梯子值」：0 视为该色最大(=10)。 */
export const val = (num: number): number => (num === 0 ? 10 : num);

/** 一张宣称对当前梯顶是否合法（与真实牌无关，宣称可撒谎）。 */
export function isLegalClaim(ladderTop: Claim | null, claim: Claim, isFirst: boolean): boolean {
  if (claim.num < 0 || claim.num > 9) return false;
  if (isFirst || ladderTop === null) {
    return claim.num >= 1 && claim.num <= 3; // 首家：盖牌宣称某色 1..3
  }
  if (claim.color === ladderTop.color && val(claim.num) > val(ladderTop.num)) return true; // 同色更大
  if (claim.num === ladderTop.num && claim.color !== ladderTop.color) return true; // 同数字换色
  return false;
}

/** 枚举所有合法宣称（供 UI / AI 选择「要喊什么」）。 */
export function legalClaims(ladderTop: Claim | null, isFirst: boolean): Claim[] {
  const out: Claim[] = [];
  if (isFirst || ladderTop === null) {
    for (const color of COLORS) for (const num of [1, 2, 3]) out.push({ color, num });
    return out;
  }
  for (let num = 0; num <= 9; num++) {
    const c: Claim = { color: ladderTop.color, num };
    if (val(num) > val(ladderTop.num)) out.push(c); // 同色更大（含 0=10 顶格）
  }
  for (const color of COLORS) {
    if (color !== ladderTop.color) out.push({ color, num: ladderTop.num }); // 同数字换色
  }
  return out;
}

/** 摊牌：真实牌是否与宣称相符（万能牌恒判真）。 */
function matchesClaim(card: Card, claim: Claim): boolean {
  if (card.kind === 'wild') return true;
  if (card.kind === 'number') return card.color === claim.color && card.num === claim.num;
  return false; // 功能牌不会盖着进牌堆
}

const aliveCount = (s: GameState): number => s.players.filter((p) => !p.out).length;

/** 沿当前方向走到下一个存活座位。 */
function step(s: GameState, from: number, dir: 1 | -1): number {
  const n = s.players.length;
  let i = from;
  for (let k = 0; k < n; k++) {
    i = (i + dir + n) % n;
    if (!s.players[i].out) return i;
  }
  return from;
}

/**
 * 下一个行动者：先走一步，再额外跳过 skipExtra 个存活玩家。
 * skipExtra 对「其他存活玩家数」取模，保证结果永远不会绕一圈回到 from 自己
 * （否则连甩多张「禁止」可能让出牌方对自己的牌做接受/质疑）。
 */
function advance(s: GameState, from: number, dir: 1 | -1, skipExtra: number): number {
  const others = aliveCount(s) - 1;
  const eff = others > 0 ? skipExtra % others : 0;
  let seat = step(s, from, dir);
  for (let k = 0; k < eff; k++) seat = step(s, seat, dir);
  return seat;
}

// 宣称 token（纯数据，前端根据语言渲染显示名）：⟦色:数⟧
function claimTok(c: Color, num: number): string {
  return `⟦${c}:${num}⟧`;
}

// ---------------- 事件 → 结构化日志（tpl 中文模板 = i18n key） ----------------
function logLine(s: GameState, ev: GameEvent): LogEntry | null {
  const nm = (seat: number) => s.players[seat]?.name ?? `#${seat}`;
  switch (ev.type) {
    case 'TurnStarted':
      return ev.isFirst
        ? { tpl: '—— 轮到 {name}（首家·重启梯子）', p: { name: nm(ev.seat) } }
        : { tpl: '—— 轮到 {name}（接牌）', p: { name: nm(ev.seat) } };
    case 'FunctionalPlayed':
      return ev.func === 'reverse'
        ? { tpl: '{name} 明牌甩出「转向」', p: { name: nm(ev.seat) } }
        : { tpl: '{name} 明牌甩出「禁止」', p: { name: nm(ev.seat) } };
    case 'DirectionReversed':
      return { tpl: ev.direction === 1 ? '方向反转，改顺时针' : '方向反转，改逆时针' };
    case 'CardDrawn':
      return { tpl: '{name} 摸了 {n} 张', p: { name: nm(ev.seat), n: String(ev.count) } };
    case 'CardPlayed':
      return {
        tpl: ev.endsLadder ? '{name} 盖牌出 1 张，宣称 {claim}（打 0·终结本梯）' : '{name} 盖牌出 1 张，宣称 {claim}',
        p: { name: nm(ev.seat), claim: claimTok(ev.claim.color, ev.claim.num) },
      };
    case 'Fallback':
      return { tpl: '{name} 无数字牌可出，亮手兜底、弃功能、摸一张', p: { name: nm(ev.seat) } };
    case 'Challenged':
      return { tpl: '{challenger} 截下 {against} 的牌，要他摊开对质！', p: { challenger: nm(ev.challenger), against: nm(ev.against) } };
    case 'CardRevealed': {
      const cardStr = ev.card.kind === 'wild' ? '万能牌（恒判真）' : ev.card.kind === 'number' ? claimTok(ev.card.color, ev.card.num) : '功能牌';
      return { tpl: '摊牌！真实是 {card} —— {verdict}', p: { card: cardStr, verdict: ev.truthful ? '宣称为真' : '撒谎被抓' } };
    }
    case 'PileTaken':
      return { tpl: '{name} 收走牌堆 {n} 张，计入计分区', p: { name: nm(ev.seat), n: String(ev.count) } };
    case 'TokenAwarded':
      return { tpl: '{name} 领取计分卡 +{v}（打 0 的勇气奖励）', p: { name: nm(ev.seat), v: String(ev.value) } };
    case 'RanOut':
      return { tpl: '{name} 清空手牌「跑成了」，补满手牌继续', p: { name: nm(ev.seat) } };
    case 'PenaltyStarted':
      return { tpl: '{name} 受罚：源涌起，本轮投 {n} 次', p: { name: nm(ev.seat), n: String(ev.rolls) } };
    case 'DiceRolled':
      return { tpl: '{name} 赌 {c} 点，掷出 {r} —— {result}', p: { name: nm(ev.seat), c: String(ev.chosen), r: String(ev.rolled), result: ev.hit ? '被淹没（中）' : '险过' } };
    case 'Returned':
      return { tpl: '{name} 一缕念被收回源头，凝聚度 {n}', p: { name: nm(ev.seat), n: String(ev.livesLeft) } };
    case 'Survived':
      return { tpl: '{name} 本轮全数险过，未损凝聚（下次受罚累进 +1）', p: { name: nm(ev.seat) } };
    case 'PlayerOut':
      return { tpl: '{name} 凝聚耗尽，复归于源（出局）', p: { name: nm(ev.seat) } };
    case 'GameOver':
      return { tpl: '—— 本局终了，诸念归源结算 ——' };
    default:
      return null;
  }
}

function emit(s: GameState, events: GameEvent[], ev: GameEvent): void {
  events.push(ev);
  const entry = logLine(s, ev);
  if (entry) s.log.push(entry);
}

// ---------------- 摸牌 / 终局 ----------------
function drawCards(s: GameState, events: GameEvent[], seat: number, count: number): void {
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    const c = s.deck.pop();
    if (!c) break;
    s.players[seat].hand.push(c);
    drawn++;
  }
  if (drawn > 0) emit(s, events, { type: 'CardDrawn', seat, count: drawn });
}

function endGame(s: GameState, events: GameEvent[]): void {
  const ranking: RankEntry[] = s.players
    .map((p) => {
      const livesLost = s.config.startingLives - p.lives;
      const penalty = livesLost * s.config.lifeLossValue; // 每命 -5；满 3 命即 -15
      return {
        seat: p.seat,
        name: p.name,
        score: p.scored.length + p.tokens - penalty,
        scoredCount: p.scored.length,
        tokenValue: p.tokens,
        livesLost,
        out: p.out,
      };
    })
    .sort((a, b) => b.score - a.score);
  s.ranking = ranking;
  s.phase = { kind: 'over' };
  s.lastReveal = undefined;
  emit(s, events, { type: 'GameOver', ranking });
}

/** 开启一个新的出牌回合（含：终局检查 + 空手补牌防死锁 + TurnStarted）。 */
function startPlayTurn(s: GameState, events: GameEvent[], current: number, isFirst: boolean): void {
  if (aliveCount(s) <= 1) return endGame(s, events); // 仅剩一缕
  if (s.deck.length === 0) return endGame(s, events); // 牌库摸空（主终局条件）
  if (s.players[current].hand.length === 0) {
    drawCards(s, events, current, s.config.refillTo); // 防止「最后一张被抓」后空手死锁
    if (s.deck.length === 0) return endGame(s, events);
  }
  s.lastReveal = undefined;
  s.phase = { kind: 'play', current, isFirst, hasDrawn: false };
  emit(s, events, { type: 'TurnStarted', seat: current, isFirst });
}

// ---------------- 牌堆结算（被收走 / 跑成补牌） ----------------
function takePile(s: GameState, events: GameEvent[], winner: number): void {
  const count = s.pile.length;
  for (const e of s.pile) s.players[winner].scored.push(e.card);
  s.pile = [];
  emit(s, events, { type: 'PileTaken', seat: winner, count });
}

// ---------------- 受罚（俄罗斯轮盘子流程） ----------------
function startPenalty(s: GameState, events: GameEvent[], roller: number): void {
  s.ladderTop = null;
  s.pendingSkip = 0;
  const rolls = s.players[roller].escalation;
  s.phase = { kind: 'penalty', roller, rollsRemaining: rolls };
  emit(s, events, { type: 'PenaltyStarted', seat: roller, rolls });
}

// ============================================================
// 建局
// ============================================================
export interface SeatInit {
  name: string;
  isAI: boolean;
}

export function createGame(
  config: GameConfig,
  seats?: SeatInit[],
  firstSeat?: number,
  deckOrder?: Card[],
): { state: GameState; events: GameEvent[] } {
  const players: PlayerState[] = [];
  const aiNames = ['Aurel', 'Selvar', 'Verda', 'Thalos'];
  for (let i = 0; i < config.players; i++) {
    const init = seats?.[i];
    players.push({
      seat: i,
      name: init ? init.name : i === 0 ? '你 · Lumir' : aiNames[i % aiNames.length],
      isAI: init ? init.isAI : i !== 0,
      hand: [],
      lives: config.startingLives,
      scored: [],
      tokens: 0,
      escalation: 1,
      out: false,
    });
  }

  const built = buildAndShuffle(config);
  // deckOrder：新手引导用的固定牌序（保证演示 0/万能/跑成）；其余一律随机洗牌。
  const s: GameState = {
    config,
    players,
    deck: deckOrder ?? built.deck,
    pile: [],
    discard: [],
    ladderTop: null,
    direction: 1,
    pendingSkip: 0,
    phase: { kind: 'over' }, // 占位，下面 startPlayTurn 覆盖
    rng: built.rng,
    log: [{ tpl: '一条流转的光裂成四道，轮子已经在转了。' }],
    seq: 0,
  };

  // 发牌
  for (let r = 0; r < config.startingHand; r++) {
    for (const p of players) {
      const c = s.deck.pop();
      if (c) p.hand.push(c);
    }
  }

  const events: GameEvent[] = [];
  // 定首家：默认随机；新手引导固定座位（让你先手，教学顺序顺）
  const r = rollDie(s.rng);
  s.rng = r.state;
  const first = firstSeat != null ? firstSeat % config.players : (r.rolled - 1) % config.players;
  startPlayTurn(s, events, first, true);
  return { state: s, events };
}

function buildAndShuffle(config: GameConfig): { deck: Card[]; rng: number } {
  // 延迟引入避免循环依赖
  const cards = buildDeckInline(config.players);
  const sh = shuffle(cards, config.seed >>> 0);
  return { deck: sh.arr, rng: sh.state };
}

type CardSpec =
  | { kind: 'number'; color: Color; num: number }
  | { kind: 'functional'; func: 'reverse' | 'skip' }
  | { kind: 'wild' };

function buildDeckInline(players: number): Card[] {
  const cards: Card[] = [];
  let id = 0;
  const push = (c: CardSpec) => cards.push({ ...c, id: id++ });
  for (const color of COLORS) {
    push({ kind: 'number', color, num: 0 });
    for (let n = 1; n <= 9; n++) {
      push({ kind: 'number', color, num: n });
      push({ kind: 'number', color, num: n });
    }
  }
  if (players > 2) {
    for (let i = 0; i < 8; i++) push({ kind: 'functional', func: 'reverse' });
    for (let i = 0; i < 8; i++) push({ kind: 'functional', func: 'skip' });
  }
  for (let i = 0; i < players; i++) push({ kind: 'wild' });
  return cards;
}

// 新手引导固定牌序：保证人类(seat0)起手就握有「0」与「万能牌」，
// 配合 Coach 依次演示「打0 / 万能牌 / 跑成」。其余玩家随手发。
export function buildTutorialDeck(): Card[] {
  const deck = buildDeckInline(2);
  const take = (pred: (c: Card) => boolean): Card => {
    const i = deck.findIndex(pred);
    return deck.splice(i < 0 ? deck.length - 1 : i, 1)[0];
  };
  const num = (color: Color, n: number) =>
    take((c) => c.kind === 'number' && c.color === color && c.num === n);
  // seat0（你）：先手能如实报「Aurel 1」起头；随后握有更大的 Aurel、万能牌、顶格的 0。
  const s0: Card[] = [
    num('aurel', 1),
    num('aurel', 3),
    num('aurel', 5),
    take((c) => c.kind === 'wild'),
    num('aurel', 7),
    num('aurel', 0),
  ];
  // seat1（AI）：随手一把，能跟也能诈。
  const s1: Card[] = [
    num('thalos', 2),
    num('verda', 4),
    num('selvar', 6),
    num('thalos', 8),
    num('verda', 3),
    num('selvar', 5),
  ];
  // 发牌走 pop()（队尾先出），轮流 seat0→seat1。把 dealOrder[0] 摆到牌堆末尾即可。
  const dealOrder: Card[] = [];
  for (let r = 0; r < 6; r++) {
    dealOrder.push(s0[r]);
    dealOrder.push(s1[r]);
  }
  return [...deck, ...dealOrder.slice().reverse()];
}

// ============================================================
// apply：吃一条命令，吐出新状态 + 事件
// ============================================================
export function apply(prev: GameState, seat: number, cmd: Command): { state: GameState; events: GameEvent[] } {
  const s: GameState = structuredClone(prev);
  const events: GameEvent[] = [];
  const ph = s.phase;

  if (ph.kind === 'over') illegal('对局已结束');

  // ---- 出牌阶段 ----
  if (ph.kind === 'play') {
    if (seat !== ph.current) illegal('还没轮到你');
    const me = s.players[seat];

    if (cmd.type === 'PlayFunctional') {
      if (ph.isFirst) illegal('首家不可用功能牌起手');
      const idx = me.hand.findIndex((c) => c.id === cmd.cardId);
      if (idx < 0) illegal('手牌中没有这张');
      const card = me.hand[idx];
      if (card.kind !== 'functional') illegal('这不是功能牌');
      me.hand.splice(idx, 1);
      s.discard.push(card); // 功能牌明牌甩出后离开博弈
      if (card.func === 'reverse') {
        s.direction = (s.direction * -1) as 1 | -1;
        emit(s, events, { type: 'FunctionalPlayed', seat, func: 'reverse' });
        emit(s, events, { type: 'DirectionReversed', direction: s.direction });
      } else {
        s.pendingSkip += 1;
        emit(s, events, { type: 'FunctionalPlayed', seat, func: 'skip' });
      }
      // 功能牌是附加动作：本回合仍须再出一张数字牌，停在原阶段。
      s.seq++;
      return { state: s, events };
    }

    if (cmd.type === 'Draw') {
      if (ph.isFirst) illegal('首家无摸牌选项');
      if (ph.hasDrawn) illegal('本回合已摸过牌');
      if (s.deck.length === 0) illegal('牌库已空');
      drawCards(s, events, seat, 1);
      if (s.deck.length === 0) {
        endGame(s, events);
      } else {
        s.phase = { kind: 'play', current: ph.current, isFirst: ph.isFirst, hasDrawn: true };
      }
      s.seq++;
      return { state: s, events };
    }

    if (cmd.type === 'Fallback') {
      const hasPlayable = me.hand.some((c) => c.kind === 'number' || c.kind === 'wild');
      if (hasPlayable) illegal('还有数字/万能牌可出，不能兜底');
      const funcIdx = me.hand.findIndex((c) => c.kind === 'functional');
      const revealed = me.hand.slice();
      emit(s, events, { type: 'Fallback', seat, revealed });
      if (funcIdx >= 0) s.discard.push(me.hand.splice(funcIdx, 1)[0]);
      drawCards(s, events, seat, 1);
      // 本回合结束：梯子不变、牌堆不变，推进到下一家（首家身份延续）。
      const next = advance(s, seat, s.direction, s.pendingSkip);
      s.pendingSkip = 0;
      startPlayTurn(s, events, next, ph.isFirst);
      s.seq++;
      return { state: s, events };
    }

    if (cmd.type === 'PlayCard') {
      const idx = me.hand.findIndex((c) => c.id === cmd.cardId);
      if (idx < 0) illegal('手牌中没有这张');
      const card = me.hand[idx];
      if (card.kind === 'functional') illegal('功能牌不能盖牌进梯子');
      if (!isLegalClaim(s.ladderTop, cmd.claim, ph.isFirst)) illegal('这个宣称接不上当前梯子');
      me.hand.splice(idx, 1);
      s.pile.push({ card, claim: cmd.claim, by: seat });
      const endsLadder = cmd.claim.num === 0;
      emit(s, events, { type: 'CardPlayed', seat, claim: cmd.claim, endsLadder });
      const responder = advance(s, seat, s.direction, s.pendingSkip);
      s.pendingSkip = 0;
      s.phase = { kind: 'respond', player: seat, responder };
      s.seq++;
      return { state: s, events };
    }

    illegal('当前阶段不接受这个命令');
  }

  // ---- 应对阶段（接受 / 质疑）：任何在场的非出牌方都可质疑，不只下家 ----
  if (ph.kind === 'respond') {
    const top = s.pile[s.pile.length - 1];
    const player = ph.player;

    if (cmd.type === 'Accept') {
      if (seat !== ph.responder) illegal('只有下家能放行');
      emit(s, events, { type: 'PlayAccepted', seat: player });
      const ranOut = s.players[player].hand.length === 0;

      if (top.claim.num === 0) {
        // 打 0：终结本梯、领计分卡、牌堆不清空
        s.players[player].tokens += s.config.tokenValueOnZero;
        emit(s, events, { type: 'TokenAwarded', seat: player, value: s.config.tokenValueOnZero });
        if (ranOut) {
          // 用最后一张牌宣称 0 且被放过：跑成了 → 收走牌堆 + 补满（§十一），与非 0 跑成一致
          takePile(s, events, player);
          emit(s, events, { type: 'RanOut', seat: player });
          drawCards(s, events, player, s.config.refillTo);
        }
        s.ladderTop = null;
        const leader = advance(s, player, s.direction, 0);
        startPlayTurn(s, events, leader, true);
      } else if (ranOut) {
        // 清空手牌「跑成了」：收走牌堆、补满、下家当首家
        takePile(s, events, player);
        emit(s, events, { type: 'RanOut', seat: player });
        drawCards(s, events, player, s.config.refillTo);
        s.ladderTop = null;
        const leader = advance(s, player, s.direction, 0);
        startPlayTurn(s, events, leader, true);
      } else {
        // 平稳过牌：梯子继续，应对者成为新的出牌人
        s.ladderTop = top.claim;
        startPlayTurn(s, events, ph.responder, false);
      }
      s.seq++;
      return { state: s, events };
    }

    if (cmd.type === 'Challenge') {
      if (seat === player) illegal('不能质疑自己刚出的牌');
      if (s.players[seat].out) illegal('已出局，不能质疑');
      emit(s, events, { type: 'Challenged', challenger: seat, against: player });
      const truthful = matchesClaim(top.card, top.claim);
      s.lastReveal = { seat: player, card: top.card, truthful };
      emit(s, events, { type: 'CardRevealed', seat: player, card: top.card, truthful });

      const punished = truthful ? seat : player; // 真→质疑方受罚；假→出牌方受罚
      const winner = truthful ? player : seat; // 赢家收走整摞牌堆
      const playerRanOut = truthful && s.players[player].hand.length === 0; // 跑成且质疑失败

      takePile(s, events, winner);
      if (playerRanOut) {
        emit(s, events, { type: 'RanOut', seat: player });
        drawCards(s, events, player, s.config.refillTo);
      }
      startPenalty(s, events, punished);
      s.seq++;
      return { state: s, events };
    }

    illegal('当前阶段只能接受或质疑');
  }

  // ---- 受罚阶段（轮盘） ----
  if (ph.kind === 'penalty') {
    if (seat !== ph.roller) illegal('只有受罚方能掷骰');
    if (cmd.type !== 'ChooseNumber') illegal('受罚阶段只能选点掷骰');
    if (cmd.n < 1 || cmd.n > 6) illegal('点数须在 1..6');

    const r = rollDie(s.rng);
    s.rng = r.state;
    const hit = r.rolled === cmd.n;
    emit(s, events, { type: 'DiceRolled', seat, chosen: cmd.n, rolled: r.rolled, hit });

    if (hit) {
      const p = s.players[seat];
      p.lives -= 1;
      if (s.config.escalationResetsOnHit) p.escalation = 1;
      emit(s, events, { type: 'Returned', seat, livesLeft: p.lives });
      if (p.lives <= 0) {
        p.out = true;
        emit(s, events, { type: 'PlayerOut', seat });
      }
      // 中枪保护期：受罚方让位，由下家当首家重启梯子
      const leader = advance(s, seat, s.direction, 0);
      startPlayTurn(s, events, leader, true);
    } else {
      const rem = ph.rollsRemaining - 1;
      if (rem <= 0) {
        // 本轮全数险过：未损命，但下次受罚累进 +1
        emit(s, events, { type: 'Survived', seat });
        s.players[seat].escalation += 1;
        startPlayTurn(s, events, seat, true); // 未中者自己当首家
      } else {
        s.phase = { kind: 'penalty', roller: seat, rollsRemaining: rem };
      }
    }
    s.seq++;
    return { state: s, events };
  }

  return illegal('未知阶段');
}

// ============================================================
// viewFor：把真相投影成某座位有权看到的过滤视图（系统的安全边界）
// ============================================================
function currentActor(s: GameState): number {
  switch (s.phase.kind) {
    case 'play':
      return s.phase.current;
    case 'respond':
      return s.phase.responder;
    case 'penalty':
      return s.phase.roller;
    default:
      return -1;
  }
}

function computePrompt(s: GameState, seat: number): ViewPrompt {
  if (s.phase.kind === 'over') return { kind: 'over' };
  const me = s.players[seat];
  if (me.out) return { kind: 'idle' };
  switch (s.phase.kind) {
    case 'play': {
      if (s.phase.current !== seat) return { kind: 'idle' };
      const onlyFunctional = me.hand.length > 0 && me.hand.every((c) => c.kind === 'functional');
      return {
        kind: 'play',
        isFirst: s.phase.isFirst,
        canDraw: !s.phase.isFirst && !s.phase.hasDrawn && s.deck.length > 0,
        canFallback: onlyFunctional,
      };
    }
    case 'respond':
      // 出牌方等待裁决；其余在场玩家都可质疑。
      if (seat === s.phase.player) return { kind: 'idle' };
      return { kind: 'respond', player: s.phase.player, claim: s.pile[s.pile.length - 1].claim };
    case 'penalty':
      if (s.phase.roller !== seat) return { kind: 'idle' };
      return { kind: 'penalty', roller: s.phase.roller, rollsRemaining: s.phase.rollsRemaining };
  }
}

export function viewFor(s: GameState, seat: number): PlayerView {
  const players: PublicPlayer[] = s.players.map((p) => ({
    seat: p.seat,
    name: p.name,
    isAI: p.isAI,
    lives: p.lives,
    handCount: p.hand.length,
    scoredCount: p.scored.length,
    tokenValue: p.tokens,
    escalation: p.escalation,
    out: p.out,
  }));
  return {
    you: seat,
    current: currentActor(s),
    direction: s.direction,
    startingLives: s.config.startingLives,
    players,
    yourHand: s.players[seat].hand.slice(), // 仅你自己的真实手牌
    ladderTop: s.ladderTop,
    pileCount: s.pile.length, // 仅数量，盖着的真实牌不出现在任何视图里
    deckCount: s.deck.length,
    prompt: computePrompt(s, seat),
    lastReveal: s.lastReveal, // 摊牌结果是公开信息
    ranking: s.ranking,
    log: s.log.slice(-50),
  };
}

/** 当前必须行动的座位（play→current，respond→responder，penalty→roller）。 */
export function actorOf(s: GameState): number {
  return currentActor(s);
}

/**
 * 应对阶段的信息：出牌方、若无人质疑则继续出牌的下家、以及所有可质疑座位（在场、非出牌方）。
 * 非应对阶段返回 null。供驱动循环开「质疑窗口」用。
 */
export function respondState(s: GameState): { player: number; responder: number; challengers: number[] } | null {
  if (s.phase.kind !== 'respond') return null;
  const { player, responder } = s.phase;
  const challengers = s.players.filter((p) => !p.out && p.seat !== player).map((p) => p.seat);
  return { player, responder, challengers };
}

export { DEFAULT_CONFIG };
export type { GameConfig };
