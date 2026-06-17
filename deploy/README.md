# 部署到香港 VPS（实际线上形态）

线上：**https://lumera.danarnoux.com**。这台 VPS 用 aaPanel/宝塔 管 nginx，还跑着 Gitea/MySQL 等，所以 Lumera 不抢 80/443、不动面板：Node 服务只监听 `127.0.0.1:8787`，由 nginx 反代到子域名，证书走 Let's Encrypt。部署方式是「**服务器从 Gitea 拉取构建**」。

## 服务器布局

```
/opt/Lumera/
  server.js        # esbuild 单文件包（运行态）
  public/          # 前端静态资源（运行态）
  repo/            # git clone 的源码（含只读 token 的 remote）
  deploy.sh        # 拉取→构建→换包→重启
```
- systemd 服务 `Lumera`（运行用户 `lumera`，见 [Lumera.service](Lumera.service)）。`systemctl status Lumera`、`journalctl -u Lumera -f`。
- SSH 别名 `ssh tlhk`（免密，端口 2200）。

## 日常更新（两步，或一键）

```bash
# 本地：提交并推到 Gitea
git push gitea
# 服务器拉取重建
ssh tlhk bash /opt/Lumera/deploy.sh
```
一键：本地跑 `scripts\redeploy.bat`（= 上面两步）。`deploy.sh` 用 `set -e`，构建失败不会换包/重启，线上保持旧版本不受影响。

## 一次性搭建（若换新机重建）

1. Node 20（官方 tarball 装到 `/usr/local`，软链 `/usr/bin/node`）。
2. 建用户 + 目录：`useradd --system --no-create-home --shell /usr/sbin/nologin lumera` ; `mkdir -p /opt/Lumera`。
3. 在 Gitea 建只读 token，`git clone https://<token>@git.yukilove.me/dandan/Lumera /opt/Lumera/repo`。
4. 放 `deploy.sh`、装 `Lumera.service`（`systemctl enable --now Lumera`），首次 `bash /opt/Lumera/deploy.sh`。
5. nginx 反代：vhost `/www/server/panel/vhost/nginx/lumera.danarnoux.com.conf`，80→443 跳转 + ACME 例外，443 `reverse_proxy 127.0.0.1:8787`，WebSocket 用面板 `0.websocket.conf` 的 `$connection_upgrade`。
6. 证书：acme.sh（默认 CA = Let's Encrypt），HTTP-01 webroot `/var/www/acme`，签发后 `--install-cert` 到 `/etc/nginx/ssl/lumera.danarnoux.com.{crt,key}`，自动续期。

## DNS / HTTPS 取舍

域名在 Cloudflare，用**灰色云朵（仅 DNS，A 记录直指 VPS IP）**——大陆访问香港更快更稳（CF 免费版大陆无节点，橙云会把流量绕到海外）。灰云下浏览器直连源站，故源站自带 Let's Encrypt 受信证书。代价是暴露源站 IP、无 CF 抗 D；真被攻击再切橙云。

## 说明

- 房间状态在内存，重启即清空（demo 无数据库；`RoomStore` 抽象留了横向扩展接缝）。
- 联机 AI 难度 `YUANHE_AI_DIFFICULTY`（默认 normal）、思考延迟 `YUANHE_DELAY_SCALE`（默认 1）、房间/连接上限 `MAX_ROOMS`/`MAX_CONNECTIONS`、空房宽限 `YUANHE_ROOM_GRACE_MS`，都是环境变量可调。
- 实测：120 并发玩家 / 40 局同时进行，峰值内存 57MB、CPU ~1% 单核、0 错误（压测脚本 `server/test/load.ts`）。
