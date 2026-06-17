@echo off
chcp 65001 >nul
setlocal
cd /d %~dp0..

if not exist server\dist\server.js ( echo 还没构建，先跑 scripts\build.bat & exit /b 1 )
if not exist server\dist\public\index.html ( echo 缺少前端产物，先跑 scripts\build.bat & exit /b 1 )

set PORT=8787
set HOST=127.0.0.1
echo 单进程跑生产包：http://localhost:8787 （静态 + ws 同源）
node server\dist\server.js
