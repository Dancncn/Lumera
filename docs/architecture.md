# 《源河 · Lumera》技术架构文档

## 概述

《源河 · Lumera》是一款 2–4 人的网页多人卡牌博弈游戏：数字阶梯式的牌面与出牌结构，叠加「盖牌宣称 + 可撒谎 + 被质疑」的心理博弈。美术与命名是架空西方古典风，内核是一套「源—四力—回流」的东方哲理设定，具体世界观与规则数值见 [worldview.md](worldview.md) 与 [game-rules.md](game-rules.md)。

本文档只覆盖技术架构：整体设计原则、技术栈、工程结构、引擎与协议的形态。游戏的具体规则数值与平衡刻意被隔离在引擎内部和一份可调配置里，既不在本文档展开，也不影响这里的任何架构决策。

项目已经走过单机与联机两个阶段，**两者复用同一份引擎**：阶段一是纯浏览器内人机单机，零网络；阶段二在同一套引擎外面套一层 WebSocket 传输，Node 服务器只做消息分发与按座位的视图过滤。这个顺序能成立，是因为下面第一节的原则——引擎的接口本身就是消息协议，两个阶段共用同一套类型，不存在重写。

> **历史说明**：早期技术稿曾计划 Rust + WASM + axum + ts-rs 的全栈方案。技术评审判定：对玩法尚未定稿的 demo，把这份已跑通、过了 1200 局无头模拟的 TS 引擎用 Rust 重写一遍是纯成本、零收益——架构的「思想」（权威状态机、引擎即协议、按座位过滤视图）与语言无关，早已实现；联机的真实收益用 Node 复用引擎即可兑现。故最终落地为纯 TypeScript。本文档描述的是实际落地的 TS 架构。

## 一、核心架构原则

整套系统建立在两条原则上，后面所有决策都从这里推出来。

**权威状态机（authoritative state machine）。** 因为游戏的核心乐趣是盖着牌撒谎，真实牌面绝对不能让对手看到。所有真相——每人的真实手牌、桌上盖着的牌究竟是什么、洗牌顺序、那一次掷骰的结果——只存在于权威的那一份 `GameState` 里。每个参与者（人或 AI）只能拿到一份过滤后的视图 `PlayerView`：自己的手牌、公开信息、以及别人嘴上宣称了什么。参与者永远不做规则判定，只渲染状态、发送命令。

> 单机里「防作弊」是伪命题（真相本就在你自己的浏览器内存里），`viewFor` 这层投影在单机阶段只是「整洁分层 + 给 AI 喂同构视图」；它真正的安全意义在联机阶段（引擎搬到服务器）才兑现：真相留在服务器，客户端收到的永远是过滤后的视图。

**引擎即协议。** 游戏逻辑被收进一个纯粹的引擎，它对外只有两个动作：吃进一条命令（谁、做了什么），吐出新状态加一串事件；以及把真相投影成某座位的视图。这个「命令进、事件出」的接口本身就是消息协议——单机时它走进程内的函数调用，联机时它走 WebSocket、序列化成 JSON。同一套 `Command` / `GameEvent` / `PlayerView` 定义（都是 TypeScript）服务两个阶段，**前后端直接 `import` 同一份类型，不需要任何代码生成**。

由这两条推出的关键结论：AI 拿到的视图和真人完全一样，所以 AI 在结构上不可能作弊（它根本看不到底牌）；也不存在「为单机和联机各写一套逻辑」的问题——引擎写一次，浏览器直接 `import`，Node 服务器用相对路径复用同一份源码。

## 二、技术栈

**引擎与前端用 TypeScript。** 游戏引擎是纯 TS，无任何框架/IO 依赖；前端用 React + Vite + TypeScript，状态管理用 Zustand，轻、样板少，贴合「新状态推过来 → 替换 store → 自动重渲染」这个数据流。动画上大部分效果（翻牌、特效）本质是 CSS transform 就够。要留意 React 在「整份状态被替换」的场景里容易踩 stale closure，引擎的异步驱动循环里一律用 `getState()` 现取最新状态来规避。

引擎是确定性的，唯一的随机（洗牌、受罚那一次掷骰）来自一个注入的、可种子化的 RNG（`rng.ts` 里的 mulberry32），不在引擎里直接调系统随机。好处有三：测试可复现、AI 调试可复现、联机时随机完全由服务器掌控不下放。

**联机后端用 Node + `ws`。** 没有 axum、没有 WASM、没有 ts-rs。服务器以相对路径 `import` 前端的引擎源码（`../../web/src/engine/`），完整复用 `apply` / `viewFor` / AI；网络层只负责把 WebSocket 上收到的命令喂进引擎、把过滤视图广播回各座位。

序列化与类型同步：命令、事件、视图、网络信封都是普通 TS 接口/联合类型，序列化就是 `JSON.stringify`。因为前后端是同一份 TS 源码，协议永远不会对不上——这正是当初用 ts-rs 从 Rust 生成 TS 想达到的效果，而全 TS 直接 `import` 就免费拿到了。

部署上把前端构建产物打进 server 包，上线就是一台机器上的单个 Node 进程：目标是一台香港 VPS，对这种回合制、低频（大部分时间在等人出牌）的小游戏绰绰有余。数据方面当前无持久化，房间状态放内存，但留了横向扩展的接缝（见第七节与附录）。

## 三、工程结构

```
Lumera/
├── web/                 React + Vite + TS 前端 + 纯 TS 引擎（单机直接用，联机复用）
│   ├── src/engine/      纯逻辑：apply / viewFor / 种子 RNG / 牌库 / AI / 无头模拟
│   │   ├── types.ts     Card / Claim / Command / GameEvent / GameState / PlayerView / GameConfig
│   │   ├── rng.ts       mulberry32 种子 RNG、洗牌、掷骰
│   │   ├── deck.ts      牌库构造
│   │   ├── game.ts      状态机核心：apply / viewFor / 合法性 / 推进 / 受罚子流程
│   │   ├── ai.ts        朴素拟人 AI（只吃 viewFor，看不到底牌）
│   │   └── sim.ts       无头对抗性验证（1200 局：牌张守恒 / 无泄露 / 必然终局）
│   ├── src/net/         protocol.ts（前后端共享协议） + client.ts（WS 客户端）
│   └── src/store/       gameStore.ts（Zustand，local / online 双模，组件层零改动）
├── server/              Node + ws 多房间联机后端（复用 ../web 的引擎与协议）
│   └── src/
│       ├── room.ts      房间 actor：独占 GameState、串行处理、AI 补位、按座位广播
│       ├── hub.ts       Hub + RoomStore 抽象（内存实现，留横向扩展接缝）
│       ├── server.ts    http 静态 + WebSocket，路由 socket 进房间，/healthz /stats /beat
│       ├── static.ts    生产包的同源静态文件服务
│       └── stats.ts     在线/对局统计（/stats 暴露）
├── scripts/             setup / dev / build / run-local（.bat） + deploy.ps1
├── deploy/              systemd 单元 + Caddyfile + 部署指南
└── docs/                worldview.md / game-rules.md / architecture.md（本文）
```

核心纪律：所有游戏逻辑只活在 `web/src/engine/` 里，且引擎不依赖 React、不碰 IO、不碰网络。前端 `store`/`components` 与后端 `server/` 都只是它的薄封装——一个把命令从用户操作喂进去，一个把命令从 WebSocket 喂进去。这是「引擎即协议、写一次跑两端」能成立的工程前提，也是必须守住的边界：任何规则判定一旦泄进前端或 `server`，这个架构就破了。

## 四、引擎设计

引擎的核心是一个持有全部真相的确定性状态机，对外只有两个纯函数：

```ts
// web/src/engine/game.ts
export function apply(prev: GameState, seat: number, cmd: Command): { state: GameState; events: GameEvent[] };
export function viewFor(s: GameState, seat: number): PlayerView;
```

`apply` 不修改入参（内部 `structuredClone(prev)` 后在副本上推进），先校验这条命令对当前 phase 和这个座位是否合法（只有当前玩家能出牌，只有下一家能质疑，只有受罚方能选点数），然后改状态、产出事件，返回 `{ state, events }`。非法命令抛 `GameError`。

`viewFor` 把真相投影成某个座位有权看到的部分，**是整个系统的安全边界**：它是 AI 和联机客户端拿数据的唯一入口，两者拿到同一个 `PlayerView`，因此「会读底牌的作弊 AI」在结构上根本写不出来。视图的公开部分有各人凝聚度（命数）、手牌数量（注意是数量、不是内容）、计分区、当前梯顶（宣称的那张牌）、出牌方向、牌库剩余、各人受罚累进次数；私有部分只有你自己的真实手牌；桌上盖着的真实牌不在任何人的视图里，只有被质疑摊牌时才在 `CardRevealed` 事件里亮出。

`actorOf(state)` 返回当前必须行动的座位，供前端与服务器判断「轮到谁」「该不该自动驱动 AI」。

## 五、状态机与协议

一个回合的循环（失败与出局的措辞已按世界观换皮，见第八节）：

```
Setup ── 发牌、定首家 ──┐
                       ▼
            ┌──────────────────┐
        ┌──►│   play           │ ← 当前玩家
        │   └──────────────────┘
        │     │ 盖牌出数字/万能牌 + 宣称 (PlayCard)；可先 Draw 补一张；
        │     │ 功能牌明牌打 (PlayFunctional)；纯功能牌时 Fallback 兜底
        │     ▼
        │   ┌──────────────────┐
        │   │   respond        │ ← 下一家
        │   └──────────────────┘
        │     ├─ Accept ───────► 出牌成立（手牌空则吞牌堆 + 补牌）→ 下一家 ──┐
        │     └─ Challenge ────► 亮真实牌、逐项比对 → 判输家                  │
        │           ▼                                                         │
        │   ┌──────────────────┐                                            │
        │   │   penalty        │ ← 输家：选点 (ChooseNumber)、掷骰           │
        │   └──────────────────┘                                            │
        │     ├─ 中 → 一缕念被收回源头（扣凝聚）→（归零? 复归出局；全员? 结束）
        │     └─ 未中 → 受罚累进 +1                                          │
        │         └ 梯子重启、定新首家 ──────────────────────────────────────┤
        └──────────────────────────────────────────────────────────────────┘

牌库摸空 / 全员复归 ──► over（按计分高低排名）
```

Phase 是一个判别联合（`web/src/engine/types.ts`）：`play` / `respond` / `penalty` / `over`，各自带行动所需的座位与上下文。

**命令（参与者 → 引擎）：**

```ts
type Command =
  | { type: 'PlayFunctional'; cardId: number } // 明着甩功能牌（附加动作）
  | { type: 'Draw' }                            // 先摸 1 张，再出牌
  | { type: 'PlayCard'; cardId: number; claim: Claim } // 盖牌出数字/万能牌并宣称
  | { type: 'Fallback' }                        // 兜底：无数字/万能牌时，亮手 + 弃功能 + 摸一
  | { type: 'Accept' }                          // 放过，不质疑
  | { type: 'Challenge' }                       // 质疑上家这一手
  | { type: 'ChooseNumber'; n: number };        // 受罚时选定本次要赌的点数 1..6
```

撒谎就是 `PlayCard` 里 `cardId` 指向的真实牌与 `claim` 不一致。

**事件（引擎 → 参与者，按可见性分发）** 包括：`TurnStarted`、`FunctionalPlayed`、`DirectionReversed`、`CardDrawn`（仅数量公开）、`CardPlayed`（只播宣称、不播真实牌）、`Fallback`、`PlayAccepted`、`Challenged` / `CardRevealed`、`PileTaken`、`TokenAwarded`、`RanOut`、`PenaltyStarted` / `DiceRolled`、`Returned`（对应原「中枪/扣命」）、`Survived`、`PlayerOut`（对应原「死亡」）、`LadderReset`、`GameOver`。

**网络协议（`web/src/net/protocol.ts`，前后端共享）：** 客户端消息 `ClientMsg` = `join` / `start` / `restart` / `cmd` / `leave` / `ping`；服务器消息 `ServerMsg` = `joined` / `room` / `sync`（带 `PlayerView` + 事件）/ `error` / `pong`。每条消息自带 `roomId` 与玩家身份 `token`——这是横向扩展的接缝（见附录）。

## 六、可调参数

游戏平衡相关的数值全部抽进一个配置，与状态机隔离，调平衡时不碰任何逻辑：

```ts
interface GameConfig {
  players: number;               // 2..4
  startingHand: number;          // 起手张数
  startingLives: number;         // 初始凝聚度（命数）
  tokenValueOnZero: number;      // 打出 0 领取的计分卡面值
  lifeLossValue: number;         // 每损失 1 命的扣分（复归出局即 3×5）
  refillTo: number;              // 清空手牌跑成后补牌到几张
  escalationResetsOnHit: boolean;// 中枪后受罚累进是否重置
  seed: number;                  // 种子，决定洗牌与掷骰
}
```

`DEFAULT_CONFIG`（不含 `players` / `seed`）：起手 6 张、3 命、打 0 领 +2、每命 −5、跑成补满到 6、中枪后累进重置。这一层存在的全部意义，就是让你反复调奖罚和概率时永远不必动状态机。

## 七、联机后端

**每个房间一个 actor。** `server/src/room.ts` 的 `Room` 实例独占一份 `GameState`：所有改状态的命令都进同一个房间实例串行处理（`apply` 是纯函数、单线程 Node 天然串行），不存在数据竞争。房间负责：

- 接收某座位的 `cmd`，调 `apply` 推进，按事件可见性给每个座位发各自的 `sync`（内含 `viewFor` 出来的过滤视图 + 公开事件）。
- **AI 补位**：空座位/掉线座位转 AI。轮到 AI 时不立即出手，而是按事件类型用 `setTimeout` 给一个带抖动的拟人化延迟（翻牌/掷骰/摊牌各有不同节奏），再调 `apply`，营造「在思考」的观感。
- 掉线宽限：座位断开后保留一段宽限期（`GRACE_MS`），期间可重连接管；房间空了回调 `onEmpty` 由上层回收。

**Hub + RoomStore。** `server/src/hub.ts` 的 `Hub` 通过 `RoomStore` 接口存取房间，当前实现是内存里的 `Map`（`MemoryRoomStore`），带 `maxRooms` 上限与空房回收。把存取藏在接口后面，是为将来真要放大时换成 Redis（存状态 + pub/sub 广播）只动这一层、游戏逻辑一行不改。

**HTTP 层。** `server/src/server.ts` 用 Node 原生 `http` + `ws`：`/healthz` 健康检查、`/stats` 在线与对局统计、`/beat` 心跳上报「当前在线」，其余走静态文件（生产包里前端与服务同源），WebSocket 升级后按 `roomId` 路由进对应房间。

## 八、世界观接入

引擎和事件命名跟随《源河》设定，避免出现与世界观冲突的词。输不是「死」，是一缕念没汇成、被收回源头复归；所以事件叫 `Returned` 和 `PlayerOut`（复归）而不是 `LifeLost` / `Death`，命数对玩家呈现为「凝聚度」。机制完全不变，只换事件命名与前端叙事。

颜色四力在 `types.ts` 的 `COLOR_META` 里定义：阳 Aurel（金）、月 Selvar（银）、地 Verda（绿）、海 Thalos（蓝），各自带造名、单字、喊色与牌面底/字色。

**命运之轮**（只在两局之间转、用来定下一局首家的转盘）属于世界观叙事件，当前 demo / 联机里单局结算即结束、不触发跨局，因此**尚未实现**，留待将来需要「一局接一局」的场景时再接。

## 九、本地开发（Windows）

`scripts/` 下是一组批处理：

```bat
scripts\setup.bat      :: 装依赖（web + server）
scripts\dev.bat        :: 前端 5300 + 后端 8787，两个窗口
scripts\build.bat      :: 前端 + 服务器单文件，产物在 server\dist\
scripts\run-local.bat  :: 本地单进程跑生产包（同源静态 + ws）
```

验证：

```bat
cd web && npm run sim       :: 引擎无头模拟（1200 局：牌张守恒 / 无泄露 / 必然终局）
cd server && npm test       :: 联机端到端（双房间并发、按座位隔离、终局排名）
```

部署：`scripts\deploy.ps1 -VpsHost <IP> -Domain <域名>` 一键部署到香港 VPS，细节见 [../deploy/README.md](../deploy/README.md)。

## 附：将来横向扩展的两个口子

当前单实例 + 内存房间对当前规模是最优解，不要过早上 Redis。但为将来真要放大时不必重写，现在就守住两点：其一，房间的存取藏在 `RoomStore` 接口后面（当前是内存 `Map`），将来换成 Redis 存状态加 pub/sub 广播时，改动只集中在这一层，游戏逻辑一行不动；其二，每条 WebSocket 消息都自包含，带上 `roomId` 和玩家身份 `token`，不依赖「这条连接一直连在同一台机器」的隐含假设，这样将来加负载均衡、按房间路由都不难。这两点在小规模阶段的代码量跟纯内存版几乎一样，却把天花板抬高了。
