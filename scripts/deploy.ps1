param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9.-]*$')][string]$VpsHost,
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9.-]*$')][string]$Domain,
  [ValidatePattern('^[A-Za-z_][A-Za-z0-9_-]*$')][string]$User = 'root',
  [ValidatePattern('^/[A-Za-z0-9_/-]+$')][string]$RemoteDir = '/opt/Lumera'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-Checked {
  param([string]$Command, [string[]]$Arguments)
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Command failed (exit $LASTEXITCODE)" }
}

$revision = (& git rev-parse --verify HEAD)
if ($LASTEXITCODE -ne 0) { throw 'Cannot read Git revision' }
$changes = (& git status --porcelain)
if ($LASTEXITCODE -ne 0) { throw 'Cannot read Git status' }
if ($changes) { throw 'Commit or stash local changes before deploying an identifiable revision.' }
$releaseId = $revision.Substring(0, 12) + '-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')

Write-Host '== Install locked dependencies and check the release ==' -ForegroundColor Cyan
Invoke-Checked 'npm.cmd' @('--prefix', 'web', 'ci')
Invoke-Checked 'npm.cmd' @('--prefix', 'server', 'ci')
Invoke-Checked "$PSScriptRoot\verify.bat" @()
[IO.File]::WriteAllText((Join-Path $root 'server/dist/REVISION'), "$revision`n", [Text.UTF8Encoding]::new($false))

$target = "$User@$VpsHost"
$staging = '/tmp/lumera-deploy-' + [Guid]::NewGuid().ToString('N')
Write-Host "== Uploading release $releaseId to $target ==" -ForegroundColor Cyan
Invoke-Checked 'ssh' @($target, "mkdir -m 700 '$staging'")
try {
  Invoke-Checked 'scp' @('server/dist/server.js', 'server/dist/REVISION', "${target}:$staging/")
  Invoke-Checked 'scp' @('-r', 'web/dist', "${target}:$staging/public")
  Invoke-Checked 'scp' @('deploy/release.sh', 'deploy/Lumera.service', "${target}:$staging/")
  $sudoPrefix = if ($User -eq 'root') { '' } else { 'sudo ' }
  Invoke-Checked 'ssh' @($target, "${sudoPrefix}bash '$staging/release.sh' '$RemoteDir' '$releaseId' '$staging'")
} finally {
  # Cleanup failure must not hide the actual deployment result.
  try { Invoke-Checked 'ssh' @($target, "rm -rf -- '$staging'") }
  catch { Write-Warning "Could not remove remote staging directory $staging : $_" -WarningAction Continue }
}

Write-Host "== Application release $releaseId is healthy on 127.0.0.1:8787 ==" -ForegroundColor Green
Write-Host "Configure https://$Domain using deploy/README.md. Existing Caddy/nginx configuration was not changed."
