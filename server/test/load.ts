import { WebSocket } from 'ws';
import { chooseCommand } from '../../web/src/engine/ai';
import { ClientMsg, ServerMsg } from '../../web/src/net/protocol';
import { PlayerView } from '../../web/src/engine/types';

const URL = process.env.LIVE_URL ?? 'ws://127.0.0.1:8787/ws'; // 默认本地；压测线上设 LIVE_URL=wss://your-domain/ws
const ROOMS = Number(process.env.ROOMS ?? 30);
const PER = Number(process.env.PER ?? 3);
const TAG = process.env.TAG ?? 'load';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let errors = 0;
let moves = 0;

class Client {
  ws: WebSocket;
  seat = -1;
  host = false;
  over = false;
  constructor(
    private room: string,
    private token: string,
  ) {
    this.ws = new WebSocket(URL);
    this.ws.on('open', () => this.send({ t: 'join', roomId: room, token, name: token.slice(-4), players: PER }));
    this.ws.on('message', (d) => this.msg(JSON.parse(d.toString()) as ServerMsg));
    this.ws.on('error', () => errors++);
  }
  private msg(m: ServerMsg) {
    if (m.t === 'joined') {
      this.seat = m.you;
      this.host = m.host;
    } else if (m.t === 'sync') {
      const v: PlayerView = m.view;
      if (v.prompt.kind === 'over') {
        this.over = true;
        return;
      }
      if (v.prompt.kind !== 'idle') {
        moves++;
        this.send({ t: 'cmd', roomId: this.room, token: this.token, command: chooseCommand(v) });
      }
    }
  }
  send(m: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
  start() {
    this.send({ t: 'start', roomId: this.room, token: this.token });
  }
  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

async function waitFor(cond: () => boolean, ms: number, label: string): Promise<boolean> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) {
      console.error('timeout: ' + label);
      return false;
    }
    await sleep(50);
  }
  return true;
}

async function main() {
  const total = ROOMS * PER;
  console.log(`[load] ${ROOMS} rooms x ${PER} players = ${total} concurrent clients -> ${URL}`);
  const t0 = Date.now();
  const clients: Client[] = [];
  for (let r = 0; r < ROOMS; r++) {
    for (let p = 0; p < PER; p++) {
      clients.push(new Client(`${TAG}-${r}`, `${TAG}-${r}-${p}-${Math.random().toString(36).slice(2, 8)}`));
      await sleep(8);
    }
  }
  const joined = await waitFor(() => clients.every((c) => c.seat >= 0), 30000, 'all joined');
  console.log(`[load] joined=${clients.filter((c) => c.seat >= 0).length}/${total} in ${Date.now() - t0}ms`);
  if (joined) {
    for (let r = 0; r < ROOMS; r++) {
      const host = clients.slice(r * PER, r * PER + PER).find((c) => c.host);
      if (host) host.start();
    }
  }
  console.log('[load] all games started; playing...');
  const done = await waitFor(() => clients.every((c) => c.over), 240000, 'all games over');
  const elapsed = Date.now() - t0;
  const finished = clients.filter((c) => c.over).length;
  console.log(`\n[load] result: ${finished}/${total} clients finished, ${moves} moves sent, errors=${errors}, elapsed=${(elapsed / 1000).toFixed(1)}s, allDone=${done}`);
  for (const c of clients) c.close();
  await sleep(500);
  process.exit(done && errors === 0 ? 0 : 1);
}
void main();
