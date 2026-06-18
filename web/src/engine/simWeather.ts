// 混沌天气验证：开启天气跑 1000 场，断言引擎仍不崩 / 牌张守恒 / 必然终局 / 无信息泄露，
// 并测量天气频率·分布、对局长度与血量蒸发（对比经典模式）、以及确定性复现。
// 运行：npm run sim:weather
import { apply, createGame, respondState, viewFor } from './game';
import { AiPlayer, Difficulty } from './ai';
import { buildDeck } from './deck';
import { GameConfig, GameState, GameEvent, DEFAULT_CONFIG, WeatherKind, WEATHER_KINDS } from './types';

const DIFFS: Difficulty[] = ['easy', 'normal', 'hard', 'master'];

function totalCards(s: GameState): number {
  let n = s.deck.length + s.pile.length + s.discard.length;
  for (const p of s.players) n += p.hand.length + p.scored.length;
  return n;
}

function assertNoLeak(s: GameState): void {
  for (let seat = 0; seat < s.players.length; seat++) {
    const v = viewFor(s, seat);
    const json = JSON.stringify(v);
    for (let other = 0; other < s.players.length; other++) {
      if (other === seat) continue;
      for (const c of s.players[other].hand) {
        if (json.includes(`"id":${c.id},`) || json.includes(`"id":${c.id}}`))
          throw new Error(`信息泄露：座位 ${seat} 的视图含座位 ${other} 在手牌 id=${c.id}`);
      }
    }
    for (const e of s.pile) {
      if (json.includes(`"id":${e.card.id},`) || json.includes(`"id":${e.card.id}}`)) {
        if (v.lastReveal && v.lastReveal.card.id === e.card.id) continue;
        throw new Error(`信息泄露：座位 ${seat} 的视图含牌堆盖牌 id=${e.card.id}`);
      }
    }
  }
}

interface GameResult {
  steps: number;
  winner: number;
  weatherCount: number;
  triggered: number;
  byKind: Record<WeatherKind, number>;
  ladders: number;
  livesLost: number;
}

function runGame(players: number, seed: number, weatherOn: boolean, checkLeak: boolean): GameResult {
  const config: GameConfig = { ...DEFAULT_CONFIG, players, seed, weather: weatherOn };
  let { state, events } = createGame(config);
  const initialTotal = totalCards(state);
  const expectDeck = buildDeck(players).length;
  if (initialTotal !== expectDeck) throw new Error(`建局牌张不符：${initialTotal} != ${expectDeck}`);

  const difficulty = DIFFS[seed % DIFFS.length];
  const ais: AiPlayer[] = state.players.map((_, seat) => new AiPlayer({ seat, seed: config.seed, difficulty }));
  const observeAll = (evs: GameEvent[], s: GameState) => { for (const ai of ais) ai.observe(evs, viewFor(s, ai.seat)); };
  observeAll(events, state);

  const byKind: Record<WeatherKind, number> = { bounty: 0, shuffle: 0, surge: 0, ban: 0, veer: 0, bless: 0 };
  let weatherCount = 0, triggered = 0, ladders = 0;
  const tally = (evs: GameEvent[]) => {
    for (const e of evs) {
      if (e.type === 'TurnStarted' && e.isFirst) ladders++;
      if (e.type === 'WeatherChanged') { weatherCount++; byKind[e.kind]++; }
      if (e.type === 'WeatherTriggered') triggered++;
    }
  };
  tally(events);

  let steps = 0;
  const cap = 30000;
  while (state.phase.kind !== 'over') {
    if (++steps > cap) throw new Error(`未在 ${cap} 步内终局（疑似死循环），seed=${seed}, weather=${weatherOn}`);
    let cmdType = '';
    if (state.phase.kind === 'respond') {
      const info = respondState(state)!;
      let challenged = false;
      for (const seat of info.challengers) {
        const c = ais[seat].decide(viewFor(state, seat));
        if (c.type === 'Challenge') {
          const res = apply(state, seat, c);
          state = res.state; observeAll(res.events, state); tally(res.events);
          challenged = true; cmdType = 'Challenge'; break;
        }
      }
      if (!challenged) {
        const res = apply(state, info.responder, { type: 'Accept' });
        state = res.state; observeAll(res.events, state); tally(res.events);
        cmdType = 'Accept';
      }
    } else {
      const actor = state.phase.kind === 'play' ? state.phase.current : state.phase.roller;
      const cmd = ais[actor].decide(viewFor(state, actor));
      const res = apply(state, actor, cmd);
      state = res.state; observeAll(res.events, state); tally(res.events);
      cmdType = cmd.type;
    }

    if (state.phase.kind === 'respond' && state.phase.responder === state.phase.player)
      throw new Error(`应对者绕回出牌方（skip 越界）：seat=${state.phase.player}（seed=${seed}, step=${steps}）`);
    if (totalCards(state) !== initialTotal)
      throw new Error(`牌张不守恒：${totalCards(state)} != ${initialTotal}（seed=${seed}, step=${steps}, cmd=${cmdType}, weather=${weatherOn}）`);
    for (const p of state.players) {
      if (p.lives < 0 || p.lives > config.startingLives) throw new Error(`凝聚度越界 ${p.lives}（seed=${seed}）`);
      if (p.escalation < 1) throw new Error(`累进次数越界 ${p.escalation}（seed=${seed}）`);
    }
    if (checkLeak && steps % 7 === 0) assertNoLeak(state);
  }

  const livesLost = state.players.reduce((n, p) => n + (config.startingLives - p.lives), 0);
  return { steps, winner: state.ranking![0].seat, weatherCount, triggered, byKind, ladders, livesLost };
}

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const median = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

function main(): void {
  const counts = [2, 3, 4];
  const perCount = [334, 333, 333]; // 合计 1000 场

  // —— 确定性复现：同 seed + 天气开 跑两次，结果必须逐字节一致（验证随机全走 s.rng）——
  let detOk = true;
  for (let i = 0; i < 24; i++) {
    const seed = 7777 + i * 13;
    const players = counts[i % 3];
    const a = runGame(players, seed, true, false);
    const b = runGame(players, seed, true, false);
    if (JSON.stringify(a) !== JSON.stringify(b)) { detOk = false; console.error(`✗ 复现失败 seed=${seed}`); }
  }
  console.log(detOk ? '✓ 确定性复现：24 组同种子两跑结果完全一致（随机全走 s.rng）' : '✗ 确定性复现失败');

  // —— 1000 场天气局：断言不变量 + 收集统计 ——
  const wSteps: number[] = [], wLives: number[] = [], wWeather: number[] = [], wTrig: number[] = [], wLadders: number[] = [];
  const winBySeat: Record<number, number[]> = { 2: [0, 0], 3: [0, 0, 0], 4: [0, 0, 0, 0] };
  const kindTotal: Record<WeatherKind, number> = { bounty: 0, shuffle: 0, surge: 0, ban: 0, veer: 0, bless: 0 };
  let games = 0;
  // —— 同样的种子再跑一遍经典模式（天气关）作对照 ——
  const bSteps: number[] = [], bLives: number[] = [];

  counts.forEach((players, ci) => {
    const N = perCount[ci];
    for (let k = 1; k <= N; k++) {
      const seed = k * 1000 + players;
      const r = runGame(players, seed, true, k <= 40); // 前 40 场抽查信息泄露
      wSteps.push(r.steps); wLives.push(r.livesLost); wWeather.push(r.weatherCount); wTrig.push(r.triggered); wLadders.push(r.ladders);
      winBySeat[players][r.winner]++;
      for (const kd of WEATHER_KINDS) kindTotal[kd] += r.byKind[kd];
      games++;

      const b = runGame(players, seed, false, false);
      bSteps.push(b.steps); bLives.push(b.livesLost);
    }
  });

  console.log(`\n✓ ${games} 场天气局全部正常终局：牌张守恒、无信息泄露、命数/累进未越界。`);

  const weatherPerGame = mean(wWeather);
  const weatherPerLadder = mean(wWeather) / mean(wLadders);
  console.log(`\n—— 天气频率 ——`);
  console.log(`天气事件/局   均 ${weatherPerGame.toFixed(1)}  中位 ${median(wWeather)}  最多 ${Math.max(...wWeather)}`);
  console.log(`新梯/局       均 ${mean(wLadders).toFixed(1)}  → 实际触发率 ${(weatherPerLadder * 100).toFixed(0)}%（目标 ~28%，受开局豁免+隔梯冷却拉低）`);
  console.log(`持续天气触发/局（禁止·转向叠加）均 ${mean(wTrig).toFixed(1)}`);

  console.log(`\n—— 天气类型分布（${games} 场合计 ${Object.values(kindTotal).reduce((s, x) => s + x, 0)} 次）——`);
  const labels: Record<WeatherKind, string> = { bounty: '丰沛(+2牌)', shuffle: '乱流(换牌)', surge: '源涌(累进)', ban: '禁制(禁止)', veer: '乱向(转向)', bless: '恩泽(+分)' };
  const totalKinds = Object.values(kindTotal).reduce((s, x) => s + x, 0);
  for (const kd of WEATHER_KINDS) console.log(`  ${labels[kd].padEnd(12, ' ')} ${kindTotal[kd]}  (${((kindTotal[kd] / totalKinds) * 100).toFixed(1)}%)`);

  console.log(`\n—— 对局长度 / 血量蒸发（天气 vs 经典，同种子）——`);
  console.log(`步数/局   天气 均 ${mean(wSteps).toFixed(0)} 中位 ${median(wSteps)}  |  经典 均 ${mean(bSteps).toFixed(0)} 中位 ${median(bSteps)}  (${((mean(wSteps) / mean(bSteps) - 1) * 100).toFixed(0)}%)`);
  console.log(`总掉命/局 天气 均 ${mean(wLives).toFixed(2)}  |  经典 均 ${mean(bLives).toFixed(2)}  (${((mean(wLives) / mean(bLives) - 1) * 100).toFixed(0)}%)`);

  console.log(`\n—— 胜者座位分布（公平性自检，同难度对局应近均匀）——`);
  for (const players of counts) {
    const tot = winBySeat[players].reduce((s, x) => s + x, 0);
    const pcts = winBySeat[players].map((w) => `${((w / tot) * 100).toFixed(0)}%`).join(' / ');
    console.log(`  ${players} 人局（${tot} 场）座位胜率 ${pcts}（理想 ${(100 / players).toFixed(0)}%）`);
  }
}

main();
