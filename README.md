# 源河 · Lumera

2–4 人的卡牌博弈（数字阶梯牌面 + 「盖牌宣称 + 撒谎 + 质疑」）。

**▶ 在线试玩：<https://lumera.danarnoux.com>**（单机人机即开即玩；联机开房叫上朋友）

## 架构

权威状态机只有一份，用 TypeScript 写在 `web/src/engine/`：`apply(state, seat, cmd) -> {state, events}` 进命令出事件，`viewFor(state, seat) -> PlayerView` 把真相投影成某座位有权看到的过滤视图。联机时真实手牌、牌库、盖牌保留在服务器；AI 和客户端使用过滤视图。网络入口与引擎分别校验外部输入，玩家操作还需匹配连接绑定的房间和身份凭证。

同一套引擎：

- **单机人机**：浏览器里直接 `import` 引擎，零网络（`web/src/store/gameStore.ts` 的 local 模式）。
- **联机**：Node 服务器 `server/` 复用同一份引擎，每个房间一个独占 `GameState` 的异步 actor，按座位推送过滤视图。前后端共享 `Command`/`GameEvent`/`PlayerView` 类型（都是 TS），无需任何代码生成。

> 为什么不是 Rust+WASM+axum？技术评审判定：对玩法尚未定稿的 demo，把这份已跑通、过了 1200 局无头模拟的 TS 引擎用 Rust 重写一遍是纯成本、零收益（架构的「思想」与语言无关，早已实现）。联机的真实收益用 Node 复用引擎即可兑现，几小时跑通而非数天重写。详见 [docs/architecture.md](docs/architecture.md) 与 `web/README.md`。

## 文档

| 文档 | 内容 |
|------|------|
| [docs/worldview.md](docs/worldview.md) | 世界观与背景故事——源、四力、回流；「皮西骨东」的命名与叙事 |
| [docs/game-rules.md](docs/game-rules.md) | 规则定稿（**经典模式**）——牌库构成、数字梯子、质疑摊牌、轮盘受罚、三条得分路线、计分 |
| [docs/weather-mode.md](docs/weather-mode.md) | 混沌天气（**DLC**）规则——叠加在经典之上的可选玩法：六种天气、触发与冷却、与经典的衔接 |
| [docs/architecture.md](docs/architecture.md) | 技术架构——权威状态机、引擎即协议、单机/联机两端、状态机与协议、可调参数 |
| [docs/ai-system.md](docs/ai-system.md) | 人机系统的数学模型与技术实现——性格档案、难度调制、诈牌/质疑概率、拟人节奏 |

## 目录

```
web/                现有前端 + 纯 TS 引擎（单机直接用，联机复用）
  src/engine/       权威状态机 + AI（apply / viewFor / 种子 RNG / GameConfig），含 sim.ts / simWeather.ts（无头模拟器）
  src/net/          protocol.ts（前后端共享协议） + client.ts（WS 客户端） + telemetry.ts（遥测心跳/对局上报） + history.ts（本地对局历史）
  src/store/        gameStore.ts（local / online 双模，组件层零改动）
server/             Node + ws 多房间联机后端（复用 ../web 的引擎与协议）
  src/room.ts       房间 actor：独占 GameState、串行处理、AI 补位、按座位广播
  src/hub.ts        Hub + RoomStore 抽象（内存实现，留横向扩展接缝）
  src/server.ts     http 静态 + WebSocket，路由 socket 进房间
  src/static.ts     同源静态服务
  src/stats.ts      在线/对局统计
  test/online.ts    三房间并发完整对局、座位视图与天气配置验证
  test/security.ts 畸形消息、身份恢复、连接绑定与房间生命周期回归
  test/smoke.ts     独立生产包的 HTTP / 静态资源 / WebSocket 验证
  test/resilience.ts 断线韧性
  test/load.ts      压测
  test/live.ts      线上连通
scripts/            setup / dev / build / run-local / redeploy（.bat） + deploy.ps1
deploy/             systemd 单元 + Caddyfile + 部署指南 + deploy-example.sh（部署脚本样例）
```

## 本地开发

使用 Node.js 22 或更新版本（`.node-version` 为 22；CI 检查 22 与 24）。两个包均提交 lockfile，安装使用 `npm ci`。

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
cd web
npx playwright install chromium  :: 首次安装浏览器测试运行时
cd ..
scripts\verify.bat                :: 在仓库根目录执行完整验证
```

也可分别在 `web` 执行 `npm run typecheck`、`npm run test:typecheck`、`npm run test:engine`、`npm run test:ui`、`npm run sim`、`npm run sim:weather`，在 `server` 执行 `npm run typecheck`、`npm test`。两端构建完成后，在 `server` 执行 `npm run test:smoke` 验证独立生产包。Linux 下 `bash deploy/test-release.sh` 离线验证发布与回滚，不连接线上。

经典模拟运行 1,200 局；天气模拟运行 1,000 局并比较 24 组完整状态/事件轨迹，任何不一致均使检查失败。模拟中的隐藏牌检查是抽样回归保护，不能替代输入校验、身份验证和浏览器测试。GitHub Actions 自动运行上述检查。

房间状态仅在内存，服务重启会中断对局；重连依赖浏览器保存的原身份凭证，昵称不能恢复座位。服务端统计文件与浏览器本地历史的备份边界，以及发布与回滚步骤，见 [部署指南](deploy/README.md)。

## 许可证

[AGPL-3.0](LICENSE) © 2026 Dan Arnoux。

自由学习、修改、再分发；但**衍生版——包括改后作为网络服务对外提供的版本——必须同样以 AGPL-3.0 公开源码**（这正是给联机/网页游戏选 AGPL 而非 GPL 的原因：堵住"托管不开源"）。拿去当学习范本、二次创作完全欢迎；若想闭源或商业使用，请联系作者获取商业授权。
