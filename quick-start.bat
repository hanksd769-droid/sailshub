@echo off
setlocal

cd /d E:\web

echo [1/2] Start backend
start "api" cmd /k "cd /d E:\web\api && npm run dev"

echo [2/2] Start frontend
start "web" cmd /k "cd /d E:\web\web && npm run dev"

echo Done.
exit /b 0
