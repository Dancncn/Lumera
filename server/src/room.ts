import { actorOf, apply, createGame, DEFAULT_CONFIG, GameError, respondState, viewFor } from '../../web/src/engine/game';
import { AiPlayer, Difficulty, PERSONA_LABEL, PROFILE_ORDER, pickProfile } from '../../web/src/engine/ai';
import { Command, GameEvent, GameState } from '../../web/src/engine/types';
import { ServerMsg, SeatInfo, MAX_NAME } from '../../web/src/net/protocol';
import { countGame } from './stats';

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

function clampChance(n: number | undefined): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0.28;
  return Math.min(1, Math.max(0, v));
}

const GRACE_MS = Number(process.env.YUANHE_ROOM_GRACE_MS ?? 180000);

function cleanName(raw: string | undefined, fallback: string): string {
  const s = (raw ?? '').trim().slice(0, MAX_NAME);
  return s.length ? s : fallback;
}

const TURN_TIMEOUT_MS = Number(process.env.YUANHE_TURN_TIMEOUT_MS ?? 20000);
const DELAY_SCALE = Number(process.env.YUANHE_DELAY_SCALE ?? 1);

// 质疑窗口：真人在场时，AI 先静默 REACTION_WINDOW 毫秒（反应窗口），把「首次截牌」机会留给真人；
// 在场真人都放行即提前解锁 AI。联机保留 10 秒自动放行硬上限 + 倒计时（不能让一个真人无限拖住整桌）。纯 AI 收得更快。
const REACTION_WINDOW = 6000;
const RESPOND_WINDOW_HUMAN = 10000;
const RESPOND_WINDOW_AI = 2400;
function challengeDelay(): number {
  return 700 + Math.random() * 1200;
}

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
  private respondTimers: ReturnType<typeof setTimeout>[] = [];
  private respondPending = new Set<number>();
  private respondReleaseAis: (() => void) | null = null; // 在场真人都放行时，提前解锁 AI 截牌
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private turnDeadline: number | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private seedCounter = 0;
  private ais = new Map<number, AiPlayer>();
  private profileSeed = 0;
  private weather: boolean;
  private weatherChance: number;
  private readonly onEmpty: (id: string) => void;

  constructor(id: string, players: number | undefined, weather: boolean, weatherChance: number, onEmpty: (id: string) => void) {
    this.id = id;
    this.capacity = clampPlayers(players);
    this.weather = weather;
    this.weatherChance = clampChance(weatherChance);
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
      weather: this.weather,
      weatherChance: this.weatherChance,
    };
    for (const s of this.seats) if (s.conn) s.conn.send(msg);
  }

  private syncSeat(s: Seat): void {
    if (!s.conn || !this.state) return;
    const msg: ServerMsg = { t: 'sync', view: viewFor(this.state, s.seat), events: this.lastEvents };
    if (this.turnDeadline) (msg as { turnDeadline?: number }).turnDeadline = this.turnDeadline;
    s.conn.send(msg);
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
        weather: this.weather,
        weatherChance: this.weatherChance,
      });
      if (this.state) this.syncSeat(existing);
      this.broadcastRoom();
      this.drive();
      return;
    }

    if (this.started) {
      const joinName = cleanName(name, '');
      const nameMatch = joinName
        ? this.seats.find((s) => s.human && s.conn === null && s.name === joinName)
        : null;
      if (nameMatch) {
        nameMatch.token = token;
        nameMatch.conn = conn;
        this.clearGrace();
        if (this.state) this.state.players[nameMatch.seat].isAI = false;
        if (!this.hostToken) this.hostToken = token;
        conn.send({
          t: 'joined',
          roomId: this.id,
          you: nameMatch.seat,
          capacity: this.capacity,
          host: this.hostToken === token,
          started: true,
          seats: this.seatInfos(),
          weather: this.weather,
          weatherChance: this.weatherChance,
        });
        if (this.state) this.syncSeat(nameMatch);
        this.broadcastRoom();
        this.drive();
        return;
      }
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
      weather: this.weather,
      weatherChance: this.weatherChance,
    });
    this.broadcastRoom();
  }

  // 房主在大厅实时调房间设置：仅校验房主；按字段部分更新「下一次建局」的设置（不影响进行中的对局），广播给全员。
  setRoomCfg(token: string, cfg: { weather?: boolean; weatherChance?: number }): void {
    if (this.hostToken !== token) return;
    let changed = false;
    if (cfg.weather !== undefined && cfg.weather !== this.weather) {
      this.weather = cfg.weather;
      changed = true;
    }
    if (cfg.weatherChance !== undefined) {
      const c = clampChance(cfg.weatherChance);
      if (c !== this.weatherChance) {
        this.weatherChance = c;
        changed = true;
      }
    }
    if (changed) this.broadcastRoom();
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
    const { state, events } = createGame({ ...DEFAULT_CONFIG, players: this.capacity, seed, weather: this.weather, weatherChance: this.weatherChance }, seatInits);
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
    // 应对阶段：任何在场的非出牌方都能质疑，不限下家。
    if (this.state.phase.kind === 'respond' && command.type === 'Challenge') {
      if (this.state.phase.player === seat.seat || this.state.players[seat.seat].out) {
        if (seat.conn) this.err(seat.conn, '不能质疑');
        return;
      }
      this.applyCommand(seat.seat, command, seat.conn);
      return;
    }
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

  private clearTurnTimer(): void {
    if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; }
    this.turnDeadline = null;
  }

  private clearRespondTimers(): void {
    for (const t of this.respondTimers) clearTimeout(t);
    this.respondTimers = [];
    this.respondPending = new Set();
    this.respondReleaseAis = null;
  }

  // 全场可质疑者都表态（放行 / AI 判完不质疑）→ 下家自动放行、继续。任一质疑则即时摊牌。
  private checkRespondProceed(): void {
    if (this.respondPending.size > 0) return;
    if (!this.state || this.state.phase.kind !== 'respond') return;
    this.applyCommand(this.state.phase.responder, { type: 'Accept' }, null);
  }

  // 应对阶段：开反应窗口。每个在场 AI 到点表态（质疑即摊牌，否则移出待表态集）；
  // 真人经 WS 发 Challenge / pass 表态。一般真人最慢——真人放行且 AI 都判完即继续；兜底硬上限封顶。
  private driveRespond(): void {
    const s = this.state;
    if (!s) return;
    const info = respondState(s);
    if (!info) return;
    this.respondPending = new Set(info.challengers);
    const humanEligible = info.challengers.some((seat) => !s.players[seat].isAI && this.seats[seat].conn !== null);

    // 解锁所有仍待表态的 AI：逐个评估，第一个质疑即摊牌；都不质疑则移出待表态、再看是否收窗。
    let released = false;
    const releaseAis = (): void => {
      if (released) return;
      released = true;
      this.respondReleaseAis = null;
      for (const seat of info.challengers) {
        if (!s.players[seat].isAI || !this.respondPending.has(seat)) continue;
        if (!this.state || this.state.phase.kind !== 'respond') return;
        if (this.state.phase.player === seat || this.state.players[seat].out) {
          this.respondPending.delete(seat);
          continue;
        }
        const ai = this.aiFor(seat);
        if (ai.decide(viewFor(this.state, seat)).type === 'Challenge') {
          this.applyCommand(seat, { type: 'Challenge' }, null);
          return;
        }
        this.respondPending.delete(seat);
      }
      this.checkRespondProceed();
    };

    if (humanEligible) {
      // 真人在场：AI 先静默 6 秒反应窗口，把首次截牌机会留给真人；在场真人都放行则提前解锁（见 pass）。
      // 保留 10 秒自动放行硬上限 + 倒计时：联机不能让一个真人无限拖住整桌。
      this.respondReleaseAis = releaseAis;
      this.respondTimers.push(setTimeout(releaseAis, REACTION_WINDOW * DELAY_SCALE));
      const windowMs = RESPOND_WINDOW_HUMAN * DELAY_SCALE;
      this.respondTimers.push(
        setTimeout(() => {
          if (!this.state || this.state.phase.kind !== 'respond') return;
          this.applyCommand(this.state.phase.responder, { type: 'Accept' }, null);
        }, windowMs),
      );
      this.turnDeadline = Date.now() + windowMs;
      this.broadcastSync();
    } else {
      // 纯 AI（或真人全离线由 AI 补位）：各 AI 错峰表态 + 硬上限收窗。
      for (const seat of info.challengers) {
        if (!s.players[seat].isAI) continue;
        const ai = this.aiFor(seat);
        this.respondTimers.push(
          setTimeout(() => {
            if (!this.state || this.state.phase.kind !== 'respond') return;
            if (this.state.phase.player === seat || this.state.players[seat].out) {
              this.respondPending.delete(seat);
              this.checkRespondProceed();
              return;
            }
            if (ai.decide(viewFor(this.state, seat)).type === 'Challenge') {
              this.applyCommand(seat, { type: 'Challenge' }, null);
              return;
            }
            this.respondPending.delete(seat);
            this.checkRespondProceed();
          }, challengeDelay() * DELAY_SCALE),
        );
      }
      const windowMs = RESPOND_WINDOW_AI * DELAY_SCALE;
      this.respondTimers.push(
        setTimeout(() => {
          if (!this.state || this.state.phase.kind !== 'respond') return;
          this.applyCommand(this.state.phase.responder, { type: 'Accept' }, null);
        }, windowMs),
      );
    }
    this.checkRespondProceed();
  }

  pass(token: string): void {
    if (!this.state || this.state.phase.kind !== 'respond') return;
    const seat = this.seats.find((s) => s.token === token);
    if (!seat || !this.respondPending.has(seat.seat)) return;
    this.respondPending.delete(seat.seat);
    // 在场真人都已放行 → 提前解锁 AI 表态（不必等满 6 秒反应窗口）；否则照常收窗。
    const st = this.state;
    const humanLeft = [...this.respondPending].some((sd) => !st.players[sd].isAI && this.seats[sd].conn !== null);
    if (!humanLeft && this.respondReleaseAis) this.respondReleaseAis();
    else this.checkRespondProceed();
  }

  private drive(): void {
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    this.clearRespondTimers();
    this.clearTurnTimer();
    if (!this.state || this.state.phase.kind === 'over') return;

    if (this.state.phase.kind === 'respond') {
      this.driveRespond();
      return;
    }
    const actor = actorOf(this.state);

    if (!this.state.players[actor].isAI) {
      if (this.seats[actor].conn) {
        this.turnDeadline = Date.now() + TURN_TIMEOUT_MS;
        this.broadcastSync();
        this.turnTimer = setTimeout(() => this.onTurnTimeout(actor), TURN_TIMEOUT_MS);
      }
      return;
    }

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

  private onTurnTimeout(seat: number): void {
    this.turnTimer = null;
    this.turnDeadline = null;
    if (!this.state || this.state.phase.kind === 'over') return;
    const actor = actorOf(this.state);
    if (actor !== seat || this.state.players[actor].isAI) { this.drive(); return; }

    const profile = PROFILE_ORDER[Math.floor(Math.random() * PROFILE_ORDER.length)];
    const tempAi = new AiPlayer({ seat, seed: (Date.now() & 0x7fffffff) >>> 0, profile, difficulty: ROOM_DIFFICULTY });
    tempAi.observe(this.lastEvents, viewFor(this.state, seat));
    const cmd = tempAi.decide(viewFor(this.state, seat));
    this.applyCommand(seat, cmd, null);
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
      const leftMsg: ServerMsg = { t: 'playerLeft', seat: seat.seat, name: seat.name };
      for (const s of this.seats) if (s.conn && s !== seat) s.conn.send(leftMsg);
    }
    this.reassignHostIfLeaving(token);
    if (inProgress) this.drive();
    if (conn) conn.close();
    this.broadcastRoom();
    this.maybeDispose();
  }

  dispose(): void {
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    this.clearRespondTimers();
    this.clearTurnTimer();
    this.clearGrace();
  }
}
