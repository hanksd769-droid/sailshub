@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Safe Git Pull

echo =========================================
echo   Safe Pull for E:\web
echo =========================================
echo.

cd /d E:\web
if errorlevel 1 (
  echo [ERROR] 无法进入 E:\web
  pause
  exit /b 1
)

echo [1/6] 当前分支与状态
git rev-parse --abbrev-ref HEAD
git status --short

echo.
echo [2/6] 仅暂存本地敏感/易冲突文件（.env 与前端api客户端）
git stash push -m "safe-pull-env-api" web/.env api/.env web/src/lib/api.ts

echo.
echo [3/6] 拉取远端更新
git pull

if errorlevel 1 (
  echo [ERROR] git pull 失败，请手动处理冲突后重试
  pause
  exit /b 1
)

echo.
echo [4/6] 恢复本地暂存改动
git stash pop

echo.
echo [5/6] 清理 vite 临时缓存（可重复执行，失败可忽略）
git clean -fd web/node_modules/.vite >nul 2>&1

echo.
echo [6/6] 完成，当前状态如下：
git status --short

echo.
echo 提示：
echo - 若出现冲突，请优先保留本地 .env
echo - 若 web/src/lib/api.ts 冲突，请保留 getVoiceConfig 导出
echo.
pause
endlocal