// 拟人 AI 对手：只吃 viewFor 给的过滤视图（与真人完全同构，结构上看不到牌库/他人手牌/盖牌）。
// 像人不像机器：性格档案 + 有限理性（会失误）+ 桌面阅读（只凭公开信息建模对手）+ 变化的思考节奏。
// 随机用注入式可种子化 RNG（每个 AI 一条独立流），同一局可复现、不同局有变数、同一局面不总做同一件事。

import { Card, Claim, Color, COLORS, Command, GameEvent, PlayerView } from './types';
import { isLegalClaim, legalClaims, val } from './game';
import { nextRng } from './rng';

type NumCard = Extract<Card, { kind: 'number' }>;

export type AiProfile = 'aggressive' | 'steady' | 'cautious' | 'capricious' | 'cunning';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'master';

export const PERSONA_LABEL: Record<AiProfile, string> = {
  aggressive: '激进',
  steady: '稳健',
  cautious: '谨慎',
  capricious: '善变',
  cunning: '狡黠',
};

export const PROFILE_ORDER: AiProfile[] = ['aggressive', 'steady', 'cautious', 'capricious', 'cunning'];

// 七个风格旋钮（0..1）：诈牌倾向 / 质疑倾向 / 冒险 / 看人（参考对手模型）/ 理性（多大概率走最优）/ 上头（受挫后波动）/ 耐心（思考更久）。
interface Traits {
  bluff: number;
  challenge: number;
  risk: number;
  read: number;
  rationality: number;
  tilt: number;
  patience: number;
}

const PROFILES: Record<AiProfile, Traits> = {
  aggressive: { bluff: 0.7, challenge: 0.75, risk: 0.8, read: 0.5, rationality: 0.55, tilt: 0.7, patience: 0.25 },
  steady: { bluff: 0.35, challenge: 0.45, risk: 0.4, read: 0.55, rationality: 0.8, tilt: 0.3, patience: 0.5 },
  cautious: { bluff: 0.2, challenge: 0.3, risk: 0.25, read: 0.65, rationality: 0.8, tilt: 0.25, patience: 0.8 },
  capricious: { bluff: 0.55, challenge: 0.6, risk: 0.65, read: 0.35, rationality: 0.35, tilt: 0.8, patience: 0.35 },
  cunning: { bluff: 0.55, challenge: 0.55, risk: 0.55, read: 0.85, rationality: 0.85, tilt: 0.35, patience: 0.6 },
};

const clamp = (x: number, lo = 0, hi = 1): number => (x < lo ? lo : x > hi ? hi : x);
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

function mixHash(seed: number, seat: number): number {
  let x = (seed ^ (seat + 1) * 0x9e3779b1) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

export function pickProfile(seed: number, seat: number): AiProfile {
  return PROFILE_ORDER[mixHash(seed, seat) % PROFILE_ORDER.length];
}

function applyDifficulty(t: Traits, d: Difficulty): Traits {
  if (d === 'easy') {
    return { ...t, rationality: t.rationality * 0.7, read: t.read * 0.55, challenge: t.challenge * 0.9 };
  }
  if (d === 'master') {
    return {
      bluff: clamp(t.bluff * 0.85 + 0.12),
      challenge: clamp(t.challenge * 1.15 + 0.10),
      risk: clamp(t.risk * 0.9 + 0.08),
      read: clamp(t.read * 1.35 + 0.18),
      rationality: clamp(t.rationality * 1.35 + 0.20),
      tilt: t.tilt * 0.5,
      patience: clamp(t.patience + 0.15),
    };
  }
  if (d === 'hard') {
    return { ...t, rationality: clamp(t.rationality * 1.2 + 0.12), read: clamp(t.read * 1.25 + 0.12), challenge: clamp(t.challenge * 1.1 + 0.05) };
  }
  return { ...t, rationality: clamp(t.rationality * 1.1 + 0.06), read: clamp(t.read * 1.12 + 0.06), challenge: clamp(t.challenge * 1.05 + 0.03) };
}

interface OppStat {
  claims: number;
  lies: number;
  truths: number;
  challenges: number;
}

function nextAlive(view: PlayerView, from: number, dir: 1 | -1): number {
  const n = view.players.length;
  let i = from;
  for (let k = 0; k < n; k++) {
    i = (i + dir + n) % n;
    if (!view.players[i].out) return i;
  }
  return from;
}

export class AiPlayer {
  readonly seat: number;
  readonly profile: AiProfile;
  private difficulty: Difficulty;
  private traits: Traits;
  private rng: number;
  private opp = new Map<number, OppStat>();
  private seen = new Map<string, number>();
  private tilt = 0;
  private lastDelay = 600;

  constructor(opts: { seat: number; seed: number; profile?: AiProfile; difficulty?: Difficulty }) {
    this.seat = opts.seat;
    this.profile = opts.profile ?? pickProfile(opts.seed, opts.seat);
    this.difficulty = opts.difficulty ?? 'normal';
    this.traits = applyDifficulty(PROFILES[this.profile], this.difficulty);
    this.rng = (opts.seed ^ Math.imul(opts.seat + 1, 0x9e3779b1)) >>> 0;
  }

  private rand(): number {
    const r = nextRng(this.rng);
    this.rng = r.state;
    return r.value;
  }

  private stat(seat: number): OppStat {
    let s = this.opp.get(seat);
    if (!s) {
      s = { claims: 0, lies: 0, truths: 0, challenges: 0 };
      this.opp.set(seat, s);
    }
    return s;
  }

  private recordCard(card: Card): void {
    if (this.rand() > 0.3 + this.traits.read * 0.7) return;
    const key = card.kind === 'number' ? `${card.color}:${card.num}`
              : card.kind === 'wild' ? 'wild'
              : 'func';
    this.seen.set(key, (this.seen.get(key) ?? 0) + 1);
  }

  private countRemaining(color: Color, num: number, view: PlayerView): { remaining: number; unseenWilds: number } {
    const total = num === 0 ? 1 : 2;
    const inHand = view.yourHand.filter((c) => c.kind === 'number' && c.color === color && c.num === num).length;
    const seenCount = this.seen.get(`${color}:${num}`) ?? 0;
    const remaining = Math.max(0, total - inHand - seenCount);

    const totalWilds = view.players.length;
    const wildsInHand = view.yourHand.filter((c) => c.kind === 'wild').length;
    const wildsSeen = this.seen.get('wild') ?? 0;
    const unseenWilds = Math.max(0, totalWilds - wildsInHand - wildsSeen);

    return { remaining, unseenWilds };
  }

  private mcLieProb(view: PlayerView, claim: Claim, playerSeat: number, runs: number): number {
    let matchCount = 0;
    let otherCount = 0;
    for (const color of COLORS) {
      for (let num = 0; num <= 9; num++) {
        const total = num === 0 ? 1 : 2;
        const inHand = view.yourHand.filter((c) => c.kind === 'number' && c.color === color && c.num === num).length;
        const s = this.seen.get(`${color}:${num}`) ?? 0;
        const rem = Math.max(0, total - inHand - s);
        if (color === claim.color && num === claim.num) matchCount += rem;
        else otherCount += rem;
      }
    }
    const totalWilds = view.players.length;
    const wildsInHand = view.yourHand.filter((c) => c.kind === 'wild').length;
    const wildsSeen = this.seen.get('wild') ?? 0;
    const wildPool = Math.max(0, totalWilds - wildsInHand - wildsSeen);

    if (view.players.length > 2) {
      const funcInHand = view.yourHand.filter((c) => c.kind === 'functional').length;
      const funcSeen = this.seen.get('func') ?? 0;
      otherCount += Math.max(0, 16 - funcInHand - funcSeen);
    }

    const goodCount = matchCount + wildPool;
    const poolSize = goodCount + otherCount;
    const handSize = Math.min((view.players[playerSeat]?.handCount ?? 0) + 1, poolSize);
    if (poolSize === 0 || handSize <= 0) return 1;

    let truthful = 0;
    for (let r = 0; r < runs; r++) {
      let g = goodCount;
      let t = poolSize;
      let found = false;
      for (let d = 0; d < handSize && t > 0; d++) {
        if (this.rand() * t < g) { found = true; break; }
        t--;
      }
      if (found) truthful++;
    }
    return 1 - truthful / runs;
  }

  private smartBluffClaim(claims: Claim[], view: PlayerView): Claim {
    if (this.traits.read < 0.5 || claims.length <= 1) return this.minEscalation(claims);
    let bestClaim = claims[0];
    let bestScore = -Infinity;
    for (const c of claims) {
      const { remaining, unseenWilds } = this.countRemaining(c.color, c.num, view);
      const score = (remaining + unseenWilds * 0.5) * 2 - val(c.num) * 0.3;
      if (score > bestScore) { bestScore = score; bestClaim = c; }
    }
    if (this.rand() > this.traits.read) return this.minEscalation(claims);
    return bestClaim;
  }

  private riskScore(view: PlayerView): number {
    const me = view.players[view.you];
    if (!me) return 0.5;
    const esc = clamp((me.escalation - 1) * 0.25);
    const fragile = clamp(1 - (me.lives - 1) / Math.max(1, view.startingLives - 1));
    const alive = view.players.filter((p) => !p.out && p.seat !== view.you);
    const othersAvg = alive.length ? alive.reduce((s, p) => s + p.handCount, 0) / alive.length : 6;
    const ahead = clamp((othersAvg - me.handCount) / 5);
    return clamp(esc * 0.35 + fragile * 0.35 + ahead * 0.15 + esc * fragile * 0.15);
  }

  private opponentThreat(view: PlayerView, seat: number): number {
    const p = view.players[seat];
    if (!p || p.out) return 0;
    const handThreat = clamp(1 - p.handCount / 6);
    const scoreThreat = clamp(p.scoredCount / 15);
    return handThreat * 0.6 + scoreThreat * 0.4;
  }

  // 全员可质疑：被抓概率 = 1 − ∏(1 − trigger_i)，而非仅看下家。
  private aggregateDanger(view: PlayerView): number {
    let pSafe = 1;
    for (const p of view.players) {
      if (p.out || p.seat === view.you) continue;
      pSafe *= 1 - this.trigger(p.seat);
    }
    return 1 - pSafe;
  }

  private strategicBluffClaim(claims: Claim[], view: PlayerView): Claim {
    if (claims.length <= 1) return claims[0];
    const danger = this.aggregateDanger(view);
    let bestClaim = claims[0];
    let bestScore = -Infinity;
    for (const c of claims) {
      const { remaining, unseenWilds } = this.countRemaining(c.color, c.num, view);
      let score = (remaining + unseenWilds * 0.4) * 2;
      if (view.ladderTop) {
        const step = val(c.num) - val(view.ladderTop.num);
        if (c.color === view.ladderTop.color && step > 0 && step <= 2) score += 1.0;
        if (c.color !== view.ladderTop.color && c.num === view.ladderTop.num) score += 0.7;
      }
      score -= val(c.num) * 0.15;
      if (danger > 0.4) score += remaining * danger * 0.5;
      if (danger < 0.3) score += val(c.num) * 0.1;
      if (score > bestScore) {
        bestScore = score;
        bestClaim = c;
      }
    }
    return bestClaim;
  }

  private pickClaim(claims: Claim[], view: PlayerView): Claim {
    return this.traits.rationality > 0.7 ? this.strategicBluffClaim(claims, view) : this.smartBluffClaim(claims, view);
  }

  observe(events: GameEvent[], _view: PlayerView): void {
    this.tilt *= 0.85;
    for (const e of events) {
      switch (e.type) {
        case 'CardPlayed':
          if (e.seat !== this.seat) this.stat(e.seat).claims++;
          break;
        case 'CardRevealed':
          this.recordCard(e.card);
          if (e.seat !== this.seat) {
            if (e.truthful) this.stat(e.seat).truths++;
            else this.stat(e.seat).lies++;
          } else if (!e.truthful) {
            this.tilt = clamp(this.tilt + 0.5 * this.traits.tilt + 0.2);
          }
          break;
        case 'Fallback':
          for (const c of e.revealed) this.recordCard(c);
          break;
        case 'Challenged':
          if (e.challenger !== this.seat) this.stat(e.challenger).challenges++;
          break;
        case 'Returned':
          if (e.seat === this.seat) this.tilt = clamp(this.tilt + 0.4 * this.traits.tilt + 0.15);
          break;
      }
    }
  }

  // 估对手诈牌率：被翻出的真/假为证据，证据少时回落到基础先验。
  private bluffRate(seat: number): number {
    const s = this.opp.get(seat);
    const prior = 0.4;
    const priorN = 2;
    if (!s) return prior;
    return (s.lies + prior * priorN) / (s.lies + s.truths + priorN);
  }

  // 估对手有多爱质疑（trigger-happy）：质疑越多越不敢对他诈。
  private trigger(seat: number): number {
    const s = this.opp.get(seat);
    if (!s) return 0.35;
    return clamp(s.challenges / (s.challenges + 3));
  }

  decide(view: PlayerView): Command {
    const p = view.prompt;
    switch (p.kind) {
      case 'penalty':
        this.lastDelay = this.think(420, 700, 0.2);
        return { type: 'ChooseNumber', n: 1 + Math.floor(this.rand() * 6) };
      case 'respond':
        return this.decideRespond(view, p.claim, p.player);
      case 'play':
        return this.decidePlay(view, p.isFirst, p.canDraw);
      default:
        this.lastDelay = 300;
        return { type: 'Accept' };
    }
  }

  delayMs(): number {
    return this.lastDelay;
  }

  private decideRespond(view: PlayerView, claim: Claim, player: number): Command {
    const { remaining, unseenWilds } = this.countRemaining(claim.color, claim.num, view);
    const impossible = remaining <= 0 && unseenWilds <= 0;

    // ── 地板：数学必诈 → 近乎必抓 ──
    if (impossible) {
      this.lastDelay = this.think(600, 800, 0.3);
      const missRate = 0.02 + (1 - this.traits.rationality) * 0.03;
      return this.rand() >= missRate ? { type: 'Challenge' } : { type: 'Accept' };
    }

    // ── 估 pLie：牌张计数 / 对手历史 / MC 三源合一 ──
    const maxCopies = claim.num === 0 ? 1 : 2;
    const iHold = view.yourHand.filter((c) => c.kind === 'number' && c.color === claim.color && c.num === claim.num).length;

    let countLie = clamp(1 - (remaining + unseenWilds * 0.4) / Math.max(1, maxCopies));
    const histLie = 0.32 + this.traits.read * (this.bluffRate(player) - 0.4) * 0.7;
    const valueBias = (val(claim.num) / 10) * 0.12;

    let pLie: number;
    if (this.traits.rationality > 0.65) {
      const mcRuns = this.traits.rationality > 0.8 ? 60 : 30;
      const mcLie = this.mcLieProb(view, claim, player, mcRuns);
      pLie = mix(countLie, mcLie, 0.6) * 0.65 + histLie * 0.25 + valueBias;
    } else {
      pLie = countLie * 0.5 + histLie * 0.35 + (iHold / maxCopies) * 0.15 + valueBias;
    }
    if (remaining <= 0) pLie = Math.max(pLie, 0.7);
    pLie = clamp(pLie, 0.05, 0.97);

    // ── 决策：高理性走 EV，低理性走 sigmoid ──
    let pCh: number;
    if (this.traits.rationality > 0.6) {
      const pile = Math.max(view.pileCount, 1);
      const me = view.players[view.you];
      const escRisk = (me?.escalation ?? 1) * 1.5;
      const evThreshold = (pile + escRisk) / (2 * pile + escRisk);
      const adjusted = evThreshold - (this.traits.challenge - 0.5) * 0.12 - this.tilt * 0.06;
      pCh = pLie > adjusted ? clamp(0.7 + (pLie - adjusted) * 2) : clamp(0.15 + (pLie - adjusted) * 1.5);
    } else {
      let thr = 0.55;
      thr -= (this.traits.challenge - 0.5) * 0.5;
      thr -= Math.min(view.pileCount, 10) * 0.012;
      thr -= this.tilt * 0.1;
      thr = clamp(thr, 0.18, 0.85);
      const margin = pLie - thr;
      pCh = sigmoid(margin * (4 + this.traits.rationality * 8));
      const floor = 0.04 + (1 - this.traits.rationality) * 0.10;
      pCh = clamp(pCh, floor, 1 - floor);
    }

    if (this.traits.rationality > 0.7) {
      const risk = this.riskScore(view);
      const threat = this.opponentThreat(view, player);
      pCh -= risk * 0.12;
      pCh += threat * 0.18;
      pCh = clamp(pCh, 0.03, 0.98);
    }

    const hardness = 1 - Math.min(1, Math.abs(pLie - 0.5) * 3);
    this.lastDelay = this.think(820, 1500, hardness);
    return this.rand() < pCh ? { type: 'Challenge' } : { type: 'Accept' };
  }

  private decidePlay(view: PlayerView, isFirst: boolean, canDraw: boolean): Command {
    const hand = view.yourHand;
    const playable = hand.filter((c) => c.kind === 'number' || c.kind === 'wild');
    if (playable.length === 0) {
      this.lastDelay = this.think(520, 700, 0.3);
      return { type: 'Fallback' };
    }

    if (!isFirst) {
      const funcs = hand.filter((c) => c.kind === 'functional');
      if (funcs.length) {
        const responder = nextAlive(view, view.you, view.direction);
        const aggDanger = this.aggregateDanger(view);
        const respTrig = this.trigger(responder);
        let pFunc = 0.05 + this.traits.risk * 0.08 + aggDanger * 0.14 * this.traits.read;
        if (this.traits.rationality > 0.7) {
          const risk = this.riskScore(view);
          const respThreat = this.opponentThreat(view, responder);
          pFunc += risk * 0.15 + respThreat * 0.20;
        }
        pFunc *= 0.6 + this.rand() * 0.8;
        if (this.rand() < clamp(pFunc, 0, 0.55)) {
          const skip = funcs.find((c) => c.kind === 'functional' && c.func === 'skip');
          const rev = funcs.find((c) => c.kind === 'functional' && c.func === 'reverse');
          const pick = respTrig > 0.5 && skip ? skip : rev ?? skip ?? funcs[0];
          this.lastDelay = this.think(700, 800, 0.5);
          return { type: 'PlayFunctional', cardId: pick.id };
        }
      }
    }

    const numbers = hand.filter((c): c is NumCard => c.kind === 'number');
    const wild = hand.find((c) => c.kind === 'wild');

    if (isFirst) return this.firstPlay(numbers, playable, view);
    return this.followPlay(view, numbers, wild, canDraw);
  }

  private firstPlay(numbers: NumCard[], playable: Card[], view: PlayerView): Command {
    const low = numbers.filter((c) => c.num >= 1 && c.num <= 3).sort((a, b) => a.num - b.num);
    const bluffChance = this.traits.bluff * 0.35 * (low.length ? 1 : 4);
    if (low.length && this.rand() > bluffChance) {
      if (this.traits.rationality > 0.7 && low.length > 1) {
        const cc = new Map<Color, number>();
        for (const c of view.yourHand) if (c.kind === 'number') cc.set(c.color, (cc.get(c.color) ?? 0) + 1);
        low.sort((a, b) => {
          const d = (cc.get(b.color) ?? 0) - (cc.get(a.color) ?? 0);
          return d !== 0 ? d : a.num - b.num;
        });
      }
      const honest = this.traits.risk > 0.6 && this.rand() < this.traits.risk ? low[low.length - 1] : low[0];
      this.lastDelay = this.think(640, 700, 0.35);
      return { type: 'PlayCard', cardId: honest.id, claim: { color: honest.color, num: honest.num } };
    }
    const dump = numbers.length ? [...numbers].sort((a, b) => val(b.num) - val(a.num))[0] : playable[0];
    if (this.traits.rationality > 0.7) {
      const cc = new Map<Color, number>();
      for (const c of view.yourHand) if (c.kind === 'number') cc.set(c.color, (cc.get(c.color) ?? 0) + 1);
      const bestColor = COLORS.reduce((best, col) => ((cc.get(col) ?? 0) > (cc.get(best) ?? 0) ? col : best), COLORS[0]);
      this.lastDelay = this.think(820, 1100, 0.6);
      return { type: 'PlayCard', cardId: dump.id, claim: { color: bestColor, num: 1 + Math.floor(this.rand() * 3) } };
    }
    this.lastDelay = this.think(820, 1100, 0.6);
    return { type: 'PlayCard', cardId: dump.id, claim: { color: COLORS[Math.floor(this.rand() * 4)], num: 1 + Math.floor(this.rand() * 3) } };
  }

  private followPlay(view: PlayerView, numbers: NumCard[], wild: Card | undefined, canDraw: boolean): Command {
    const honest = numbers
      .map((c) => ({ c, claim: { color: c.color, num: c.num } as Claim }))
      .filter((x) => isLegalClaim(view.ladderTop, x.claim, false))
      .sort((a, b) => val(a.claim.num) - val(b.claim.num));

    if (honest.length) {
      const bluffInstead = this.rand() < this.traits.bluff * 0.18 && numbers.length > honest.length;
      if (!bluffInstead) {
        const pick = this.pickEscalation(honest);
        this.lastDelay = this.think(560, 800, 0.3);
        return { type: 'PlayCard', cardId: pick.c.id, claim: pick.claim };
      }
    }

    const claims = legalClaims(view.ladderTop, false);
    const danger = this.aggregateDanger(view);

    if (canDraw && honest.length === 0) {
      let pDraw = clamp(0.35 + (1 - this.traits.risk) * 0.35 + this.traits.patience * 0.15 - danger * 0.1);
      if (this.traits.rationality > 0.7) pDraw += this.riskScore(view) * 0.15;
      if (this.rand() < pDraw) {
        this.lastDelay = this.think(620, 700, 0.4);
        return { type: 'Draw' };
      }
    }

    if (wild && claims.length) {
      const keepWild = this.rand() < this.traits.risk * 0.45 && honest.length > 0;
      if (!keepWild) {
        this.lastDelay = this.think(700, 900, 0.45);
        return { type: 'PlayCard', cardId: wild.id, claim: this.pickClaim(claims, view) };
      }
    }

    if (numbers.length && claims.length) {
      let bluffAppetite = clamp(this.traits.bluff + this.tilt * 0.2 - danger * 0.5 * this.traits.read);
      if (this.traits.rationality > 0.7) bluffAppetite -= this.riskScore(view) * 0.2;
      if (this.rand() < clamp(0.35 + bluffAppetite * 0.6) || (!canDraw && !wild)) {
        const dump = [...numbers].sort((a, b) => val(b.num) - val(a.num))[0];
        this.lastDelay = this.think(880, 1300, 0.65);
        return { type: 'PlayCard', cardId: dump.id, claim: this.pickClaim(claims, view) };
      }
      if (canDraw) {
        this.lastDelay = this.think(560, 600, 0.4);
        return { type: 'Draw' };
      }
      const dump = [...numbers].sort((a, b) => val(b.num) - val(a.num))[0];
      this.lastDelay = this.think(880, 1200, 0.65);
      return { type: 'PlayCard', cardId: dump.id, claim: this.pickClaim(claims, view) };
    }

    if (wild && claims.length) {
      this.lastDelay = this.think(700, 800, 0.5);
      return { type: 'PlayCard', cardId: wild.id, claim: this.pickClaim(claims, view) };
    }
    this.lastDelay = this.think(520, 600, 0.4);
    return { type: 'Fallback' };
  }

  private pickEscalation(honest: { c: NumCard; claim: Claim }[]): { c: NumCard; claim: Claim } {
    if (this.rand() > this.traits.risk) return honest[0];
    const top = honest.slice(Math.floor(honest.length / 2));
    return top[Math.floor(this.rand() * top.length)] ?? honest[honest.length - 1];
  }

  private minEscalation(claims: Claim[]): Claim {
    let best = claims[0];
    for (const c of claims) if (val(c.num) < val(best.num)) best = c;
    const ties = claims.filter((c) => val(c.num) === val(best.num));
    return ties[Math.floor(this.rand() * ties.length)];
  }

  // 思考停顿：基础 + 难度跨度 × 本次抉择的艰难程度，再乘耐心与抖动；艰难抉择停更久，绝不秒回也不匀速。
  private think(base: number, span: number, hardness: number): number {
    const slow = 0.65 + this.traits.patience * 0.8;
    let ms = (base + span * clamp(hardness)) * slow;
    ms *= 0.75 + this.rand() * 0.6;
    return Math.round(clamp(ms, 240, 3200));
  }
}

// 旧接口：无状态便捷决策（仅供测试/兜底用，无对手记忆）。真正对局由各 driver 持久的 AiPlayer 驱动。
const scratch = new Map<number, AiPlayer>();
export function chooseCommand(view: PlayerView): Command {
  let ai = scratch.get(view.you);
  if (!ai) {
    ai = new AiPlayer({ seat: view.you, seed: 0x5eed ^ (view.you + 1) });
    scratch.set(view.you, ai);
  }
  return ai.decide(view);
}
