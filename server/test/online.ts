import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chooseCommand } from '../../web/src/engine/ai';
import { ClientMsg, ServerMsg } from '../../web/src/net/protocol';
import { PlayerView } from '../../web/src/engine/types';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 8799;
const URL = `ws://127.0.0.1:${PORT}/ws`;

function fail(msg: string): never {
  console.error('✗ ' + msg);
  process.exit(1);
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
  leaked = false;
  myCards = new Set<number>();
  private name: string;
  private roomId: string;
  private players: number;

  constructor(roomId: string, token: string, name: string, players: number) {
    this.roomId = roomId;
    this.token = token;
    this.name = name;
    this.players = players;
    this.ws = new WebSocket(URL);
    this.ws.on('open', () => this.send({ t: 'join', roomId, token, name, players }));
    this.ws.on('message', (d) => this.onMsg(JSON.parse(d.toString()) as ServerMsg));
  }

  private send(msg: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private onMsg(msg: ServerMsg) {
    if (msg.t === 'joined') {
      this.seat = msg.you;
      this.host = msg.host;
    } else if (msg.t === 'sync') {
      const v = msg.view;
      if (v.you !== this.seat) fail(`座位 ${this.seat} 收到的视图 you=${v.you} 不一致`);
      for (const id of handIds(v)) this.myCards.add(id);
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

  close() {
    this.ws.close();
  }
}

async function waitFor(cond: () => boolean, ms: number, label: string): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) fail(`超时等待：${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function playRoom(roomId: string, players: number): Promise<TestClient[]> {
  const a = new TestClient(roomId, `tA-${roomId}`, '甲', players);
  const b = new TestClient(roomId, `tB-${roomId}`, '乙', players);
  await waitFor(() => a.seat >= 0 && b.seat >= 0, 3000, `${roomId} 双方入座`);
  if (a.seat === b.seat) fail(`两名玩家被分到同一座位 ${a.seat}`);
  const host = a.host ? a : b.host ? b : null;
  if (!host) fail('没有房主');
  host.start();
  await waitFor(() => a.done && b.done, 30000, `${roomId} 对局终局`);
  return [a, b];
}

async function main() {
  const server = spawn(process.execPath, ['--import', 'tsx', join(here, '../src/server.ts')], {
    env: { ...process.env, PORT: String(PORT), YUANHE_DELAY_SCALE: '0', PUBLIC_DIR: join(here, 'nope') },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  await new Promise((r) => setTimeout(r, 1200));

  try {
    const [room1, room2] = await Promise.all([playRoom('alpha', 3), playRoom('beta', 4)]);

    for (const c of [...room1, ...room2]) {
      if (!c.ranking) fail(`座位 ${c.seat} 终局未收到完整排名`);
    }

    const a = room1[0];
    const b = room1[1];
    const overlap = [...a.myCards].filter((id) => b.myCards.has(id));
    if (overlap.length) fail(`两名玩家的手牌出现重叠 id（疑似信息泄露）：${overlap.join(',')}`);

    for (const c of [...room1, ...room2]) c.close();

    console.log('✓ 双房间（alpha 3人 / beta 4人）各自独立跑完整局');
    console.log('✓ 每个座位只见到自己的视图（you 一致、手牌无重叠）');
    console.log('✓ 终局排名完整下发');
    console.log('\n联机端到端测试通过。');
    server.kill();
    process.exit(0);
  } catch (e) {
    server.kill();
    fail(String(e));
  }
}

void main();
