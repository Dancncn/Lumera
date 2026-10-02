import { createServer } from 'node:http';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Hub } from './hub';
import { Conn } from './room';
import { makeStaticHandler } from './static';
import { countGame, countOnline, countVisit, liveOnline, snapshot, touchSession } from './stats';
import { cleanRoomId, parseClientMessage } from './messages';

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
  token: string | null;
}

type LiveSocket = WebSocket & { __alive?: boolean };

let nextId = 1;

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
      if (ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify(msg));
      } catch (error) {
        console.error('WebSocket send failed', error);
        ws.terminate();
      }
    },
    close(code, reason) {
      try {
        ws.close(code, reason);
      } catch {
        /* ignore */
      }
    },
  };
  const ctx: Ctx = { conn, roomId: null, token: null };
  (ws as LiveSocket).__alive = true;
  countOnline(wss.clients.size);

  ws.on('pong', () => {
    (ws as LiveSocket).__alive = true;
  });

  ws.on('message', (data) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      const msg = parseClientMessage(data.toString());
      if (!msg) {
        conn.send({ t: 'error', message: '消息格式无效' });
        return;
      }
      if (msg.t === 'ping') {
        conn.send({ t: 'pong' });
        return;
      }
      const roomId = cleanRoomId(msg.roomId)!;
      if (msg.t === 'join') {
        const previous = ctx.roomId ? hub.find(ctx.roomId) : undefined;
        if (ctx.token && (ctx.token !== msg.token || !previous?.ownsConnection(conn, ctx.token))) {
          conn.send({ t: 'error', message: '连接身份不匹配，请重新连接' });
          return;
        }
        const room = hub.obtain(roomId, msg.players, msg.weather === true, msg.weatherChance);
        if (!room) {
          conn.send({ t: 'error', message: '服务器繁忙，房间数已达上限，请稍后再试' });
          return;
        }
        // A rejected join leaves the original membership intact. Detach only after success.
        if (!room.join(conn, msg.token, msg.name, msg.players)) return;
        ctx.roomId = roomId;
        ctx.token = msg.token;
        if (previous && previous !== room) previous.disconnect(conn);
        return;
      }

      if (!ctx.roomId || !ctx.token) {
        conn.send({ t: 'error', message: '尚未加入房间' });
        return;
      }
      const room = hub.find(ctx.roomId);
      if (roomId !== ctx.roomId || msg.token !== ctx.token || !room?.ownsConnection(conn, ctx.token)) {
        conn.send({ t: 'error', message: '连接身份或房间不匹配' });
        return;
      }
      switch (msg.t) {
        case 'cmd':
          room.command(ctx.token, msg.command);
          break;
        case 'pass':
          room.pass(ctx.token);
          break;
        case 'setRoomCfg':
          room.setRoomCfg(ctx.token, { weather: msg.weather, weatherChance: msg.weatherChance });
          break;
        case 'start':
          room.start(ctx.token);
          break;
        case 'restart':
          room.restart(ctx.token);
          break;
        case 'leave':
          room.leave(ctx.token);
          ctx.roomId = null;
          ctx.token = null;
          break;
      }
    } catch (error) {
      console.error('WebSocket message handling failed', error);
      conn.send({ t: 'error', message: '操作未完成，请重试' });
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
  const address = http.address();
  const port = address && typeof address !== 'string' ? address.port : PORT;
  console.log(`源河联机服务器 ws://${HOST}:${port}/ws  静态目录=${PUBLIC_DIR}`);
});
