@echo off
setlocal

cd /d %~dp0

echo [1/2] git pull
git pull
if errorlevel 1 goto :fail

echo [2/2] docker compose --env-file .env up -d --build
docker compose --env-file .env up -d --build
if errorlevel 1 goto :fail

echo Done.
exit /b 0

:fail
echo Script failed.
exit /b 1