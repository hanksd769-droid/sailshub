@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo 检查部署状态
echo ========================================
echo.

cd /d E:\web

echo [1/3] 检查 Docker 容器状态...
echo.
docker-compose ps

echo.
echo [2/3] 测试 API 健康检查...
echo.
curl -s http://localhost:3000/api/health

echo.
echo.
echo [3/3] 查看最近日志...
echo.
docker-compose logs --tail=20 api

echo.
echo ========================================
echo 检查完成！
echo.
echo 如果看到 {"success":true}，说明 API 正常
echo 接下来请在浏览器测试：
echo http://服务器IP/api/health
echo ========================================

pause
