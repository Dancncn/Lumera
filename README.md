# 源 · Lumera

2–4 人的卡牌博弈（数字阶梯牌面 + 「盖牌宣称 + 撒谎 + 质疑」）。单机人机在浏览器跑，联机多房间走一台香港 VPS。

## 架构一句话

权威状态机只有一份，用 TypeScript 写在 `web/src/engine/`：`apply(state, seat, cmd) -> {state, events}` 进命令出事件，`viewFor(state, seat) -> PlayerView` 把真相投影成某座位有权看到的过滤视图。真实手牌、牌库、盖着的牌只活在引擎状态里，任何参与者（人或 AI）都只能拿到 `viewFor` 的结果——**结构上无法作弊**。

同一套引擎：

- **单机人机**：浏览器里直接 `import` 引擎，零网络（`web/src/store/gameStore.ts` 的 local 模式）。
- **联机**：Node 服务器 `server/` 复用同一份引擎，每个房间一个独占 `GameState` 的异步 actor，按座位推送过滤视图。前后端共享 `Command`/`GameEvent`/`PlayerView` 类型（都是 TS），无需任何代码生成。

> 为什么不是 Rust+WASM+axum？技术评审判定：对玩法尚未定稿的 demo，把这份已跑通、过了 1200 局无头模拟的 TS 引擎用 Rust 重写一遍是纯成本、零收益（架构的「思想」与语言无关，早已实现）。联机的真实收益用 Node 复用引擎即可兑现，几小时跑通而非数天重写。详见 `web/README.md` 与记忆里的选型决策。

## 目录

```
web/                现有前端 + 纯 TS 引擎（单机直接用，联机复用）
  src/engine/       权威状态机 + AI（apply / viewFor / 种子 RNG / GameConfig）
  src/net/          protocol.ts（前后端共享协议） + client.ts（WS 客户端）
  src/store/        gameStore.ts（local / online 双模，组件层零改动）
server/             Node + ws 多房间联机后端（复用 ../web 的引擎与协议）
  src/room.ts       房间 actor：独占 GameState、串行处理、AI 补位、按座位广播
  src/hub.ts        Hub + RoomStore 抽象（内存实现，留横向扩展接缝）
  src/server.ts     http 静态 + WebSocket，路由 socket 进房间
  test/online.ts    端到端：双房间并发跑完整局，断言按座位隔离、无信息泄露
scripts/            setup / dev / build / run-local（.bat） + deploy.ps1
deploy/             systemd 单元 + Caddyfile + 部署指南
```

## 本地开发

```bat
scripts\setup.bat      :: 装依赖（web + server）
scripts\dev.bat        :: 前端 5300 + 后端 8787，两个窗口
```

- 单机：开 http://localhost:5300 → 「单机人机」。
- 联机：同页 → 「联机对战」，输房间号（留空自动生成）→ 进入房间 → 房主点开始（空位转 AI）。把房间号发给朋友，同号即同桌。

## 出包 / 部署

```bat
scripts\build.bat              :: 前端 + 服务器单文件，产物在 server\dist\
scripts\run-local.bat          :: 本地单进程跑生产包（同源静态 + ws）
```

```powershell
scripts\deploy.ps1 -VpsHost <IP> -Domain <域名>   :: 一键部署到香港 VPS
```

部署细节见 [deploy/README.md](deploy/README.md)。

## 验证

```bat
cd web && npm run sim       :: 引擎无头模拟（1200 局：牌张守恒 / 无泄露 / 必然终局）
cd server && npm test       :: 联机端到端（双房间并发、按座位隔离、终局排名）
```
