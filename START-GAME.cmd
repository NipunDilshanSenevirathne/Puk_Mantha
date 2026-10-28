@echo off
setlocal
cd /d "%~dp0"
node -e "if(Number(process.versions.node.split('.')[0])<22)process.exit(1)" >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 22 or newer from https://nodejs.org/ then try again.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Open http://localhost:8787 after the server says Ready.
call npm run dev
pause
