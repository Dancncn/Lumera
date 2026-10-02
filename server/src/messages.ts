import { isCommand } from '../../web/src/engine/validation';
import { ClientMsg, MAX_NAME, MAX_ROOM_ID } from '../../web/src/net/protocol';

export function cleanRoomId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return value.length <= MAX_ROOM_ID && /^[\w\-一-龥]+$/u.test(value) ? value : null;
}

function isChance(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** JSON is untrusted at runtime even when both applications share TypeScript types. */
export function isClientMessage(value: unknown): value is ClientMsg {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const msg = value as Record<string, unknown>;
  if (msg.t === 'ping') return true;
  if (!cleanRoomId(msg.roomId)) return false;
  if (typeof msg.token !== 'string' || !msg.token.trim() || msg.token.length > 256) return false;
  switch (msg.t) {
    case 'join':
      return (msg.name === undefined || (typeof msg.name === 'string' && msg.name.length <= MAX_NAME))
        && (msg.players === undefined || (typeof msg.players === 'number' && Number.isInteger(msg.players) && msg.players >= 2 && msg.players <= 4))
        && (msg.weather === undefined || typeof msg.weather === 'boolean')
        && (msg.weatherChance === undefined || isChance(msg.weatherChance));
    case 'setRoomCfg':
      return (msg.weather === undefined || typeof msg.weather === 'boolean')
        && (msg.weatherChance === undefined || isChance(msg.weatherChance));
    case 'cmd':
      return isCommand(msg.command);
    case 'start':
    case 'restart':
    case 'leave':
    case 'pass':
      return true;
    default:
      return false;
  }
}

export function parseClientMessage(raw: string): ClientMsg | null {
  try {
    const value: unknown = JSON.parse(raw);
    return isClientMessage(value) ? value : null;
  } catch {
    return null;
  }
}
