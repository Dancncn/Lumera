@echo off
chcp 65001 >nul
setlocal
cd /d %~dp0..

where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js。请先安装：choco install nodejs-lts
  exit /b 1
)

echo 安装前端依赖 web ...
pushd web
call npm install
if errorlevel 1 ( popd & echo 前端依赖安装失败 & exit /b 1 )
popd

echo 安装服务器依赖 server ...
pushd server
call npm install
if errorlevel 1 ( popd & echo 服务器依赖安装失败 & exit /b 1 )
popd

echo 依赖安装完成。运行 scripts\dev.bat 开发，或 scripts\build.bat 出包。
