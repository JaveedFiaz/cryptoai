@echo off
title Crypto Scalper Pro Launcher
cd /d "c:\Users\scree\Downloads\crypto-scalper-app"

echo ===================================================
echo     CRYPTO SCALPER PRO - REAL-TIME TERMINAL
echo ===================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js was not detected on this system.
    echo Opening application directly in browser...
    start "" "index.html"
    pause
    exit /b
)

echo Checking server on port 3000...
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Server is already running on port 3000.
) else (
    echo [STARTING] Launching background server on port 3000...
    start "Crypto Scalper Server" /min node server.js
    timeout /t 2 /nobreak >nul
)

echo [LAUNCHING] Opening Crypto Scalper Pro in your default browser...
start "" "http://localhost:3000/index.html"

set LOCAL_IP=127.0.0.1
for /f "tokens=*" %%a in ('node -e "const os=require('os');for(const n of Object.keys(os.networkInterfaces())){for(const f of os.networkInterfaces()[n]){if(f.family==='IPv4'&&!f.internal&&!f.address.startsWith('169.254')){console.log(f.address);process.exit();}}}"') do set LOCAL_IP=%%a

echo.
echo ===================================================
echo   CRYPTO SCALPER PRO IS RUNNING & CONNECTED!
echo   Local PC URL:       http://localhost:3000
echo   Mobile / Wi-Fi URL: http://%LOCAL_IP%:3000
echo ===================================================
echo.
echo  The terminal has opened in your browser.
echo  Mobile devices on the same Wi-Fi can open:
echo  http://%LOCAL_IP%:3000
echo.
echo  You can safely close this window anytime.
echo.
timeout /t 5 >nul
exit
