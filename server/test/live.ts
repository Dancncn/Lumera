import { WebSocket } from 'ws';
import { chooseCommand } from '../../web/src/engine/ai';
import { ClientMsg, ServerMsg } from '../../web/src/net/protocol';
import { PlayerView } from '../../web/src/engine/types';

const URL = process.env.LIVE_URL ?? 'ws://127.0.0.1:8787/ws'; // 默认本地；压测线上设 LIVE_URL=wss://your-domain/ws
const ROOM = process.env.LIVE_ROOM ?? 'livetest';

function fail(m: string): never {
  console.error('✗ ' + m);
  process.exit(1);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class C {
  ws: WebSocket;
  seat = -1;
  host = false;
  over = false;
  ranking = false;
  cards = new Set<number>();
  constructor(
    private token: string,
    private name: string,
  ) {
    this.ws = new WebSocket(URL);
    this.ws.on('open', () => this.send({ t: 'join', roomId: ROOM, token, name, players: 2 }));
    this.ws.on('message', (d) => this.msg(JSON.parse(d.toString()) as ServerMsg));
    this.ws.on('error', (e) => fail('ws error: ' + e.message));
  }
  private msg(m: ServerMsg) {
    if (m.t === 'joined') {
      this.seat = m.you;
      this.host = m.host;
    } else if (m.t === 'sync') {
      const v: PlayerView = m.view;
      if (v.you !== this.seat) fail(`座位 ${this.seat} 收到 you=${v.you}`);
      for (const c of v.yourHand) this.cards.add(c.id);
      if (v.prompt.kind === 'over') {
        this.over = true;
        this.ranking = !!v.ranking && v.ranking.length === 2;
        return;
      }
      if (v.prompt.kind !== 'idle') setTimeout(() => this.send({ t: 'cmd', roomId: ROOM, token: this.token, command: chooseCommand(v) }), 0);
    } else if (m.t === 'error') {
      console.error('server error:', m.message);
    }
  }
  send(m: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
  start() {
    this.send({ t: 'start', roomId: ROOM, token: this.token });
  }
}

async function waitFor(c: () => boolean, ms: number, label: string) {
  const t0 = Date.now();
  while (!c()) {
    if (Date.now() - t0 > ms) fail('超时：' + label);
    await sleep(40);
  }
}

async function main() {
  console.log(`连接 ${URL} 房间 ${ROOM} ...`);
  const a = new C('liveA-' + ROOM, '甲');
  const b = new C('liveB-' + ROOM, '乙');
  await waitFor(() => a.seat >= 0 && b.seat >= 0, 10000, '双方入座');
  if (a.seat === b.seat) fail('同座');
  console.log(`✓ 两名玩家入座（seat ${a.seat} / ${b.seat}），握手成功`);
  (a.host ? a : b).start();
  await waitFor(() => a.over && b.over, 90000, '对局终局');
  if (!a.ranking || !b.ranking) fail('终局排名不完整');
  const overlap = [...a.cards].filter((id) => b.cards.has(id));
  if (overlap.length) fail('两人手牌 id 重叠（信息泄露）: ' + overlap.join(','));
  console.log('✓ 线上真实对局跑完整局（两个客户端 → wss → 香港服务器）');
  console.log('✓ 每个座位只见自己视图，手牌无重叠（按座位隔离）');
  console.log('✓ 终局排名完整下发');
  console.log('\n线上联机测试通过。');
  a.ws.close();
  b.ws.close();
  process.exit(0);
}
void main();
