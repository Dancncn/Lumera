# 部署与恢复（单进程 · systemd · 反向代理）

浏览器通过 Caddy/nginx 的 HTTPS 访问 `127.0.0.1:8787` 上的一个 Node 进程；该进程同时提供网页和 WebSocket。发布会重启进程，**进行中的房间会清空，玩家需要重新开房**。在无人对局时更新；本方案不提供无中断发布。

## 服务器布局

```text
/opt/Lumera/                    # 可替换为不含空格的绝对目录
  current -> releases/<版本>/   # 以原子 rename 切换
  previous -> releases/<上版>/
  releases/<版本>/
    server.js
    public/
    REVISION                   # 完整 Git commit
    deploy/                    # 随包保留发布/恢复脚本和 service 模板
  shared/state/stats.json       # 跨版本统计，不随应用回滚
  shared/backups/               # 每次发布前的统计副本
  repo/                        # 仅“服务器构建”方式需要
  deploy.sh                    # 可选的服务器构建入口
```

`release.sh` 在独立版本目录准备完整产物，保存原 service，停止旧进程后备份统计，生成与目录一致的 service，再原子切换 `current`。服务启动后检查 systemd 状态及 `/healthz` 中的 `ok: true`；检查失败会恢复旧指针和 service，重启原本运行的旧服务，并以非零状态退出。首次发布失败会停掉候选服务、移除新 service 与候选版本。应用版本保留供回滚，不自动删除历史版本；清理时保留 `current`、`previous` 指向的目录。

## 一次性准备

1. 在 Linux 服务器安装 **Node 22+**、`curl`、`util-linux`（含 `flock`）、systemd，以及 SSH 服务。`node` 必须在不含空格、服务用户可访问的系统目录，如 `/usr/bin/node` 或 `/usr/local/bin/node`，不要使用 root 家目录中的 nvm 路径。服务器构建还需要 Git、npm 和 tar。
2. 准备 root SSH 或具有 sudo 权限的部署账号。发布脚本会创建 `lumera` 系统用户和目录，自动生成/安装/启用 `Lumera.service`，只允许服务写入 `shared/`。
3. 域名 A/AAAA 记录指向该服务器。先完成下面的应用发布，再按“HTTPS 接入”添加反代；脚本不会修改已有的 Caddy/nginx 配置。

## Windows 构建并上传

在已提交、工作区干净的仓库中执行：

```powershell
scripts\deploy.ps1 -VpsHost YOUR_SERVER -Domain YOUR_DOMAIN
# 自定义账号/目录（service 和统计目录会同步生成）：
scripts\deploy.ps1 -VpsHost YOUR_SERVER -Domain YOUR_DOMAIN -User deployer -RemoteDir /srv/Lumera
```

脚本用 `npm ci` 安装锁定依赖，运行 `scripts/verify.bat` 全检查与构建，复用已验证的前后端产物并写入 Git revision。浏览器测试所需的浏览器须先按根 README 的测试说明安装。构建、校验、上传、远端发布任一步失败都会返回错误，只有健康检查通过才输出应用发布完成。上传采用独立临时目录；清理失败会报告目录以便手工移除。

## 服务器拉取固定版本并构建

初始化示例（替换仓库地址；以下命令由有权限创建目录的部署账号执行）：

```bash
sudo mkdir -p /opt/Lumera
sudo chown "$USER" /opt/Lumera
git clone YOUR_REPOSITORY /opt/Lumera/repo
cp /opt/Lumera/repo/deploy/deploy-example.sh /opt/Lumera/deploy.sh
bash /opt/Lumera/deploy.sh
```

后续发布：

```bash
# 默认取 origin/main 的确定 commit；也可显式传已获取的 commit/tag
bash /opt/Lumera/deploy.sh
bash /opt/Lumera/deploy.sh YOUR_COMMIT
# 使用其他目录时，APP_DIR 同时影响构建目录和生成的 service
APP_DIR=/srv/Lumera bash /srv/Lumera/deploy.sh
```

脚本从 Git archive 创建临时源码树，不改服务器已有 checkout，不构建未提交代码。通过 `npm ci` 安装依赖，执行前后端类型检查、引擎回归、经典/天气模拟、后端测试，构建固定版本，通过生产包 HTTP/WS 冒烟后调用同一个 `release.sh`。浏览器 UI 测试应在推送前通过 `scripts/verify.bat` 或 CI；此 VPS 路径不安装浏览器。已有 `/opt/Lumera/deploy.sh` 的服务器需先替换旧脚本，否则仍会执行原来的覆盖发布。

## 从旧平铺目录迁移

已有 `/opt/Lumera/server.js`、`public/`、`state/stats.json` 的部署可直接运行新流程：第一次发布会把旧应用复制为 `releases/legacy-...`，保留原平铺文件和原 service；停服后把旧统计复制到 `shared/state/stats.json`（已有 shared 统计时不会覆盖）。失败自动恢复旧应用；成功后 `previous` 指向 legacy 快照。

如果旧服务通过自定义 `STATS_FILE` 写到其他地方，先停服，将该文件备份并复制到目标 `shared/state/stats.json`，设置 `lumera:lumera` 所有权，再发布。检查现有 systemd drop-in：旧的 `ExecStart`、`WorkingDirectory`、`STATS_FILE` 覆盖项可能仍然优先，需先调整为新布局。不要直接覆盖新流程生成的 service 为旧模板。

## HTTPS 接入（保留其他站点）

安装 Caddy 后，将以下**独立站点块**追加到现有 `/etc/caddy/Caddyfile`，替换域名；也可以保存为单独文件并在主文件中显式 `import`。不要用 Lumera 的示例替换整个共享配置。

```caddyfile
YOUR_DOMAIN {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8787
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

nginx 则添加独立 vhost，配置 HTTPS 和 `Upgrade`/`Connection` 转发到同一端口，验证配置后 reload。应用健康检查只验证本机应用；域名证书、反代和公网 WebSocket 仍需在接入时验证。

## 查看状态与手动回滚

```bash
systemctl status Lumera
journalctl -u Lumera -n 100 --no-pager
curl -fsS http://127.0.0.1:8787/healthz
cat /opt/Lumera/current/REVISION
readlink -f /opt/Lumera/previous
```

健康检查不能覆盖全部游戏行为。若发布后发现业务问题，可将上版作为新的回滚版本发布，仍经过相同检查/失败恢复流程：

```bash
APP_DIR=/opt/Lumera
PREVIOUS=$(readlink -f "$APP_DIR/previous")
test -f "$PREVIOUS/server.js" && test -f "$PREVIOUS/REVISION"
sudo bash "$APP_DIR/current/deploy/release.sh" "$APP_DIR" \
  "rollback-$(date -u +%Y%m%dT%H%M%SZ)" "$PREVIOUS"
```

如果脚本输出 `ROLLBACK NEEDS ATTENTION`，保留现场，检查 journalctl、`current` 和 service 文件后再重启，不能把该发布当成成功。应用回滚不会回滚统计；每次发布前副本在 `shared/backups/stats-before-<版本>.json`。

## 统计备份与恢复

房间无持久化；统计文件是唯一服务器业务数据，浏览器本地历史则保存在各用户浏览器中。下面命令使用停服窗口获取一致副本；备份应定期复制到服务器之外，并验证能恢复。

```bash
sudo systemctl stop Lumera
sudo cp -p /opt/Lumera/shared/state/stats.json /SAFE_BACKUP/stats.json
sudo systemctl start Lumera
# 恢复前先保留当前统计，再替换（会覆盖备份后新增的计数）
sudo systemctl stop Lumera
sudo cp -p /opt/Lumera/shared/state/stats.json /SAFE_BACKUP/stats-before-restore.json
sudo install -o lumera -g lumera -m 600 /SAFE_BACKUP/stats.json /opt/Lumera/shared/state/stats.json
sudo systemctl start Lumera
curl -fsS http://127.0.0.1:8787/healthz
```

首次运行统计文件可能尚未生成；确认文件存在后备份。`/SAFE_BACKUP` 为事先创建的备份位置。交接时记录域名/DNS、SSH、反代证书、当前 revision、备份位置及告警接收人；仓库没有预配置外部监控，需为 `/healthz` 和 systemd 重启失败配置实际使用的告警服务。

## 配置与离线验证

可在 `/opt/Lumera/shared/environment` 写入逐行的 `KEY=value`，随后重启服务；该文件不会随发布覆盖。常用配置为 `YUANHE_AI_DIFFICULTY`（默认 normal）、`YUANHE_DELAY_SCALE`（默认 1）、`MAX_ROOMS`、`MAX_CONNECTIONS`、`YUANHE_ROOM_GRACE_MS`。服务端口在此部署流程固定为 8787，若改变端口，需同步调整反代和 release.sh 的健康检查。不要随意改变 STATS_FILE，否则需同步修改统计备份/恢复路径。

```bash
bash -n deploy/release.sh deploy/deploy-example.sh deploy/test-release.sh
bash deploy/test-release.sh
```

离线测试用真实文件操作及符号链接，替换 systemd、HTTP、用户操作，覆盖首次发布、正常更新、健康/重启失败回滚、旧目录迁移、统计保留、自定义目录和并发锁。必须在 Linux/WSL 中运行；它不会连接服务器或调用真实 systemd。
