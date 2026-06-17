# 源 · Lumera —— 人机单机 Demo

数字阶梯牌面 +「盖牌宣称 + 可撒谎 + 被质疑」博弈的浏览器人机 demo。
皮是西方古典的，骨是「源—四力—回流」的东方循环。

## 这是什么 / 不是什么

这是按技术方案评审建议做的 **demo 形态**：纯 TypeScript 引擎 + React/Vite，全部跑在浏览器里，
**零后端、零 WASM、零类型生成**。它保留了原架构里真正有价值、且与语言无关的「思想」：

- **权威状态机 + 按座位过滤视图**：真相只在 `GameState` 里；`viewFor(state, seat)` 投影出每个座位有权看到的部分。AI 和真人拿同一份 `PlayerView`，结构上看不到底牌。
- **确定性引擎 + 注入可种子化 RNG**：`apply(state, seat, cmd) -> {state, events}` 是纯函数，给定种子可完全复现。
- **平衡数值抽进 `GameConfig`**，与状态机隔离。

它**不是**完整产品：没有联机、没有命运之轮（单局不触发）、AI 是朴素启发式。这些是「玩法验证通过后的第二批」。

> 说明：单机里「防作弊」是伪命题（真相本就在你自己的浏览器内存里）。`viewFor` 这层投影在 demo 里只是
> 「整洁分层 + 给 AI 喂同构视图」，它真正的安全意义要到联机阶段（引擎搬到服务器）才兑现。

## 运行

```bash
cd web
npm install
npm run dev        # 浏览器打开 http://localhost:5300
```

其它脚本：

```bash
npm run sim        # 无头模拟器：跑 1200 局，断言牌张守恒 / 无信息泄露 / 必然终局
npm run build      # tsc 类型检查 + vite 生产构建
npm run typecheck  # 仅类型检查
```

## 工程结构

```
web/src/
├── engine/            纯逻辑，无 React、无 IO（可平移回 Rust / 搬上 Node 服务器）
│   ├── types.ts       Card / Claim / Command / GameEvent / GameState / PlayerView / GameConfig
│   ├── rng.ts         mulberry32 种子 RNG、洗牌、掷骰
│   ├── deck.ts        牌库构造
│   ├── game.ts        状态机核心：apply / viewFor / 合法性 / 推进 / 受罚子流程
│   ├── ai.ts          朴素 AI（只吃 viewFor）
│   └── sim.ts         无头对抗性验证
├── store/gameStore.ts Zustand：持有权威状态、AI 驱动循环（异步一律 getState 现取）
└── components/        React UI（皮西骨东美术）
```

核心纪律（与原架构一致）：所有规则判定只活在 `engine/` 里；`store` 和 `components` 只渲染视图、发命令。

## 已实现的规则（对照 `docs/game-rules.md`）

盖牌宣称可撒谎、数字梯子只升不降（同色更大 / 同数字换色，0=该色最大）、质疑摊牌逐项比对、
万能牌恒判真、功能牌（转向/禁止）作为附加动作、俄罗斯轮盘累进受罚 + 中枪保护期、
打 0 终结本梯领计分卡（牌堆不清空）、清空手牌「跑成了」吞牌堆、牌库摸空结算。

## 第八节未定项在 demo 里的取舍

- `+2/+4` 不作为可出的牌，仅作打 0 的计分卡（面值计分）。
- 谁起新梯：直接采用规则定稿的分流（质疑后受罚方 / 中枪→下家 / 打0→下家 / 跑成→下家）。
- 补牌：跑成后补满到起手张数（`GameConfig.refillTo`）。
- 命运之轮：单局不触发，未实现。
