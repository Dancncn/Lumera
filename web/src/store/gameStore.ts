import { create } from 'zustand';
import { actorOf, apply, buildTutorialDeck, createGame, DEFAULT_CONFIG, viewFor } from '../engine/game';
import { AiPlayer, Difficulty, PERSONA_LABEL, pickProfile } from '../engine/ai';
import { Card, Command, GameEvent, GameState, PlayerView } from '../engine/types';
import { NetClient, ConnStatus, loadToken } from '../net/client';
import { reportLocalGame } from '../net/telemetry';
import { JoinedMsg, PlayerLeftMsg, RoomMsg, SeatInfo, SyncMsg } from '../net/protocol';

const AI_NAMES = ['Aurel', 'Selvar', 'Verda', 'Thalos'];

interface DieFlash {
  seat: number;
  chosen: number;
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
  tutorial: boolean;
  turnDeadline: number | null;
  notice: string | null;
  difficulty: Difficulty;
  players: number;
  newGame: (players: number, difficulty?: Difficulty, firstSeat?: number, deck?: Card[]) => void;
  startTutorial: () => void;
  quitToMenu: () => void;
  human: (cmd: Command) => void;
  joinRoom: (roomId: string, name: string, players: number) => void;
  startRoom: () => void;
  leaveRoom: () => void;
}

let aiTimer: ReturnType<typeof setTimeout> | null = null;
let net: NetClient | null = null;
let ais = new Map<number, AiPlayer>();
let difficulty: Difficulty = 'normal';

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
  if (events.some((e) => e.type === 'CardRevealed')) return 1900;
  if (events.some((e) => e.type === 'DiceRolled')) return 1300;
  if (events.some((e) => e.type === 'PileTaken' || e.type === 'GameOver')) return 1100;
  if (events.some((e) => e.type === 'CardPlayed' || e.type === 'FunctionalPlayed')) return 1500;
  return 520;
}

export const useGame = create<Store>((set, get) => {
  function observeAll(events: GameEvent[], state: GameState): void {
    for (const ai of ais.values()) ai.observe(events, viewFor(state, ai.seat));
  }

  function loop(): void {
    if (aiTimer) {
      clearTimeout(aiTimer);
      aiTimer = null;
    }
    const s = get().state;
    if (!s || s.phase.kind === 'over') {
      set({ thinking: null });
      return;
    }
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
      if (a !== actor || !cur.players[a].isAI) {
        loop();
        return;
      }
      try {
        const res = apply(cur, a, cmd);
        observeAll(res.events, res.state);
        set({ state: res.state, lastEvents: res.events, lastDie: nextDie(res.events, get().lastDie) });
      } catch (err) {
        console.error('AI 给出非法命令', cmd, err);
        set({ thinking: null });
        return;
      }
      loop();
    }, delay);
  }

  function teardownLocal(): void {
    if (aiTimer) {
      clearTimeout(aiTimer);
      aiTimer = null;
    }
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
    tutorial: false,
    turnDeadline: null,
    notice: null,
    difficulty: 'normal',
    players: 3,

    newGame: (players: number, diff?: Difficulty, firstSeat?: number, deck?: Card[]) => {
      if (get().mode === 'online') {
        net?.restart();
        return;
      }
      teardownLocal();
      if (diff) difficulty = diff;
      const seed = ((Date.now() & 0x7fffffff) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
      ais = new Map();
      const seats = Array.from({ length: players }, (_, i) => {
        if (i === 0) return { name: '你 · Lumir', isAI: false };
        const profile = pickProfile(seed, i);
        ais.set(i, new AiPlayer({ seat: i, seed, profile, difficulty }));
        return { name: `${AI_NAMES[i % AI_NAMES.length]} · ${PERSONA_LABEL[profile]}`, isAI: true };
      });
      const { state, events } = createGame({ ...DEFAULT_CONFIG, players, seed }, seats, firstSeat, deck);
      observeAll(events, state);
      set({ state, lastEvents: events, lastDie: null, thinking: null, tutorial: false, difficulty, players });
      reportLocalGame(); // 单机局也计入「对局」统计
      loop();
    },

    startTutorial: () => {
      // 2 人易局、你先手、固定牌序（保证演示 0/万能/跑成），跟着提示走一遍
      get().newGame(2, 'easy', 0, buildTutorialDeck());
      set({ tutorial: true });
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
        thinking: null,
        turnDeadline: null,
        notice: null,
        tutorial: false,
      });
    },

    human: (cmd: Command) => {
      if (get().mode === 'online') {
        net?.command(cmd);
        return;
      }
      const s = get().state;
      if (!s || s.phase.kind === 'over') return;
      const actor = actorOf(s);
      if (s.players[actor].isAI) return;
      try {
        const res = apply(s, actor, cmd);
        observeAll(res.events, res.state);
        set({ state: res.state, lastEvents: res.events, lastDie: nextDie(res.events, get().lastDie) });
      } catch (err) {
        console.error('非法命令', cmd, err);
        return;
      }
      loop();
    },

    joinRoom: (roomId: string, name: string, players: number) => {
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
            },
          });
        },
        onSync: (msg: SyncMsg) => {
          if (net !== client) return;
          set((st) => ({
            onlineView: msg.view,
            lastEvents: msg.events,
            lastDie: nextDie(msg.events, st.lastDie),
            thinking: msg.view.players[msg.view.current]?.isAI ? msg.view.current : null,
            turnDeadline: msg.turnDeadline ?? null,
          }));
        },
      });
      net = client;
      client.connect({ roomId, token: loadToken(), name, players });
    },

    startRoom: () => {
      net?.start();
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
