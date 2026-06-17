import { actorOf, apply, createGame, DEFAULT_CONFIG, GameError, viewFor } from '../../web/src/engine/game';
import { AiPlayer, Difficulty, PERSONA_LABEL, pickProfile } from '../../web/src/engine/ai';
import { Command, GameEvent, GameState } from '../../web/src/engine/types';
import { ServerMsg, SeatInfo, MAX_NAME } from '../../web/src/net/protocol';
import { countGame, countPlayer } from './stats';

const ROOM_DIFFICULTY: Difficulty = (process.env.YUANHE_AI_DIFFICULTY as Difficulty) ?? 'normal';

export interface Conn {
  id: number;
  send(msg: ServerMsg): void;
  close(): void;
}

interface Seat {
  seat: number;
  name: string;
  token: string | null;
  human: boolean;
  conn: Conn | null;
}

function clampPlayers(n: number | undefined): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return 3;
  if (v < 2) return 2;
  if (v > 4) return 4;
  return v;
}

const GRACE_MS = Number(process.env.YUANHE_ROOM_GRACE_MS ?? 180000);

function cleanName(raw: string | undefined, fallback: string): string {
  const s = (raw ?? '').trim().slice(0, MAX_NAME);
  return s.length ? s : fallback;
}

const DELAY_SCALE = Number(process.env.YUANHE_DELAY_SCALE ?? 1);

function delayFor(events: GameEvent[]): number {
  let base = 520;
  if (events.some((e) => e.type === 'CardRevealed')) base = 1900;
  else if (events.some((e) => e.type === 'DiceRolled')) base = 1300;
  else if (events.some((e) => e.type === 'PileTaken' || e.type === 'GameOver')) base = 1100;
  else if (events.some((e) => e.type === 'CardPlayed' || e.type === 'FunctionalPlayed')) base = 1500;
  const jitter = 0.7 + Math.random() * 0.7;
  return Math.max(0, Math.round(base * jitter * DELAY_SCALE));
}

const AI_NAMES = ['Aurel', 'Selvar', 'Verda', 'Thalos'];

export class Room {
  readonly id: string;
  private capacity: number;
  private seats: Seat[];
  private hostToken: string | null = null;
  private state: GameState | null = null;
  private lastEvents: GameEvent[] = [];
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private seedCounter = 0;
  private ais = new Map<number, AiPlayer>();
  private profileSeed = 0;
  private readonly onEmpty: (id: string) => void;

  constructor(id: string, players: number | undefined, onEmpty: (id: string) => void) {
    this.id = id;
    this.capacity = clampPlayers(players);
    this.onEmpty = onEmpty;
    this.seats = Array.from({ length: this.capacity }, (_, i) => ({
      seat: i,
      name: AI_NAMES[i % AI_NAMES.length],
      token: null,
      human: false,
      conn: null,
    }));
  }

  get started(): boolean {
    return this.state !== null;
  }

  private seatInfos(): SeatInfo[] {
    return this.seats.map((s) => ({
      seat: s.seat,
      name: s.human ? s.name : this.started ? s.name : `空位 · ${AI_NAMES[s.seat % AI_NAMES.length]}`,
      isAI: this.state ? this.state.players[s.seat].isAI : !s.human,
      connected: s.conn !== null,
    }));
  }

  private err(conn: Conn, message: string): void {
    conn.send({ t: 'error', message });
  }

  private hostSeatIndex(): number | null {
    if (!this.hostToken) return null;
    const s = this.seats.find((x) => x.token === this.hostToken);
    return s ? s.seat : null;
  }

  private allDisconnected(): boolean {
    return this.seats.every((s) => s.conn === null);
  }

  private clearGrace(): void {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
  }

  private maybeDispose(): void {
    if (!this.allDisconnected()) {
      this.clearGrace();
      return;
    }
    const inProgress = this.state !== null && this.state.phase.kind !== 'over';
    if (!inProgress) {
      this.onEmpty(this.id);
      return;
    }
    if (!this.graceTimer) {
      this.graceTimer = setTimeout(() => {
        this.graceTimer = null;
        if (this.allDisconnected()) this.onEmpty(this.id);
      }, GRACE_MS);
    }
  }

  private reassignHostIfLeaving(token: string): void {
    if (this.hostToken !== token) return;
    const next =
      this.seats.find((s) => s.conn && s.token && s.token !== token) ??
      this.seats.find((s) => s.human && s.token && s.token !== token);
    this.hostToken = next ? next.token : null;
  }

  private broadcastRoom(): void {
    const msg: ServerMsg = {
      t: 'room',
      roomId: this.id,
      capacity: this.capacity,
      started: this.started,
      hostSeat: this.hostSeatIndex(),
      seats: this.seatInfos(),
    };
    for (const s of this.seats) if (s.conn) s.conn.send(msg);
  }

  private syncSeat(s: Seat): void {
    if (!s.conn || !this.state) return;
    s.conn.send({ t: 'sync', view: viewFor(this.state, s.seat), events: this.lastEvents });
  }

  private broadcastSync(): void {
    for (const s of this.seats) this.syncSeat(s);
  }

  join(conn: Conn, token: string, name: string | undefined, players: number | undefined): void {
    const existing = this.seats.find((s) => s.token === token);
    if (existing) {
      existing.conn = conn;
      this.clearGrace();
      if (this.state) this.state.players[existing.seat].isAI = false;
      if (!this.hostToken) this.hostToken = token;
      conn.send({
        t: 'joined',
        roomId: this.id,
        you: existing.seat,
        capacity: this.capacity,
        host: this.hostToken === token,
        started: this.started,
        seats: this.seatInfos(),
      });
      if (this.state) this.syncSeat(existing);
      this.broadcastRoom();
      this.drive();
      return;
    }

    if (this.started) {
      this.err(conn, '该房间对局已开始，无法加入');
      return;
    }
    const free = this.seats.find((s) => !s.human);
    if (!free) {
      this.err(conn, '房间已满');
      return;
    }
    free.human = true;
    free.token = token;
    free.name = cleanName(name, `玩家${free.seat + 1}`);
    free.conn = conn;
    countPlayer();
    this.clearGrace();
    if (!this.hostToken) this.hostToken = token;
    void players;
    conn.send({
      t: 'joined',
      roomId: this.id,
      you: free.seat,
      capacity: this.capacity,
      host: this.hostToken === token,
      started: false,
      seats: this.seatInfos(),
    });
    this.broadcastRoom();
  }

  start(token: string): void {
    if (this.started) return;
    if (this.hostToken !== token) return;
    this.deal();
  }

  restart(token: string): void {
    if (this.hostToken !== token) return;
    this.deal();
  }

  private deal(): void {
    const seedBase = (Date.now() & 0x7fffffff) ^ (this.seedCounter++ << 16);
    const seed = (seedBase ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    this.profileSeed = seed;
    this.ais = new Map();
    const seatInits = this.seats.map((s) => {
      const isAI = !s.human || s.conn === null;
      if (!isAI) return { name: s.name, isAI };
      const profile = pickProfile(seed, s.seat);
      this.ais.set(s.seat, new AiPlayer({ seat: s.seat, seed, profile, difficulty: ROOM_DIFFICULTY }));
      const base = s.human ? s.name : AI_NAMES[s.seat % AI_NAMES.length];
      return { name: `${base} · ${PERSONA_LABEL[profile]}`, isAI };
    });
    const { state, events } = createGame({ ...DEFAULT_CONFIG, players: this.capacity, seed }, seatInits);
    this.state = state;
    this.lastEvents = events;
    countGame();
    this.observeAll(events);
    this.broadcastSync();
    this.broadcastRoom();
    this.drive();
  }

  private observeAll(events: GameEvent[]): void {
    if (!this.state) return;
    for (const ai of this.ais.values()) ai.observe(events, viewFor(this.state, ai.seat));
  }

  private aiFor(seat: number): AiPlayer {
    let ai = this.ais.get(seat);
    if (!ai) {
      ai = new AiPlayer({ seat, seed: this.profileSeed, profile: pickProfile(this.profileSeed, seat), difficulty: ROOM_DIFFICULTY });
      this.ais.set(seat, ai);
    }
    return ai;
  }

  command(token: string, command: Command): void {
    if (!this.state) return;
    const seat = this.seats.find((s) => s.token === token);
    if (!seat) return;
    const actor = actorOf(this.state);
    if (actor !== seat.seat) {
      if (seat.conn) this.err(seat.conn, '还没轮到你');
      return;
    }
    this.applyCommand(seat.seat, command, seat.conn);
  }

  private applyCommand(seat: number, command: Command, conn: Conn | null): void {
    if (!this.state) return;
    try {
      const res = apply(this.state, seat, command);
      this.state = res.state;
      this.lastEvents = res.events;
    } catch (e) {
      if (conn && e instanceof GameError) this.err(conn, e.message);
      return;
    }
    this.observeAll(this.lastEvents);
    this.broadcastSync();
    this.drive();
  }

  private drive(): void {
    if (this.aiTimer) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
    if (!this.state || this.state.phase.kind === 'over') return;
    const actor = actorOf(this.state);
    if (!this.state.players[actor].isAI) return;
    const ai = this.aiFor(actor);
    const cmd = ai.decide(viewFor(this.state, actor));
    const delay = Math.max(delayFor(this.lastEvents), ai.delayMs() * DELAY_SCALE);
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      if (!this.state || this.state.phase.kind === 'over') return;
      const a = actorOf(this.state);
      if (a !== actor || !this.state.players[a].isAI) {
        this.drive();
        return;
      }
      this.applyCommand(a, cmd, null);
    }, delay);
  }

  disconnect(conn: Conn): void {
    const seat = this.seats.find((s) => s.conn === conn);
    if (!seat) return;
    seat.conn = null;
    if (seat.token) this.reassignHostIfLeaving(seat.token);
    if (this.state && this.state.phase.kind !== 'over') {
      this.state.players[seat.seat].isAI = true;
      this.broadcastRoom();
      this.drive();
    } else {
      this.broadcastRoom();
    }
    this.maybeDispose();
  }

  leave(token: string): void {
    const seat = this.seats.find((s) => s.token === token);
    if (!seat) return;
    const conn = seat.conn;
    seat.conn = null;
    const inProgress = this.state !== null && this.state.phase.kind !== 'over';
    if (!this.started) {
      seat.human = false;
      seat.token = null;
      seat.name = AI_NAMES[seat.seat % AI_NAMES.length];
    } else if (inProgress) {
      this.state!.players[seat.seat].isAI = true;
    }
    this.reassignHostIfLeaving(token);
    if (inProgress) this.drive();
    if (conn) conn.close();
    this.broadcastRoom();
    this.maybeDispose();
  }

  dispose(): void {
    if (this.aiTimer) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
    this.clearGrace();
  }
}
