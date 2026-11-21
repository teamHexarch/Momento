@echo off
rem Double-click to test the Next.js Momento site on this PC.
rem Starts the Next.js site on http://localhost:3001 and the original site on http://localhost:3000 (for comparing),
rem unless they are already running, then opens both in your browser. Close the two black windows to stop them.
setlocal
cd /d "%~dp0momento-next"

if not exist node_modules (
  echo First run: installing packages, this takes a minute...
  call npm install
)

netstat -ano | findstr /r /c:":3001 .*LISTENING" >nul
if errorlevel 1 (
  start "Momento Next.js site (localhost:3001) - close to stop" cmd /k npm run dev
) else (
  echo The Next.js site is already running.
)

if exist "qa\reference-site\serve.mjs" (
  netstat -ano | findstr /r /c:":3000 .*LISTENING" >nul
  if errorlevel 1 start "Momento original site (localhost:3000) - close to stop" /d "qa\reference-site" cmd /k node serve.mjs
)

echo Waiting for the site to be ready...
set /a tries=0
:wait
set /a tries+=1
curl -s -o nul --max-time 2 http://localhost:3001/terms.html && goto ready
if %tries% geq 60 goto ready
timeout /t 1 /nobreak >nul
goto wait

:ready
if "%NOOPEN%"=="1" (echo Ready. & exit /b 0)
if exist "qa\reference-site\serve.mjs" start "" http://localhost:3000
start "" http://localhost:3001
endlocal
