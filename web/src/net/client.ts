import { Command } from '../engine/types';
import { ClientMsg, JoinedMsg, PlayerLeftMsg, RoomMsg, ServerMsg, SyncMsg } from './protocol';

export type ConnStatus = 'connecting' | 'open' | 'closed';

export interface NetHandlers {
  onJoined(msg: JoinedMsg): void;
  onRoom(msg: RoomMsg): void;
  onSync(msg: SyncMsg): void;
  onPlayerLeft?(msg: PlayerLeftMsg): void;
  onError(message: string): void;
  onStatus(status: ConnStatus): void;
}

export interface JoinParams {
  roomId: string;
  token: string;
  name: string;
  players: number;
  weather: boolean;
  weatherChance: number;
}

function wsUrl(): string {
  const override = import.meta.env.VITE_WS_URL as string | undefined;
  if (override) return override;
  if (import.meta.env.DEV) return `ws://${location.hostname}:8787/ws`;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

let sessionToken: string | null = null;

export function loadToken(): string {
  if (sessionToken) return sessionToken;
  const key = 'yuanhe.token';
  try {
    const saved = localStorage.getItem(key);
    if (saved) return (sessionToken = saved);
  } catch { /* Private browsing may deny storage; keep the identity in memory. */ }
  sessionToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem(key, sessionToken); } catch { /* Reconnects still reuse the in-memory token. */ }
  return sessionToken;
}

export class NetClient {
  private ws: WebSocket | null = null;
  private params: JoinParams | null = null;
  private handlers: NetHandlers;
  private closedByUser = false;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(handlers: NetHandlers) {
    this.handlers = handlers;
  }

  connect(params: JoinParams): void {
    this.params = params;
    this.closedByUser = false;
    this.open();
  }

  private open(): void {
    if (!this.params) return;
    this.handlers.onStatus('connecting');
    const ws = new WebSocket(wsUrl());
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      const p = this.params!;
      this.raw({ t: 'join', roomId: p.roomId, token: p.token, name: p.name, players: p.players, weather: p.weather, weatherChance: p.weatherChance });
      this.handlers.onStatus('open');
    };

    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (msg.t) {
        case 'joined':
          this.handlers.onJoined(msg);
          break;
        case 'room':
          this.handlers.onRoom(msg);
          break;
        case 'sync':
          this.handlers.onSync(msg);
          break;
        case 'playerLeft':
          this.handlers.onPlayerLeft?.(msg);
          break;
        case 'error':
          this.handlers.onError(msg.message);
          break;
      }
    };

    ws.onclose = (event) => {
      this.ws = null;
      // A newer tab owns this token now. Reconnecting here would steal it back
      // and make both tabs disconnect each other indefinitely.
      if (event.code === 4001) {
        this.closedByUser = true;
        this.handlers.onStatus('closed');
        this.handlers.onError('此座位已在其他页面连接，请关闭重复页面。');
        return;
      }
      if (this.closedByUser) {
        this.handlers.onStatus('closed');
        return;
      }
      this.handlers.onStatus('connecting');
      this.retry = Math.min(this.retry + 1, 6);
      const wait = Math.min(500 * 2 ** (this.retry - 1), 8000);
      this.retryTimer = setTimeout(() => this.open(), wait);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  private detach(ws: WebSocket): void {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
  }

  private raw(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  command(cmd: Command): void {
    if (!this.params) return;
    this.raw({ t: 'cmd', roomId: this.params.roomId, token: this.params.token, command: cmd });
  }

  pass(): void {
    if (!this.params) return;
    this.raw({ t: 'pass', roomId: this.params.roomId, token: this.params.token });
  }

  setRoomCfg(cfg: { weather?: boolean; weatherChance?: number }): void {
    if (!this.params) return;
    this.raw({ t: 'setRoomCfg', roomId: this.params.roomId, token: this.params.token, ...cfg });
  }

  start(): void {
    if (!this.params) return;
    this.raw({ t: 'start', roomId: this.params.roomId, token: this.params.token });
  }

  restart(): void {
    if (!this.params) return;
    this.raw({ t: 'restart', roomId: this.params.roomId, token: this.params.token });
  }

  close(): void {
    this.closedByUser = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.ws && this.params) this.raw({ t: 'leave', roomId: this.params.roomId, token: this.params.token });
    if (this.ws) {
      this.detach(this.ws);
      this.ws.close();
    }
    this.ws = null;
    this.params = null;
  }
}
