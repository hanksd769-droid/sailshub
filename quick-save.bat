@echo off
setlocal

cd /d E:\web\sailshub

set MSG=%~1
if "%MSG%"=="" set MSG=update

echo [1/4] git add .
git add .
if errorlevel 1 goto :fail

echo [2/4] git commit -m "%MSG%"
git commit -m "%MSG%"
if errorlevel 1 (
  echo No new changes to commit. Continue pushing...
)

echo [3/4] push GitHub (origin)
git push origin main
if errorlevel 1 goto :fail

echo [4/4] push Gitee (gitee)
git push gitee main
if errorlevel 1 goto :fail

echo Done. Pushed to GitHub + Gitee.
pause
exit /b 0

:fail
echo Script failed.
pause
exit /b 1