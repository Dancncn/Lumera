#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# Lumera 部署脚本「参照示例」(deploy-example.sh)
#
# 这是放在服务器上的 /opt/Lumera/deploy.sh 的脱敏样例：拉取 → 构建 → 换包 → 重启。
# 真实脚本不入库（含各人自己的路径/远端）；复制本文件、改掉下面几个变量即可用。
#
# set -e：任一步失败立即退出，绝不换包/重启 —— 构建挂了线上仍是旧版本，安全。
# ──────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="/opt/Lumera"          # 运行目录（server.js + public/ 落在这里）
REPO_DIR="$APP_DIR/repo"       # git clone 的源码
SERVICE="Lumera"               # systemd 服务名
BRANCH="main"

cd "$REPO_DIR"

echo "[1/5] pull"
git fetch --quiet origin "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "[2/5] build web"
npm --prefix web ci --silent
npm --prefix web run build --silent      # 产物：web/dist/（含 index.html + assets）

echo "[3/5] build server"
npm --prefix server ci --silent
npm --prefix server run build --silent   # 产物：server/dist/server.js（esbuild 单文件）

echo "[4/5] stage artifacts"
install -m 644 "$REPO_DIR/server/dist/server.js" "$APP_DIR/server.js"
rm -rf "$APP_DIR/public"
cp -r "$REPO_DIR/web/dist" "$APP_DIR/public"

echo "[5/5] restart service"
sudo systemctl restart "$SERVICE"
sleep 1
curl -fsS http://127.0.0.1:8787/healthz && echo "  [deploy OK]"
