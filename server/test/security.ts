import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { ServerMsg, SyncMsg } from '../../web/src/net/protocol';
import { startTestServer } from './fixture';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

class Client {
  readonly messages: ServerMsg[] = [];
  readonly ws: WebSocket;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data) => this.messages.push(JSON.parse(data.toString()) as ServerMsg));
    this.ws.on('error', () => undefined);
  }

  async waitFor<T extends ServerMsg>(predicate: (msg: ServerMsg) => msg is T, from = 0): Promise<T> {
    const until = Date.now() + 2500;
    while (Date.now() < until) {
      const found = this.messages.slice(from).find(predicate);
      if (found) return found;
      if (this.ws.readyState === WebSocket.CLOSED) throw new Error('Socket closed before the expected response');
      await sleep(10);
    }
    throw new Error(`Expected response not received; messages=${JSON.stringify(this.messages.slice(from))}`);
  }

  async request<T extends ServerMsg>(message: unknown, type: T['t']): Promise<T> {
    const from = this.messages.length;
    this.ws.send(JSON.stringify(message));
    return this.waitFor((msg): msg is T => msg.t === type, from);
  }

  async join(roomId: string, token: string, name = token, players = 2) {
    return this.request({ t: 'join', roomId, token, name, players }, 'joined');
  }

  latestSync(): SyncMsg {
    const sync = this.messages.filter((msg): msg is SyncMsg => msg.t === 'sync').at(-1);
    assert.ok(sync, 'Expected a game view');
    return sync;
  }
}

interface Fixture {
  connect(): Promise<Client>;
  rooms(): Promise<number>;
}

async function withServer(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const server = await startTestServer({
    YUANHE_TURN_TIMEOUT_MS: '60000', YUANHE_ROOM_GRACE_MS: '60000', YUANHE_DELAY_SCALE: '1',
  });
  const clients: Client[] = [];
  try {
    const healthUrl = `http://127.0.0.1:${server.port}/healthz`;
    await run({
      async connect() {
        const client = new Client(server.url);
        clients.push(client);
        await once(client.ws, 'open');
        return client;
      },
      async rooms() {
        const body = await (await fetch(healthUrl)).json() as { rooms: number };
        return body.rooms;
      },
    });
  } catch (error) {
    throw new Error(`${String(error)}\nServer output:\n${server.output()}`, { cause: error });
  } finally {
    for (const client of clients) client.ws.terminate();
    await server.stop();
  }
}

test('reject malformed messages and keep the connection/server usable', async () => {
  await withServer(async ({ connect, rooms }) => {
    const client = await connect();
    const identity = { roomId: 'validation', token: 'owner' };
    const malformed = [
      { t: 'join', ...identity, name: 123 },
      { t: 'join', ...identity, players: 2.5 },
      { t: 'join', ...identity, weatherChance: '0.3' },
      { t: 'cmd', ...identity, command: null },
      { t: 'cmd', ...identity, command: { type: 'ChooseNumber', ns: [1.5] } },
      { t: 'cmd', ...identity, command: { type: 'PlayCard', cardId: 0, claim: { color: 'invalid', num: 1 } } },
      { t: 'setRoomCfg', ...identity, weather: 'true' },
      { t: 'unknown', ...identity },
    ];
    for (const msg of malformed) await client.request(msg, 'error');
    const from = client.messages.length;
    client.ws.send('{');
    await client.waitFor((msg): msg is Extract<ServerMsg, { t: 'error' }> => msg.t === 'error', from);
    assert.equal(await rooms(), 0, 'Invalid joins must not allocate rooms');
    await client.join(identity.roomId, identity.token);
    await client.request({ t: 'ping' }, 'pong');
    assert.equal(await rooms(), 1);
  });
});

test('only the original token restores a disconnected seat', async () => {
  await withServer(async ({ connect }) => {
    const owner = await connect();
    const witness = await connect();
    await owner.join('restore', 'owner-token', 'Same name');
    await witness.join('restore', 'witness-token');
    await owner.request({ t: 'start', roomId: 'restore', token: 'owner-token' }, 'sync');
    const from = witness.messages.length;
    owner.ws.terminate();
    await witness.waitFor((msg): msg is Extract<ServerMsg, { t: 'room' }> => msg.t === 'room' && !msg.seats[0].connected, from);
    const stranger = await connect();
    await stranger.request({ t: 'join', roomId: 'restore', token: 'new-token', name: 'Same name' }, 'error');
    assert.equal(stranger.messages.some((msg) => msg.t === 'sync' || msg.t === 'joined'), false);
    const restored = await connect();
    const joined = await restored.join('restore', 'owner-token', 'Same name');
    assert.equal(joined.t, 'joined');
    assert.equal((await restored.waitFor((msg): msg is SyncMsg => msg.t === 'sync')).view.you, 0);
  });
});

test('commands are bound to the socket identity and room; only the host can restart', async () => {
  await withServer(async ({ connect }) => {
    const owner = await connect();
    const guest = await connect();
    await owner.join('binding', 'owner');
    await guest.join('binding', 'guest');
    await guest.request({ t: 'start', roomId: 'binding', token: 'owner' }, 'error');
    await owner.request({ t: 'start', roomId: 'wrong-room', token: 'owner' }, 'error');
    await owner.request({ t: 'start', roomId: 'binding', token: 'owner' }, 'sync');
    await guest.request({ t: 'restart', roomId: 'binding', token: 'guest' }, 'error');
    await guest.request({ t: 'leave', roomId: 'binding', token: 'owner' }, 'error');
    await owner.request({ t: 'ping' }, 'pong');
  });
});

test('repeat joins are idempotent and cannot change the socket identity', async () => {
  await withServer(async ({ connect }) => {
    const owner = await connect();
    await owner.join('repeat', 'original');
    await owner.join('repeat', 'original');
    await owner.request({ t: 'join', roomId: 'repeat', token: 'replacement', name: 'new' }, 'error');
    const guest = await connect();
    await guest.join('repeat', 'guest');
    await owner.request({ t: 'start', roomId: 'repeat', token: 'original' }, 'sync');
  });
});

test('failed joins retain the original room; successful switches and lobby disconnects release seats', async () => {
  await withServer(async ({ connect, rooms }) => {
    const mover = await connect();
    const owner = await connect();
    const guest = await connect();
    await mover.join('source', 'mover');
    await owner.join('target', 'owner');
    await guest.join('target', 'guest');
    await mover.request({ t: 'join', roomId: 'target', token: 'mover' }, 'error');
    await mover.request({ t: 'setRoomCfg', roomId: 'source', token: 'mover', weather: true }, 'room');
    const from = owner.messages.length;
    guest.ws.terminate();
    await owner.waitFor((msg): msg is Extract<ServerMsg, { t: 'room' }> => msg.t === 'room' && !msg.seats[1].connected, from);
    await mover.join('target', 'mover');
    assert.equal(await rooms(), 1, 'Successful switch must remove the abandoned empty lobby');
    const cleared = owner.messages.length;
    mover.ws.terminate();
    await owner.waitFor((msg): msg is Extract<ServerMsg, { t: 'room' }> => msg.t === 'room' && !msg.seats[1].connected, cleared);
    const replacement = await connect();
    await replacement.join('target', 'replacement');
    await owner.request({ t: 'start', roomId: 'target', token: 'owner' }, 'sync');
  });
});

test('a replacement connection closes the old one without disconnecting the restored seat', async () => {
  await withServer(async ({ connect }) => {
    const original = await connect();
    const witness = await connect();
    await original.join('replacement', 'owner');
    await witness.join('replacement', 'guest');
    const closed = once(original.ws, 'close', { signal: AbortSignal.timeout(2500) });
    const replacement = await connect();
    await replacement.join('replacement', 'owner');
    const [closeCode] = await closed;
    assert.equal(closeCode, 4001, 'Replaced clients need a distinct code to stop automatic reconnecting');
    await replacement.request({ t: 'start', roomId: 'replacement', token: 'owner' }, 'sync');
    assert.equal(replacement.latestSync().view.players[0].isAI, false);
  });
});

test('Accept is an individual pass and cannot skip another human response', async () => {
  await withServer(async ({ connect }) => {
    const clients = await Promise.all([connect(), connect(), connect()]);
    for (let seat = 0; seat < clients.length; seat++) await clients[seat].join('responses', `token-${seat}`, `Player ${seat}`, 3);
    await clients[0].request({ t: 'start', roomId: 'responses', token: 'token-0' }, 'sync');
    for (const client of clients) await client.waitFor((msg): msg is SyncMsg => msg.t === 'sync');
    const actor = clients[0].latestSync().view.current;
    const hand = clients[actor].latestSync().view.yourHand;
    const card = hand.find((item) => item.kind !== 'functional');
    assert.ok(card);
    const from = clients.map((client) => client.messages.length);
    await clients[actor].request({ t: 'cmd', roomId: 'responses', token: `token-${actor}`, command: { type: 'PlayCard', cardId: card.id, claim: { color: 'aurel', num: 1 } } }, 'sync');
    for (let seat = 0; seat < clients.length; seat++) await clients[seat].waitFor((msg): msg is SyncMsg => msg.t === 'sync', from[seat]);
    const responder = clients[actor].latestSync().view.current;
    await clients[responder].request({ t: 'cmd', roomId: 'responses', token: `token-${responder}`, command: null }, 'error');
    clients[responder].ws.send(JSON.stringify({ t: 'cmd', roomId: 'responses', token: `token-${responder}`, command: { type: 'Accept' } }));
    await sleep(100);
    assert.equal(clients[responder].latestSync().view.prompt.kind, 'respond', 'Another player still has a right to challenge');
    const other = [0, 1, 2].find((seat) => seat !== actor && seat !== responder)!;
    await clients[other].request({ t: 'pass', roomId: 'responses', token: `token-${other}` }, 'sync');
    assert.notEqual(clients[other].latestSync().view.prompt.kind, 'respond');
  });
});
