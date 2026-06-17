import { Difficulty } from '../engine/ai';

// 对局记录：只存在本机浏览器（localStorage），不上传。
export interface GameRecord {
  at: number; // 结束时间戳（ms）
  mode: 'local' | 'online';
  players: number;
  difficulty: Difficulty;
  rank: number; // 你的名次（1 起）
  score: number; // 你的总分
  won: boolean;
}

const KEY = 'lumera_history';
const CAP = 60;

export function loadRecords(): GameRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as GameRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveRecord(r: GameRecord): void {
  try {
    const arr = loadRecords();
    arr.unshift(r);
    localStorage.setItem(KEY, JSON.stringify(arr.slice(0, CAP)));
  } catch {
    /* ignore */
  }
}

export function clearRecords(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
