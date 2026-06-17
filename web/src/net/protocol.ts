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

export interface PingMsg {
  t: 'ping';
}

export type ClientMsg = JoinMsg | StartMsg | RestartMsg | CmdMsg | LeaveMsg | PingMsg;

export interface JoinedMsg {
  t: 'joined';
  roomId: string;
  you: number;
  capacity: number;
  host: boolean;
  started: boolean;
  seats: SeatInfo[];
}

export interface RoomMsg {
  t: 'room';
  roomId: string;
  capacity: number;
  started: boolean;
  hostSeat: number | null;
  seats: SeatInfo[];
}

export interface SyncMsg {
  t: 'sync';
  view: PlayerView;
  events: GameEvent[];
  turnDeadline?: number;
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
