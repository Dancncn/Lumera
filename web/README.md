# 源河 · Lumera 前端与共享引擎

React + Vite + TypeScript 前端，支持单机人机和 WebSocket 联机。规则引擎由浏览器与 `server/` 共用；AI 使用玩家过滤视图，包含性格、难度与天气判断。产品功能与启动总览见 [根 README](../README.md)。

## 运行与验证

使用 Node.js 22 或更新版本；从本目录运行：

```bash
npm ci
npm run dev                   # http://localhost:5300
npm run typecheck
npm run test:typecheck        # 测试与测试配置的类型检查
npm run test:engine           # 输入校验、规则与状态回归
npx playwright install chromium
npm run test:ui               # 真实 Chromium 浏览器回归
npm run sim                  # 1200 局经典模拟
npm run sim:weather          # 天气模拟、完整轨迹复现与参数扫描
npm run build
```

单机不需要后端。联机开发时还需在 `../server` 运行 `npm ci` 和 `npm run dev`，默认 WebSocket 地址为当前主机的 `8787` 端口。生产构建默认使用同源 `/ws`；需要分离部署时，在构建前设置 `VITE_WS_URL`。

## 修改落点

| 目录 | 职责 |
| --- | --- |
| `src/engine/` | 状态机、可调规则、种子 RNG、AI、命令校验与模拟器；不依赖 React 或网络 |
| `src/store/` | 单机/联机状态、AI 与动画时序、教程调度 |
| `src/net/` | 共享协议、连接与重连、遥测、本地对局记录 |
| `src/components/` | 从玩家视图渲染界面并发送命令 |
| `test/` | 引擎及浏览器回归测试 |

先阅读 `engine/types.ts`，再跟踪 `createGame → apply → viewFor`。随后阅读 `gameStore.ts` 的单机与联机路径；两端共用规则，但本地 store 与服务端 Room 分别调度行动和反应窗口，修改时序后必须验证两种模式。

## 规则与数据边界

- 经典模式见 [游戏规则](../docs/game-rules.md)，可选天气见 [天气模式](../docs/weather-mode.md)，AI 见 [人机系统](../docs/ai-system.md)。
- 打出 0 的奖励直接计入计分区，不再使用独立计分卡。
- 联机时权威状态在服务器，客户端只接收自己的 `PlayerView`；单机时真实状态位于本地浏览器内存。
- 身份凭证用于断线恢复，不使用昵称找回座位；清除浏览器存储会丢失恢复凭证。
- 对局历史仅保存在本机 `localStorage`，最多 60 条，不上传服务器。
- 跨局的「命运之轮」尚未实现。
