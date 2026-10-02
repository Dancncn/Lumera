@echo off
chcp 65001 >nul
setlocal
cd /d %~dp0..

echo [1/3] 构建前端 ...
pushd web
call npm ci
if errorlevel 1 ( popd & echo Frontend dependency install failed & exit /b 1 )
call npm run build
if errorlevel 1 ( popd & echo 前端构建失败 & exit /b 1 )
popd

echo [2/3] 打包服务器（单文件 esbuild）...
pushd server
call npm ci
if errorlevel 1 ( popd & echo Server dependency install failed & exit /b 1 )
call npm run typecheck
if errorlevel 1 ( popd & echo Server typecheck failed & exit /b 1 )
call npm run build
if errorlevel 1 ( popd & echo 服务器打包失败 & exit /b 1 )
popd

echo [3/3] 把前端产物塞进 server\dist\public ...
if exist server\dist\public rmdir /s /q server\dist\public
xcopy /e /i /y web\dist server\dist\public >nul
if errorlevel 1 ( echo Copying frontend artifacts failed & exit /b 1 )

echo.
echo 完成。可部署产物：
echo   server\dist\server.js    （单文件，无需 node_modules）
echo   server\dist\public\      （前端静态资源）
echo 本地试跑：scripts\run-local.bat
