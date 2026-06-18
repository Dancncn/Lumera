import { create } from 'zustand';
import { actorOf, apply, buildTutorialDeck, createGame, DEFAULT_CONFIG, respondState, viewFor } from '../engine/game';
import { AiPlayer, Difficulty, PERSONA_LABEL, pickProfile } from '../engine/ai';
import { Card, Command, GameEvent, GameState, PlayerView } from '../engine/types';
import { NetClient, ConnStatus, loadToken } from '../net/client';
import { reportLocalGame } from '../net/telemetry';
import { JoinedMsg, PlayerLeftMsg, RoomMsg, SeatInfo, SyncMsg } from '../net/protocol';

const AI_NAMES = ['Aurel', 'Selvar', 'Verda', 'Thalos'];

interface DieFlash {
  seat: number;
  chosen: number[];
  rolled: number;
  hit: boolean;
}

export type Mode = 'local' | 'online';

export interface Lobby {
  roomId: string;
  you: number;
  host: boolean;
  capacity: number;
  started: boolean;
  seats: SeatInfo[];
  weather: boolean;
}

interface Store {
  mode: Mode;
  state: GameState | null;
  onlineView: PlayerView | null;
  lobby: Lobby | null;
  conn: ConnStatus | 'idle';
  netError: string | null;
  thinking: number | null;
  lastEvents: GameEvent[];
  lastDie: DieFlash | null;
  penaltySeat: number | null;
  tutorial: boolean;
  tutorialStage: number | null;
  turnDeadline: number | null;
  notice: string | null;
  difficulty: Difficulty;
  players: number;
  newGame: (players: number, difficulty?: Difficulty, firstSeat?: number, deck?: Card[], weather?: boolean) => void;
  startTutorial: () => void;
  stageGame: (firstSeat: number, deck: Card[]) => void;
  stageCmd: (seat: number, cmd: Command) => void;
  quitToMenu: () => void;
  human: (cmd: Command) => void;
  pass: () => void;
  joinRoom: (roomId: string, name: string, players: number, weather?: boolean) => void;
  startRoom: () => void;
  setRoomWeather: (weather: boolean) => void;
  leaveRoom: () => void;
}

let aiTimer: ReturnType<typeof setTimeout> | null = null;
let respondTimers: ReturnType<typeof setTimeout>[] = [];
let respondPending = new Set<number>(); // 本轮还未表态（既没质疑也没放行）的可质疑座位
let net: NetClient | null = null;
let ais = new Map<number, AiPlayer>();
let difficulty: Difficulty = 'normal';
let weatherOn = false; // 记住天气开关，使「再来一局」沿用上次选择（教程显式关闭）

// 质疑窗口：出牌后留给全场 8 秒反应（先喊先得）。纯 AI 收得更快。
const RESPOND_WINDOW_HUMAN = 8000;
const RESPOND_WINDOW_AI = 2400;
function challengeDelay(humanEligible: boolean): number {
  return humanEligible ? 1400 + Math.random() * 1800 : 700 + Math.random() * 1200;
}

function trackPenalty(events: GameEvent[], prev: number | null): number | null {
  const started = events.find((e) => e.type === 'PenaltyStarted') as { seat: number } | undefined;
  if (started) return started.seat;
  if (events.some((e) => e.type === 'TurnStarted')) return null;
  if (events.some((e) => e.type === 'DiceRolled') && prev !== null) return prev;
  return prev;
}

function extractDie(events: GameEvent[]): DieFlash | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === 'DiceRolled') return { seat: e.seat, chosen: e.chosen, rolled: e.rolled, hit: e.hit };
  }
  return null;
}

function nextDie(events: GameEvent[], prev: DieFlash | null): DieFlash | null {
  const fresh = extractDie(events);
  if (fresh) return fresh;
  if (events.some((e) => e.type === 'PenaltyStarted' || e.type === 'LadderReset')) return null;
  return prev;
}

function delayFor(events: GameEvent[]): number {
  if (events.some((e) => e.type === 'PlayerOut')) return 2800;
  if (events.some((e) => e.type === 'Returned')) return 2200;
  if (events.some((e) => e.type === 'CardRevealed')) return 2500;
  if (events.some((e) => e.type === 'DiceRolled' && e.hit)) return 2000;
  if (events.some((e) => e.type === 'DiceRolled')) return 1500;
  if (events.some((e) => e.type === 'PenaltyStarted')) return 1400;
  if (events.some((e) => e.type === 'PileTaken' || e.type === 'GameOver')) return 1400;
  if (events.some((e) => e.type === 'CardPlayed' || e.type === 'FunctionalPlayed')) return 1600;
  return 700;
}

export const useGame = create<Store>((set, get) => {
  function observeAll(events: GameEvent[], state: GameState): void {
    for (const ai of ais.values()) ai.observe(events, viewFor(state, ai.seat));
  }

  function clearTimers(): void {
    if (aiTimer) {
      clearTimeout(aiTimer);
      aiTimer = null;
    }
    for (const t of respondTimers) clearTimeout(t);
    respondTimers = [];
    respondPending = new Set();
  }

  // 所有可质疑者都表态（放行/AI判完不质疑）→ 下家自动放行、继续。任一质疑则即时摊牌。
  function checkRespondProceed(): void {
    if (respondPending.size > 0) return;
    const cur = get().state;
    if (!cur || cur.phase.kind !== 'respond') return;
    applyLocal(cur.phase.responder, { type: 'Accept' });
  }

  function applyLocal(seat: number, cmd: Command): void {
    const cur = get().state;
    if (!cur || cur.phase.kind === 'over') return;
    try {
      const res = apply(cur, seat, cmd);
      observeAll(res.events, res.state);
      set({ state: res.state, lastEvents: res.events, lastDie: nextDie(res.events, get().lastDie), penaltySeat: trackPenalty(res.events, get().penaltySeat) });
    } catch (err) {
      console.error('非法命令', cmd, err);
      return;
    }
    loop();
  }

  // 应对阶段：开一个反应窗口。每个在场 AI 各自评估是否质疑（按拟人延迟开火，给真人留反应时间）；
  // 真人随时可按「质疑」；窗口内无人质疑则自动由下家放行、继续出牌。第一个质疑生效。
  function driveRespond(s: GameState): void {
    const info = respondState(s);
    if (!info) return;
    respondPending = new Set(info.challengers);
    const humanEligible = info.challengers.some((seat) => !s.players[seat].isAI);
    set({ thinking: null, turnDeadline: humanEligible ? Date.now() + RESPOND_WINDOW_HUMAN : null });
    // 每个在场 AI 到点表态：质疑即摊牌，否则从待表态集合移除；真人由「放行/质疑」表态。
    for (const seat of info.challengers) {
      if (!s.players[seat].isAI) continue;
      const ai = ais.get(seat);
      if (!ai) {
        respondPending.delete(seat);
        continue;
      }
      respondTimers.push(
        setTimeout(() => {
          const cur = get().state;
          if (!cur || cur.phase.kind !== 'respond') return;
          if (cur.phase.player === seat || cur.players[seat].out) {
            respondPending.delete(seat);
            checkRespondProceed();
            return;
          }
          if (ai.decide(viewFor(cur, seat)).type === 'Challenge') {
            applyLocal(seat, { type: 'Challenge' });
            return;
          }
          respondPending.delete(seat);
          checkRespondProceed();
        }, challengeDelay(humanEligible)),
      );
    }
    // 兜底硬上限：真人一直不表态也不会卡死。
    respondTimers.push(
      setTimeout(() => {
        const cur = get().state;
        if (!cur || cur.phase.kind !== 'respond') return;
        applyLocal(cur.phase.responder, { type: 'Accept' });
      }, humanEligible ? RESPOND_WINDOW_HUMAN : RESPOND_WINDOW_AI),
    );
    checkRespondProceed();
  }

  function loop(): void {
    clearTimers();
    if (get().tutorialStage !== null) return;
    const s = get().state;
    if (!s || s.phase.kind === 'over') {
      set({ thinking: null, turnDeadline: null });
      return;
    }
    if (s.phase.kind === 'respond') {
      driveRespond(s);
      return;
    }
    if (get().turnDeadline) set({ turnDeadline: null });
    const actor = actorOf(s);
    if (!s.players[actor].isAI) {
      set({ thinking: null });
      return;
    }
    const ai = ais.get(actor);
    if (!ai) {
      set({ thinking: null });
      return;
    }
    set({ thinking: actor });
    const cmd = ai.decide(viewFor(s, actor));
    const delay = Math.max(delayFor(get().lastEvents), ai.delayMs());
    aiTimer = setTimeout(() => {
      aiTimer = null;
      const cur = get().state;
      if (!cur || cur.phase.kind === 'over') {
        set({ thinking: null });
        return;
      }
      const a = actorOf(cur);
      if (cur.phase.kind === 'respond' || a !== actor || !cur.players[a].isAI) {
        loop();
        return;
      }
      applyLocal(a, cmd);
    }, delay);
  }

  function teardownLocal(): void {
    clearTimers();
  }

  function teardownNet(): void {
    if (net) {
      net.close();
      net = null;
    }
  }

  return {
    mode: 'local',
    state: null,
    onlineView: null,
    lobby: null,
    conn: 'idle',
    netError: null,
    thinking: null,
    lastEvents: [],
    lastDie: null,
    penaltySeat: null,
    tutorial: false,
    tutorialStage: null,
    turnDeadline: null,
    notice: null,
    difficulty: 'normal',
    players: 3,

    newGame: (players: number, diff?: Difficulty, firstSeat?: number, deck?: Card[], weather?: boolean) => {
      if (get().mode === 'online') {
        net?.restart();
        return;
      }
      teardownLocal();
      if (diff) difficulty = diff;
      if (weather !== undefined) weatherOn = weather;
      const seed = ((Date.now() & 0x7fffffff) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
      ais = new Map();
      const seats = Array.from({ length: players }, (_, i) => {
        if (i === 0) return { name: '你 · Lumir', isAI: false };
        const profile = pickProfile(seed, i);
        ais.set(i, new AiPlayer({ seat: i, seed, profile, difficulty }));
        return { name: `${AI_NAMES[i % AI_NAMES.length]} · ${PERSONA_LABEL[profile]}`, isAI: true };
      });
      const { state, events } = createGame({ ...DEFAULT_CONFIG, players, seed, weather: weatherOn }, seats, firstSeat, deck);
      observeAll(events, state);
      set({ state, lastEvents: events, lastDie: null, penaltySeat: null, thinking: null, tutorial: false, difficulty, players });
      reportLocalGame(); // 单机局也计入「对局」统计
      loop();
    },

    startTutorial: () => {
      // 2 人易局、你先手、固定牌序（保证演示 0/万能/跑成），跟着提示走一遍（教程不下天气）
      get().newGame(2, 'easy', 0, buildTutorialDeck(), false);
      set({ tutorial: true, tutorialStage: null });
    },

    stageGame: (firstSeat: number, deck: Card[]) => {
      clearTimers();
      const seed = 42;
      ais = new Map();
      const seats = [
        { name: '你 · Lumir', isAI: false },
        { name: 'Aurel · 对手', isAI: true },
      ];
      ais.set(1, new AiPlayer({ seat: 1, seed, profile: 'steady', difficulty: 'easy' }));
      const { state, events } = createGame({ ...DEFAULT_CONFIG, players: 2, seed }, seats, firstSeat, deck);
      set({ state, lastEvents: events, lastDie: null, penaltySeat: null, thinking: null });
    },

    stageCmd: (seat: number, cmd: Command) => {
      const cur = get().state;
      if (!cur || cur.phase.kind === 'over') return;
      try {
        const res = apply(cur, seat, cmd);
        set({
          state: res.state,
          lastEvents: res.events,
          lastDie: nextDie(res.events, get().lastDie),
          penaltySeat: trackPenalty(res.events, get().penaltySeat),
        });
      } catch (err) {
        console.error('stageCmd error', cmd, err);
      }
    },

    quitToMenu: () => {
      teardownLocal();
      teardownNet();
      ais = new Map();
      set({
        mode: 'local',
        state: null,
        onlineView: null,
        lobby: null,
        conn: 'idle',
        netError: null,
        lastEvents: [],
        lastDie: null,
        penaltySeat: null,
        thinking: null,
        turnDeadline: null,
        notice: null,
        tutorial: false,
        tutorialStage: null,
      });
    },

    human: (cmd: Command) => {
      if (get().mode === 'online') {
        net?.command(cmd);
        return;
      }
      const s = get().state;
      if (!s || s.phase.kind === 'over') return;
      // 应对阶段：真人（座位 0）随时可质疑，不必是下家。其余命令仍须轮到自己。
      if (s.phase.kind === 'respond' && cmd.type === 'Challenge') {
        if (s.phase.player === 0 || s.players[0].out) return;
        applyLocal(0, cmd);
        return;
      }
      const actor = actorOf(s);
      if (s.players[actor].isAI) return;
      applyLocal(actor, cmd);
    },

    // 真人「放行」：表态不质疑。若全场都已表态，窗口立即结束、继续出牌（不必等满倒计时）。
    pass: () => {
      if (get().mode === 'online') {
        net?.pass();
        return;
      }
      const s = get().state;
      if (!s || s.phase.kind !== 'respond') return;
      if (respondPending.has(0)) {
        respondPending.delete(0);
        checkRespondProceed();
      }
    },

    joinRoom: (roomId: string, name: string, players: number, weather = false) => {
      teardownLocal();
      teardownNet();
      set({
        mode: 'online',
        state: null,
        onlineView: null,
        lobby: null,
        conn: 'connecting',
        netError: null,
        lastEvents: [],
        lastDie: null,
        penaltySeat: null,
        thinking: null,
      });
      let noticeTimer: ReturnType<typeof setTimeout> | null = null;
      const client: NetClient = new NetClient({
        onPlayerLeft: (msg: PlayerLeftMsg) => {
          if (net !== client) return;
          if (noticeTimer) clearTimeout(noticeTimer);
          set({ notice: `${msg.name} 已离开，AI 代打中` });
          noticeTimer = setTimeout(() => set({ notice: null }), 3500);
        },
        onStatus: (status: ConnStatus) => {
          if (net !== client) return;
          set({ conn: status });
        },
        onError: (message: string) => {
          if (net !== client) return;
          set({ netError: message });
        },
        onJoined: (msg: JoinedMsg) => {
          if (net !== client) return;
          set({
            lobby: {
              roomId: msg.roomId,
              you: msg.you,
              host: msg.host,
              capacity: msg.capacity,
              started: msg.started,
              seats: msg.seats,
              weather: msg.weather,
            },
            netError: null,
          });
        },
        onRoom: (msg: RoomMsg) => {
          if (net !== client) return;
          const prev = get().lobby;
          if (!prev) return;
          set({
            lobby: {
              ...prev,
              capacity: msg.capacity,
              started: msg.started,
              seats: msg.seats,
              host: msg.hostSeat === prev.you,
              weather: msg.weather,
            },
          });
        },
        onSync: (msg: SyncMsg) => {
          if (net !== client) return;
          set((st) => ({
            onlineView: msg.view,
            lastEvents: msg.events,
            lastDie: nextDie(msg.events, st.lastDie),
            penaltySeat: trackPenalty(msg.events, st.penaltySeat),
            thinking: msg.view.players[msg.view.current]?.isAI ? msg.view.current : null,
            turnDeadline: msg.turnDeadline ?? null,
          }));
        },
      });
      net = client;
      client.connect({ roomId, token: loadToken(), name, players, weather });
    },

    startRoom: () => {
      net?.start();
    },

    setRoomWeather: (weather: boolean) => {
      // 房主切换：发给服务端，并乐观更新本地大厅（服务端会广播 RoomMsg 回正）
      net?.setWeather(weather);
      const lb = get().lobby;
      if (lb) set({ lobby: { ...lb, weather } });
    },

    leaveRoom: () => {
      teardownNet();
      set({
        mode: 'local',
        state: null,
        onlineView: null,
        lobby: null,
        conn: 'idle',
        netError: null,
        lastEvents: [],
        lastDie: null,
        penaltySeat: null,
        thinking: null,
        turnDeadline: null,
        notice: null,
      });
    },
  };
});

export function useMyView(): PlayerView | null {
  const mode = useGame((s) => s.mode);
  const state = useGame((s) => s.state);
  const onlineView = useGame((s) => s.onlineView);
  if (mode === 'online') return onlineView;
  return state ? viewFor(state, 0) : null;
}
