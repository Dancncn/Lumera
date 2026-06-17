@echo off
chcp 65001 >nul
setlocal
cd /d %~dp0..

echo [1/2] 推送到 Gitea ...
git push gitea
if errorlevel 1 ( echo 推送失败，已中止 & exit /b 1 )

echo [2/2] 通知香港服务器拉取重建 ...
ssh tlhk bash /opt/yuanhe/deploy.sh
if errorlevel 1 ( echo 服务器部署失败 & exit /b 1 )

echo.
echo 完成：https://lumera.danarnoux.com
