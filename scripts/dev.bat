@echo off
chcp 65001 >nul
setlocal
cd /d %~dp0..

if not exist server\node_modules ( echo 缺少 server 依赖，先跑 scripts\setup.bat & exit /b 1 )
if not exist web\node_modules ( echo 缺少 web 依赖，先跑 scripts\setup.bat & exit /b 1 )

echo 启动联机后端（ws://localhost:8787）...
start "yuanhe-server" cmd /k "cd /d %CD%\server && set YUANHE_DELAY_SCALE=0.5&& npm run dev"

echo 启动前端（http://localhost:5300）...
start "yuanhe-web" cmd /k "cd /d %CD%\web && npm run dev"

echo 两个窗口已拉起：前端 5300 连后端 8787。关闭窗口即停止。
