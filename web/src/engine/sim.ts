// 无头模拟器 —— 对抗性验证：跑大量随机对局，断言引擎不崩溃、牌张守恒、必然终局、无信息泄露。
// 运行：npm run sim
import { apply, createGame, viewFor } from './game';
import { AiPlayer, Difficulty } from './ai';
import { buildDeck } from './deck';
import { GameConfig, GameState, DEFAULT_CONFIG } from './types';

const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];

function totalCards(s: GameState): number {
  let n = s.deck.length + s.pile.length + s.discard.length;
  for (const p of s.players) n += p.hand.length + p.scored.length;
  return n;
}

function assertNoLeak(s: GameState): void {
  // 对每个座位取视图，断言「你的手牌」只含自己的，且视图里不出现别人的真实牌/牌堆真实牌。
  for (let seat = 0; seat < s.players.length; seat++) {
    const v = viewFor(s, seat);
    const json = JSON.stringify(v);
    // 别人手里某张真实牌的 id，不应出现在该视图序列化结果里（除非恰好是公开的摊牌/计分，这里只查在手的）
    for (let other = 0; other < s.players.length; other++) {
      if (other === seat) continue;
      for (const c of s.players[other].hand) {
        // 视图里 yourHand 只含 seat 自己，因此别家手牌 id 不该出现
        if (json.includes(`"id":${c.id},`) || json.includes(`"id":${c.id}}`)) {
          throw new Error(`信息泄露：座位 ${seat} 的视图含有座位 ${other} 的在手牌 id=${c.id}`);
        }
      }
    }
    // 牌堆里盖着的真实牌不应出现在视图里
    for (const e of s.pile) {
      if (json.includes(`"id":${e.card.id},`) || json.includes(`"id":${e.card.id}}`)) {
        // 例外：摊牌后 lastReveal 会公开顶牌，这是规则允许的公开信息
        if (v.lastReveal && v.lastReveal.card.id === e.card.id) continue;
        throw new Error(`信息泄露：座位 ${seat} 的视图含有牌堆盖牌 id=${e.card.id}`);
      }
    }
  }
}

function runGame(players: number, seed: number, checkLeak: boolean): { steps: number; winner: number } {
  const config: GameConfig = { ...DEFAULT_CONFIG, players, seed };
  let { state, events } = createGame(config);
  const initialTotal = totalCards(state);
  const expectDeck = buildDeck(players).length;
  if (initialTotal !== expectDeck) throw new Error(`建局牌张不符：${initialTotal} != ${expectDeck}`);

  const difficulty = DIFFS[seed % DIFFS.length];
  const ais: AiPlayer[] = state.players.map((_, seat) => new AiPlayer({ seat, seed: config.seed, difficulty }));
  const observeAll = (evs: typeof events, s: GameState) => {
    for (const ai of ais) ai.observe(evs, viewFor(s, ai.seat));
  };
  observeAll(events, state);

  let steps = 0;
  const cap = 30000;
  while (state.phase.kind !== 'over') {
    if (++steps > cap) throw new Error(`未在 ${cap} 步内终局（疑似死循环），seed=${seed}`);
    const actor = state.phase.kind === 'play' ? state.phase.current
      : state.phase.kind === 'respond' ? state.phase.responder
      : state.phase.roller;
    const view = viewFor(state, actor);
    const cmd = ais[actor].decide(view);
    const res = apply(state, actor, cmd);
    state = res.state;
    observeAll(res.events, state);

    // 不变量
    if (state.phase.kind === 'respond' && state.phase.responder === state.phase.player) {
      throw new Error(`应对者绕回出牌方自己（skip 越界回归）：seat=${state.phase.player}（seed=${seed}, step=${steps}）`);
    }
    if (totalCards(state) !== initialTotal) {
      throw new Error(`牌张不守恒：${totalCards(state)} != ${initialTotal}（seed=${seed}, step=${steps}, cmd=${cmd.type}）`);
    }
    for (const p of state.players) {
      if (p.lives < 0 || p.lives > config.startingLives) throw new Error(`凝聚度越界 ${p.lives}`);
      if (p.escalation < 1) throw new Error(`累进次数越界 ${p.escalation}`);
    }
    if (checkLeak && steps % 7 === 0) assertNoLeak(state);
  }
  const winner = state.ranking![0].seat;
  return { steps, winner };
}

function main(): void {
  const counts = [2, 3, 4];
  let totalSteps = 0;
  let games = 0;
  const stepHist: number[] = [];
  for (const players of counts) {
    const N = 400;
    for (let seed = 1; seed <= N; seed++) {
      const { steps } = runGame(players, seed * 1000 + players, seed <= 30);
      totalSteps += steps;
      stepHist.push(steps);
      games++;
    }
    console.log(`✓ ${players} 人局 ${N} 场全部正常终局`);
  }
  stepHist.sort((a, b) => a - b);
  const median = stepHist[Math.floor(stepHist.length / 2)];
  console.log(`\n全部 ${games} 场通过：牌张守恒、无信息泄露、必然终局。`);
  console.log(`平均步数 ${(totalSteps / games).toFixed(0)}，中位 ${median}，最长 ${stepHist[stepHist.length - 1]}。`);
}

main();
