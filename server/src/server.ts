import { createServer } from 'node:http';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Hub } from './hub';
import { Conn } from './room';
import { makeStaticHandler } from './static';
import { countGame, countOnline, countVisit, liveOnline, snapshot, touchSession } from './stats';
import { ClientMsg, MAX_ROOM_ID } from '../../web/src/net/protocol';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const PUBLIC_DIR = isAbsolute(process.env.PUBLIC_DIR ?? '')
  ? (process.env.PUBLIC_DIR as string)
  : join(here, process.env.PUBLIC_DIR ?? 'public');

const hub = new Hub();
const staticHandler = makeStaticHandler(PUBLIC_DIR);

const http = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, rooms: hub.count() }));
    return;
  }
  if (req.url === '/stats') {
    res
      .writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      .end(JSON.stringify({ ...snapshot(), online: liveOnline() }));
    return;
  }
  // 心跳：本机/任何打开的页面定期上报，计入「当前在线」
  if (req.url && req.url.startsWith('/beat')) {
    try {
      const s = new URL(req.url, 'http://x').searchParams.get('s');
      if (s) touchSession(s.slice(0, 64));
    } catch {
      /* ignore */
    }
    res
      .writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      .end(JSON.stringify({ online: liveOnline() }));
    return;
  }
  // 单机本地对局上报（联机对局由 room 内部计数）
  if (req.method === 'POST' && req.url && req.url.startsWith('/game')) {
    countGame();
    res
      .writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      .end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) countVisit();
  staticHandler(req, res).catch(() => {
    try {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('500');
    } catch {
      /* ignore */
    }
  });
});

const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS ?? 2000);
const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 64 * 1024 });

interface Ctx {
  conn: Conn;
  roomId: string | null;
}

type LiveSocket = WebSocket & { __alive?: boolean };

let nextId = 1;

function cleanRoomId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().slice(0, MAX_ROOM_ID);
  if (!/^[\w\-一-龥]{1,32}$/u.test(s)) return null;
  return s;
}

function parse(data: WebSocket.RawData): ClientMsg | null {
  try {
    const msg = JSON.parse(data.toString());
    if (msg && typeof msg.t === 'string') return msg as ClientMsg;
  } catch {
    /* ignore */
  }
  return null;
}

wss.on('connection', (ws) => {
  if (wss.clients.size > MAX_CONNECTIONS) {
    try {
      ws.close(1013, 'server busy');
    } catch {
      /* ignore */
    }
    return;
  }
  const conn: Conn = {
    id: nextId++,
    send(msg) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    close() {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };
  const ctx: Ctx = { conn, roomId: null };
  (ws as LiveSocket).__alive = true;
  countOnline(wss.clients.size);

  ws.on('pong', () => {
    (ws as LiveSocket).__alive = true;
  });

  ws.on('message', (data) => {
    const msg = parse(data);
    if (!msg) return;
    if (msg.t === 'ping') {
      conn.send({ t: 'pong' });
      return;
    }
    if (msg.t === 'join') {
      const roomId = cleanRoomId(msg.roomId);
      if (!roomId || typeof msg.token !== 'string' || !msg.token) {
        conn.send({ t: 'error', message: '房间号或身份无效' });
        return;
      }
      const room = hub.obtain(roomId, msg.players);
      if (!room) {
        conn.send({ t: 'error', message: '服务器繁忙，房间数已达上限，请稍后再试' });
        return;
      }
      ctx.roomId = roomId;
      room.join(conn, msg.token, msg.name, msg.players);
      return;
    }

    const roomId = ctx.roomId;
    if (!roomId) {
      conn.send({ t: 'error', message: '尚未加入房间' });
      return;
    }
    const room = hub.find(roomId);
    if (!room) {
      conn.send({ t: 'error', message: '房间不存在' });
      return;
    }
    if (typeof (msg as { token?: unknown }).token !== 'string') return;
    const token = (msg as { token: string }).token;
    switch (msg.t) {
      case 'cmd':
        room.command(token, msg.command);
        break;
      case 'start':
        room.start(token);
        break;
      case 'restart':
        room.restart(token);
        break;
      case 'leave':
        room.leave(token);
        ctx.roomId = null;
        break;
    }
  });

  ws.on('close', () => {
    if (ctx.roomId) {
      const room = hub.find(ctx.roomId);
      if (room) room.disconnect(conn);
    }
  });

  ws.on('error', () => {
    /* close handler does cleanup */
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    const live = ws as LiveSocket;
    if (live.__alive === false) {
      ws.terminate();
      continue;
    }
    live.__alive = false;
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }
}, 30000);

http.on('close', () => clearInterval(heartbeat));

http.listen(PORT, HOST, () => {
  console.log(`源河联机服务器 ws://${HOST}:${PORT}/ws  静态目录=${PUBLIC_DIR}`);
});
