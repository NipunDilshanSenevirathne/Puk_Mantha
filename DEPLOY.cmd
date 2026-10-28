@echo off
setlocal
cd /d "%~dp0"
title Pukmantha - Deploy to Cloudflare
echo Deploy the full game, multiplayer rooms and website to your Cloudflare account.
echo This needs Node.js 22 or newer, an internet connection and your Cloudflare login.
echo.
node -e "if(Number(process.versions.node.split('.')[0])<22)process.exit(1)" >nul 2>&1
if errorlevel 1 goto missingnode
call npm ci
if errorlevel 1 goto failed
call npm test
if errorlevel 1 goto failed
call npx wrangler login
if errorlevel 1 goto failed
call npm run deploy
if errorlevel 1 goto failed
echo.
echo Deployment complete. Open the HTTPS workers.dev address printed above.
echo For voice across restrictive networks, follow the TURN section in README.md.
pause
exit /b 0
:missingnode
echo Install Node.js 22 or newer from https://nodejs.org/ then run this file again.
pause
exit /b 1
:failed
echo.
echo Deployment stopped because a command failed. Read the error above and README.md.
echo No success is assumed; rerun this file after resolving the error.
pause
exit /b 1
