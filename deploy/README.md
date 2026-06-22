# 部署指南（单进程 · 反向代理 · systemd）

Lumera 上线就是**一台机器、一个 Node 进程**：前端构建产物 + 服务器打成一个包，Node 只监听本机端口，由前置的反向代理（nginx 或 Caddy）转发到你的域名、负责 HTTPS。回合制低频小游戏，单实例开几千房间都绰绰有余。

> 下文用占位符：`YOUR_DOMAIN`（你的域名）、`YOUR_SERVER`（你的 SSH 主机/别名）。按需替换。

## 服务器布局

```
/opt/Lumera/
  server.js        # esbuild 单文件包（运行态）
  public/          # 前端静态资源（运行态）
  repo/            # git clone 的源码
  deploy.sh        # 拉取→构建→换包→重启
```

- systemd 服务见 [Lumera.service](Lumera.service)（运行用户 `lumera`）：`systemctl status Lumera`、`journalctl -u Lumera -f`。
- Node 只监听 `127.0.0.1:8787`（见 service 里的 `HOST`/`PORT`），不直接对公网，由反代转发。

## 日常更新

`deploy.sh` 用 `set -e`：构建失败不会换包/重启，线上保持旧版本不受影响。

```bash
# 本地：提交并推到你的远端
git push
# 服务器拉取重建
ssh YOUR_SERVER bash /opt/Lumera/deploy.sh
```

Windows 下可用 `scripts\redeploy.bat`（先设环境变量 `DEPLOY_HOST` / `DEPLOY_REMOTE`）。

## 一次性搭建

1. **Node 20+**（官方 tarball 装到 `/usr/local`，软链 `/usr/bin/node`）。
2. **建用户 + 目录**：`useradd --system --no-create-home --shell /usr/sbin/nologin lumera` ; `mkdir -p /opt/Lumera`。
3. **拉源码**：`git clone <你的仓库地址> /opt/Lumera/repo`（私有仓库可用只读部署密钥 / token）。
4. 把 [deploy-example.sh](deploy-example.sh) 复制为服务器上的 `/opt/Lumera/deploy.sh`（改掉里面的路径/服务名变量）、装 `Lumera.service`（`systemctl enable --now Lumera`），首次 `bash /opt/Lumera/deploy.sh`。
5. **反向代理 + HTTPS**，二选一：
   - **Caddy**（最省事，自动签发/续期证书）：用本目录的 [Caddyfile](Caddyfile)，把 `REPLACE_WITH_YOUR_DOMAIN` 换成 `YOUR_DOMAIN` 即可。
   - **nginx**：`YOUR_DOMAIN` 的 vhost 做 80→443 跳转 + 反代 `127.0.0.1:8787`，WebSocket 需转发 `Upgrade`/`Connection` 头；证书用 acme.sh / certbot（Let's Encrypt）。

## DNS / HTTPS 备注

- 让域名 A 记录直指服务器公网 IP；若用 Cloudflare 等 CDN，注意 WebSocket 与地域延迟（大陆访问海外节点可能更慢，可视情况用「仅 DNS / 灰云」直连源站）。
- 直连源站时源站需自带受信证书（Caddy 自动 / acme.sh 安装）。

## 说明

- 房间状态在内存，重启即清空（demo 无数据库；`RoomStore` 抽象留了横向扩展接缝）。
- 可调环境变量：AI 难度 `YUANHE_AI_DIFFICULTY`（默认 normal）、思考延迟 `YUANHE_DELAY_SCALE`（默认 1）、房间/连接上限 `MAX_ROOMS` / `MAX_CONNECTIONS`、空房宽限 `YUANHE_ROOM_GRACE_MS`。
- 压测脚本 `server/test/load.ts`（设 `LIVE_URL` 指向目标）：参考量级——百级并发玩家 / 数十局同时进行，峰值内存数十 MB、CPU 极低、0 错误。
