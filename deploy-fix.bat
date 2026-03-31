@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo TTS 语音生成修复 - 重新部署脚本
echo ========================================
echo.

cd /d E:\web

echo [1/4] 停止现有服务...
docker-compose down

echo.
echo [2/4] 清理旧的构建缓存...
docker-compose build --no-cache web

echo.
echo [3/4] 启动所有服务...
docker-compose up -d

echo.
echo [4/4] 等待服务启动（10 秒）...
timeout /t 10 /nobreak >nul

echo.
echo ========================================
echo 部署完成！检查服务状态...
echo ========================================
echo.

docker-compose ps

echo.
echo 查看日志（按 Ctrl+C 退出日志查看）：
echo   docker-compose logs -f
echo.
echo 测试步骤：
echo 1. 访问 http://服务器IP/api/health
echo 2. 如果返回 {"success":true}，说明部署成功
echo 3. 测试 TTS 语音生成功能
echo.
echo ========================================

pause
