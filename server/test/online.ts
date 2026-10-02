import { WebSocket } from 'ws';
import { startTestServer } from './fixture';
import { chooseCommand } from '../../web/src/engine/ai';
import { ClientMsg, ServerMsg } from '../../web/src/net/protocol';
import { PlayerView } from '../../web/src/engine/types';

let serverUrl = '';
let backgroundError: Error | null = null;
const clients = new Set<TestClient>();

function fail(msg: string): never {
  throw new Error(msg);
}

function handIds(view: PlayerView): Set<number> {
  return new Set(view.yourHand.map((c) => c.id));
}

class TestClient {
  ws: WebSocket;
  token: string;
  seat = -1;
  host = false;
  done = false;
  ranking = false;
  weatherSetting = false; // 从 joined/room 下发读到的房间天气设置
  weatherChanceSetting = 0; // 房间天气频率设置
  sawWeatherEvent = false; // 对局内是否实际降下过天气
  private snapshot: { key: string; cards: Set<number> } | null = null;
  private name: string;
  private roomId: string;
  private players: number;
  private weather: boolean;

  constructor(roomId: string, token: string, name: string, players: number, weather = false) {
    this.roomId = roomId;
    this.token = token;
    this.name = name;
    this.players = players;
    this.weather = weather;
    clients.add(this);
    this.ws = new WebSocket(serverUrl);
    this.ws.on('open', () => this.send({ t: 'join', roomId, token, name, players, weather }));
    this.ws.on('message', (d) => {
      try { this.onMsg(JSON.parse(d.toString()) as ServerMsg); }
      catch (error) { backgroundError = error instanceof Error ? error : new Error(String(error)); }
    });
    this.ws.on('error', (error) => { backgroundError = error; });
  }

  private send(msg: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private onMsg(msg: ServerMsg) {
    if (msg.t === 'joined') {
      this.seat = msg.you;
      this.host = msg.host;
      this.weatherSetting = msg.weather;
      this.weatherChanceSetting = msg.weatherChance;
    } else if (msg.t === 'room') {
      this.weatherSetting = msg.weather;
      this.weatherChanceSetting = msg.weatherChance;
    } else if (msg.t === 'sync') {
      const v = msg.view;
      if (v.you !== this.seat) fail(`座位 ${this.seat} 收到的视图 you=${v.you} 不一致`);
      if (msg.events.some((e) => e.type === 'WeatherChanged')) this.sawWeatherEvent = true;
      for (const field of ['deck', 'pile', 'discard', 'rng', 'config']) {
        if (Object.hasOwn(v, field)) fail(`座位视图泄露内部字段 ${field}`);
      }
      for (const player of v.players) {
        if (Object.hasOwn(player, 'hand') || Object.hasOwn(player, 'scored')) fail('公开玩家资料泄露真实牌数组');
      }
      const cards = handIds(v);
      if (cards.size !== v.yourHand.length) fail('自己的手牌含重复牌 id');
      // Match snapshots by the complete common/public state, not all cards seen during a game:
      // overflow can legitimately return a card to the deck for somebody else to draw later.
      const { you: _you, yourHand: _hand, prompt: _prompt, ...publicState } = v;
      this.snapshot = { key: JSON.stringify(publicState), cards };
      for (const other of clients) {
        if (other === this || other.roomId !== this.roomId || other.snapshot?.key !== this.snapshot.key) continue;
        if ([...cards].some((id) => other.snapshot!.cards.has(id))) fail('同一公共状态下两名玩家手牌重叠');
      }
      if (v.prompt.kind === 'over') {
        this.done = true;
        this.ranking = !!v.ranking && v.ranking.length === this.players;
        return;
      }
      if (v.prompt.kind !== 'idle') {
        const cmd = chooseCommand(v);
        setTimeout(() => this.send({ t: 'cmd', roomId: this.roomId, token: this.token, command: cmd }), 0);
      }
    }
  }

  start() {
    this.send({ t: 'start', roomId: this.roomId, token: this.token });
  }

  setRoomCfg(cfg: { weather?: boolean; weatherChance?: number }) {
    this.send({ t: 'setRoomCfg', roomId: this.roomId, token: this.token, ...cfg });
  }

  close() {
    this.ws.close();
  }
}

async function waitFor(cond: () => boolean, ms: number, label: string): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (backgroundError) throw backgroundError;
    if (Date.now() - t0 > ms) fail(`超时等待：${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
  if (backgroundError) throw backgroundError;
}

async function playRoom(roomId: string, players: number, weather = false, toggleTo?: boolean): Promise<TestClient[]> {
  const a = new TestClient(roomId, `tA-${roomId}`, '甲', players, weather);
  const b = new TestClient(roomId, `tB-${roomId}`, '乙', players, weather);
  await waitFor(() => a.seat >= 0 && b.seat >= 0, 3000, `${roomId} 双方入座`);
  if (a.seat === b.seat) fail(`两名玩家被分到同一座位 ${a.seat}`);
  const host = a.host ? a : b.host ? b : null;
  if (!host) fail('没有房主');
  if (toggleTo !== undefined) {
    // 大厅实时切换：先确认建房初值已下发全员，再由房主切换天气+频率并确认广播回正
    await waitFor(() => a.weatherSetting === weather && b.weatherSetting === weather, 3000, `${roomId} 建房天气初值下发`);
    host.setRoomCfg({ weather: toggleTo, weatherChance: 0.45 });
    const ok = () =>
      a.weatherSetting === toggleTo && b.weatherSetting === toggleTo &&
      Math.abs(a.weatherChanceSetting - 0.45) < 1e-9 && Math.abs(b.weatherChanceSetting - 0.45) < 1e-9;
    await waitFor(ok, 3000, `${roomId} 房主切换天气+频率广播全员`);
  }
  host.start();
  await waitFor(() => a.done && b.done, 30000, `${roomId} 对局终局`);
  return [a, b];
}

async function main() {
  const server = await startTestServer({ YUANHE_DELAY_SCALE: '0' });
  serverUrl = server.url;

  try {
    const [room1, room2, room3] = await Promise.all([
      playRoom('alpha', 3),
      playRoom('beta', 4),
      playRoom('gamma', 4, false, true), // 建房关 → 房主在大厅切到开 → 开局（验证实时切换 + deal 用最新值）
    ]);

    for (const c of [...room1, ...room2, ...room3]) {
      if (!c.ranking) fail(`座位 ${c.seat} 终局未收到完整排名`);
    }

    // gamma：建房关、房主大厅切到开（playRoom 内已断言广播两态），开局后 deal 应使用最新值=开
    for (const c of room3) if (!c.weatherSetting) fail(`天气房间 gamma 座位 ${c.seat} 切换后未保持 weather=true`);
    for (const c of [...room1, ...room2]) if (c.weatherSetting) fail(`经典房间座位 ${c.seat} 误收到 weather=true`);
    const sawWeather = room3.some((c) => c.sawWeatherEvent);

    for (const c of [...room1, ...room2, ...room3]) c.close();

    console.log('✓ 三房间（alpha 3人 / beta 4人 / gamma 4人）各自独立跑完整局');
    console.log('✓ 视图座位一致、无内部牌数组，同一公共状态下各人手牌无重叠');
    console.log('✓ 终局排名完整下发');
    console.log('✓ 房主在大厅实时切换天气+频率：建房初值与切换后值均正确广播全员');
    console.log(`✓ 切换为开后开局，deal 采用最新设置；本局${sawWeather ? '观测到天气降下' : '未碰巧降下天气（概率事件）'}`);
    console.log('\n联机端到端测试通过。');
  } finally {
    for (const client of clients) client.ws.terminate();
    await server.stop();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
