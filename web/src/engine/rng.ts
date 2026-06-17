// 注入式、可种子化的确定性 RNG（mulberry32）。
// 引擎不向系统要熵：种子由调用方给 —— 测试可复现、回放可复现。

/** 由当前状态推进一步，返回 [0,1) 的浮点与新状态。 */
export function nextRng(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) | 0;
  let x = Math.imul(t ^ (t >>> 15), 1 | t);
  x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
  const value = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  return { value, state: t };
}

/** 掷一颗六面骰：返回 [1,6] 与新状态。 */
export function rollDie(state: number): { rolled: number; state: number } {
  const { value, state: s } = nextRng(state);
  return { rolled: 1 + Math.floor(value * 6), state: s };
}

/** Fisher–Yates 洗牌（纯函数：返回新数组 + 新状态）。 */
export function shuffle<T>(arr: T[], state: number): { arr: T[]; state: number } {
  const out = arr.slice();
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextRng(s);
    s = r.state;
    const j = Math.floor(r.value * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return { arr: out, state: s };
}
