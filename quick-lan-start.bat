@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Coze LAN Quick Start (Enhanced)

set ROOT=E:\web
set API_DIR=%ROOT%\api
set WEB_DIR=%ROOT%\web
set API_PORT=3000
set WEB_PORT=5173

echo ===============================================
echo   Coze LAN Quick Start (Enhanced)
echo ===============================================
echo.

echo [1/7] 检查目录...
if not exist "%API_DIR%\package.json" (
  echo [ERROR] 未找到 %API_DIR%\package.json
  pause
  exit /b 1
)
if not exist "%WEB_DIR%\package.json" (
  echo [ERROR] 未找到 %WEB_DIR%\package.json
  pause
  exit /b 1
)

echo [2/7] 尝试放行防火墙端口 %WEB_PORT% / %API_PORT% ...
netsh advfirewall firewall add rule name="Vite-%WEB_PORT%" dir=in action=allow protocol=TCP localport=%WEB_PORT% >nul 2>&1
netsh advfirewall firewall add rule name="API-%API_PORT%" dir=in action=allow protocol=TCP localport=%API_PORT% >nul 2>&1

echo [3/7] 清理旧 node 进程（可忽略失败提示）...
taskkill /F /IM node.exe >nul 2>&1

echo [4/7] 安装依赖（如已安装会很快）...
echo   - API
call cmd /c "cd /d %API_DIR% && npm install --silent"
echo   - WEB
call cmd /c "cd /d %WEB_DIR% && npm install --silent"

echo [5/7] 启动后端 API (%API_PORT%)...
start "API-%API_PORT%" cmd /k "cd /d %API_DIR% && npm run dev"

echo [6/7] 启动前端 WEB (%WEB_PORT%，局域网可访问)...
start "WEB-%WEB_PORT%" cmd /k "cd /d %WEB_DIR% && npm run dev -- --host 0.0.0.0 --port %WEB_PORT%"

echo [7/7] 计算局域网访问地址...
set LAN_IP=
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /R /C:"IPv4.*:"') do (
  set TMP=%%i
  set TMP=!TMP: =!
  if not "!TMP!"=="127.0.0.1" (
    if not "!TMP!"=="" (
      set LAN_IP=!TMP!
      goto :ip_found
    )
  )
)
:ip_found

echo.
echo ===============================================
echo 启动完成
echo ===============================================
if defined LAN_IP (
  echo 本机局域网IP: %LAN_IP%
  echo.
  echo 局域网访问地址:
  echo   前端: http://%LAN_IP%:%WEB_PORT%/dashboard
  echo   后端健康检查: http://%LAN_IP%:%API_PORT%/health
  echo.
  echo 如果其他电脑打不开：
  echo   1) 确保在同一局域网
  echo   2) 关闭“访客网络隔离”
  echo   3) 以管理员运行本脚本（防火墙规则才会生效）
) else (
  echo [WARN] 未自动识别局域网IP，请手动执行 ipconfig 查看。
)

echo.
pause
endlocal