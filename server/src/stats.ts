import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Stats {
  visits: number;
  games: number;
  peakOnline: number;
}

const SEED: Stats = { visits: 56, games: 24, peakOnline: 8 };

const here = dirname(fileURLToPath(import.meta.url));
const FILE = process.env.STATS_FILE ?? join(here, 'state', 'stats.json');

let data: Stats = { ...SEED };
try {
  const loaded = JSON.parse(readFileSync(FILE, 'utf8'));
  data = {
    visits: Number(loaded.visits) || SEED.visits,
    games: Number(loaded.games) || SEED.games,
    peakOnline: Number(loaded.peakOnline) || SEED.peakOnline,
  };
} catch {
  /* first run / unreadable: keep seed */
}

let dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function persist(): void {
  if (!dirty) return;
  dirty = false;
  try {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(data));
  } catch {
    /* best-effort: keep counting in memory even if disk write fails */
  }
}

function mark(): void {
  dirty = true;
  if (!timer) timer = setTimeout(() => { timer = null; persist(); }, 2000);
}

export function countVisit(): void {
  data.visits++;
  mark();
}

export function countGame(): void {
  data.games++;
  mark();
}

export function countOnline(current: number): void {
  if (current > data.peakOnline) {
    data.peakOnline = current;
    mark();
  }
}

export function snapshot(): Stats {
  return { ...data };
}
