# 部署到香港 VPS

单进程 Node 服务器，同源伺服前端静态资源 + WebSocket 端点；前面挂 Caddy 反向代理 + 自动 HTTPS。香港无需备案，直接绑域名签证书。

## 一、VPS 一次性准备（Ubuntu）

```bash
# Node（20 LTS）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Caddy
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

把域名的 A 记录指向 VPS 公网 IP（香港机房直接生效，无需备案）。防火墙放行 80/443。

## 二、一键部署（在 Windows 本地）

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 -VpsHost 1.2.3.4 -Domain play.example.com
```

脚本会：本地构建 → 上传 `server.js` + `public/` + systemd 单元 → 安装并重启 `yuanhe` 服务 → 写好 Caddyfile（域名替换）并 reload Caddy。需提前配好到 VPS 的 SSH 免密（`ssh-copy-id`）。脚本以 root 登录时自动免 sudo，非 root 时自动加 sudo。

> 注意：脚本按「这台 VPS 只跑本服务」的假设，会**整体改写** `/etc/caddy/Caddyfile`（覆盖前自动备份为带时间戳的 `Caddyfile.bak.<秒>`）。若这台机器上 Caddy 还反代了别的站点，请改用 `import` 片段：把本站点写进 `/etc/caddy/conf.d/yuanhe.caddy`，主 Caddyfile 里加一行 `import conf.d/*.caddy`，不要用本脚本的整体覆盖。

可选参数：`-User`（默认 root）、`-RemoteDir`（默认 /opt/yuanhe）。

## 三、手动部署（等价步骤）

本地 `scripts\build.bat` 出包后，把 `server\dist\server.js` 与 `server\dist\public\` 拷到 VPS `/opt/yuanhe/`，然后：

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin yuanhe
sudo chown -R yuanhe:yuanhe /opt/yuanhe
sudo cp /opt/yuanhe/yuanhe.service /etc/systemd/system/    # 用 deploy/yuanhe.service
sudo systemctl daemon-reload && sudo systemctl enable --now yuanhe
```

Caddyfile（`/etc/caddy/Caddyfile`，把域名换成你的）：

```
play.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8787
}
```

```bash
sudo systemctl reload caddy
```

## 四、运维

- 日志：`journalctl -u yuanhe -f`
- 重启：`sudo systemctl restart yuanhe`
- 健康检查：`curl http://127.0.0.1:8787/healthz` → `{"ok":true,"rooms":N}`
- 服务器只监听 `127.0.0.1:8787`，公网仅经 Caddy（HTTPS）进入；WebSocket 走同域 `wss://你的域名/ws`，Caddy 自动透传 Upgrade。

## 五、说明

- 房间状态在内存中，重启即清空（demo 无数据库；`RoomStore` 抽象已留好横向扩展的接缝）。
- AI 思考延迟由 `YUANHE_DELAY_SCALE` 调节（默认 1；越小越快，0 近乎瞬发）。
- 若想要「真单文件、免装 Node」的部署，可改用 `bun build --compile` 产出自包含可执行文件，systemd 的 `ExecStart` 换成该文件即可。
