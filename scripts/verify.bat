@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."

pushd web
call npm run typecheck
if errorlevel 1 goto fail
call npm run test:typecheck
if errorlevel 1 goto fail
call npm run test:engine
if errorlevel 1 goto fail
call npm run test:ui
if errorlevel 1 goto fail
call npm run sim
if errorlevel 1 goto fail
call npm run sim:weather
if errorlevel 1 goto fail
call npm run build
if errorlevel 1 goto fail
popd

pushd server
call npm run typecheck
if errorlevel 1 goto fail
call npm test
if errorlevel 1 goto fail
call npm run build
if errorlevel 1 goto fail
call npm run test:smoke
if errorlevel 1 goto fail
popd
echo All local checks passed.
exit /b 0

:fail
popd
echo Verification failed. Do not publish this build.
exit /b 1
