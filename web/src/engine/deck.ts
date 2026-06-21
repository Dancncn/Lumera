import { Card, Color, COLORS, FunctionalKind } from './types';

// 一张牌「除 id 外」的规格（在联合类型上手写，避免 Omit 在 union 上只保留公共键）。
type CardSpec =
  | { kind: 'number'; color: Color; num: number }
  | { kind: 'functional'; func: FunctionalKind }
  | { kind: 'wild' };

// 牌库构成（规则 §二）：
// - 数字牌 76：每色 0 各 1（4 张），每色 1..9 各 2（72 张）。0 视为该色最大(=10)。
// - 功能牌：转向 8 + 禁止 8（仅 >2 人时加入；2 人局剔除方向/功能）。
// - 万能牌：数量 = 玩家人数。
// - 打 0 奖励：直接加入计分区（+2），不再单独发放计分卡。
export function buildDeck(players: number): Card[] {
  const cards: Card[] = [];
  let id = 0;
  const push = (c: CardSpec) => cards.push({ ...c, id: id++ });

  for (const color of COLORS as Color[]) {
    push({ kind: 'number', color, num: 0 });
    for (let n = 1; n <= 9; n++) {
      push({ kind: 'number', color, num: n });
      push({ kind: 'number', color, num: n });
    }
  }

  if (players > 2) {
    for (let i = 0; i < 8; i++) push({ kind: 'functional', func: 'reverse' });
    for (let i = 0; i < 8; i++) push({ kind: 'functional', func: 'skip' });
  }

  for (let i = 0; i < players; i++) push({ kind: 'wild' });

  return cards;
}
