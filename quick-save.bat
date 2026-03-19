@echo off
setlocal

cd /d %~dp0

set MSG=%~1
if "%MSG%"=="" set MSG=update

echo [1/3] git add .
git add .
if errorlevel 1 goto :fail

echo [2/3] git commit -m "%MSG%"
git commit -m "%MSG%"
if errorlevel 1 (
  echo No changes to commit or commit failed.
)

echo [3/3] git push
git push
if errorlevel 1 goto :fail

echo Done.
exit /b 0

:fail
echo Script failed.
exit /b 1
