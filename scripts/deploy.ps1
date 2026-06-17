param(
  [Parameter(Mandatory = $true)][string]$VpsHost,
  [Parameter(Mandatory = $true)][string]$Domain,
  [string]$User = 'root',
  [string]$RemoteDir = '/opt/yuanhe'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host '== 本地构建 ==' -ForegroundColor Cyan
& "$PSScriptRoot\build.bat"
if ($LASTEXITCODE -ne 0) { throw '构建失败，已中止部署' }

$target = "$User@$VpsHost"
$staging = '/tmp/yuanhe-deploy'

Write-Host "== 上传到 $target ==" -ForegroundColor Cyan
ssh $target "rm -rf $staging && mkdir -p $staging"
scp server/dist/server.js "${target}:$staging/server.js"
scp -r server/dist/public "${target}:$staging/"
scp deploy/yuanhe.service "${target}:$staging/yuanhe.service"

$remote = @"
set -e
command -v node >/dev/null 2>&1 || { echo '远端未安装 node，请先按 deploy/README.md 安装'; exit 1; }
SUDO=''
if [ "`$(id -u)" -ne 0 ]; then
  SUDO='sudo'
  command -v sudo >/dev/null 2>&1 || { echo '当前非 root 且无 sudo，无法部署'; exit 1; }
fi
id yuanhe >/dev/null 2>&1 || `$SUDO useradd --system --no-create-home --shell /usr/sbin/nologin yuanhe
`$SUDO mkdir -p $RemoteDir
`$SUDO rm -rf $RemoteDir/public
`$SUDO cp $staging/server.js $RemoteDir/server.js
`$SUDO cp -r $staging/public $RemoteDir/public
`$SUDO chown -R yuanhe:yuanhe $RemoteDir
`$SUDO cp $staging/yuanhe.service /etc/systemd/system/yuanhe.service
`$SUDO systemctl daemon-reload
`$SUDO systemctl enable yuanhe >/dev/null 2>&1 || true
`$SUDO systemctl restart yuanhe
if [ -d /etc/caddy ]; then
  if [ -f /etc/caddy/Caddyfile ]; then `$SUDO cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.`$(date +%s); fi
  printf '%s {\n    encode zstd gzip\n    reverse_proxy 127.0.0.1:8787\n}\n' '$Domain' | `$SUDO tee /etc/caddy/Caddyfile >/dev/null
  `$SUDO systemctl reload caddy 2>/dev/null || `$SUDO systemctl restart caddy
fi
rm -rf $staging
echo '--- yuanhe 状态 ---'
`$SUDO systemctl --no-pager --lines=4 status yuanhe | sed -n '1,6p'
"@

$remote | ssh $target 'bash -s'
Write-Host "== 部署完成：https://$Domain ==" -ForegroundColor Green
