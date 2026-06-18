import { Command, GameEvent, PlayerView } from '../engine/types';

export interface SeatInfo {
  seat: number;
  name: string;
  isAI: boolean;
  connected: boolean;
}

export interface JoinMsg {
  t: 'join';
  roomId: string;
  token: string;
  name?: string;
  players?: number;
  weather?: boolean; // 建房者选择是否开混沌天气（仅建房时生效，与 players 同套路）
  weatherChance?: number; // 建房者选择的天气触发频率（0..1）
}

export interface StartMsg {
  t: 'start';
  roomId: string;
  token: string;
}

export interface RestartMsg {
  t: 'restart';
  roomId: string;
  token: string;
}

export interface CmdMsg {
  t: 'cmd';
  roomId: string;
  token: string;
  command: Command;
}

export interface LeaveMsg {
  t: 'leave';
  roomId: string;
  token: string;
}

export interface PassMsg {
  t: 'pass';
  roomId: string;
  token: string;
}

export interface SetRoomCfgMsg {
  t: 'setRoomCfg';
  roomId: string;
  token: string;
  weather?: boolean; // 房主在大厅实时调房间设置（仅校验房主）；按字段部分更新
  weatherChance?: number; // 天气触发频率（0..1）
}

export interface PingMsg {
  t: 'ping';
}

export type ClientMsg = JoinMsg | StartMsg | RestartMsg | CmdMsg | LeaveMsg | PassMsg | SetRoomCfgMsg | PingMsg;

export interface JoinedMsg {
  t: 'joined';
  roomId: string;
  you: number;
  capacity: number;
  host: boolean;
  started: boolean;
  seats: SeatInfo[];
  weather: boolean;
  weatherChance: number;
}

export interface RoomMsg {
  t: 'room';
  roomId: string;
  capacity: number;
  started: boolean;
  hostSeat: number | null;
  seats: SeatInfo[];
  weather: boolean;
  weatherChance: number;
}

export interface SyncMsg {
  t: 'sync';
  view: PlayerView;
  events: GameEvent[];
  turnDeadline?: number;
  turnDuration?: number;
}

export interface PlayerLeftMsg {
  t: 'playerLeft';
  seat: number;
  name: string;
}

export interface ErrorMsg {
  t: 'error';
  message: string;
}

export interface PongMsg {
  t: 'pong';
}

export type ServerMsg = JoinedMsg | RoomMsg | SyncMsg | PlayerLeftMsg | ErrorMsg | PongMsg;

export const MAX_NAME = 16;
export const MAX_ROOM_ID = 32;
