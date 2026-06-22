@echo off
chcp 65001 >nul
setlocal
cd /d %~dp0..

:: 个人一键重部署示例：推送 + 让服务器拉取重建。
:: 用前先设好自己的 git remote 与 SSH 主机（下面 your-server / your remote 换成你的）。
set "DEPLOY_HOST=%DEPLOY_HOST%"
if "%DEPLOY_HOST%"=="" set "DEPLOY_HOST=your-server"
set "DEPLOY_REMOTE=%DEPLOY_REMOTE%"
if "%DEPLOY_REMOTE%"=="" set "DEPLOY_REMOTE=origin"

echo [1/2] 推送到 %DEPLOY_REMOTE% ...
git push %DEPLOY_REMOTE%
if errorlevel 1 ( echo 推送失败，已中止 & exit /b 1 )

echo [2/2] 通知服务器拉取重建 ...
ssh %DEPLOY_HOST% bash /opt/Lumera/deploy.sh
if errorlevel 1 ( echo 服务器部署失败 & exit /b 1 )

echo.
echo 完成。
