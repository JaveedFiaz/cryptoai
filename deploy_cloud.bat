@echo off
title Crypto Scalper Pro - Cloud 24/7 Deployer
cls
echo =======================================================================
echo          CRYPTO SCALPER PRO - 24/7 CLOUD HOSTING SETUP
echo =======================================================================
echo.
echo This tool lets you deploy your Crypto Scalper Pro Demo Terminal to
echo a FREE 24/7 cloud server in under 60 seconds.
echo.
echo Once deployed:
echo  1. You will get a permanent public URL (e.g. https://your-app.vercel.app)
echo  2. Open the URL on your mobile phone on ANY network (4G/5G/WiFi).
echo  3. Tap "Add to Home Screen" to install it as a native phone App.
echo  4. YOUR PC CAN BE TURNED COMPLETELY OFF. The app runs 100%% autonomously!
echo.
echo =======================================================================
echo Select your preferred deployment method:
echo.
echo [1] Vercel (Recommended - fast, high availability, free forever)
echo [2] Surge.sh (Instant static deployment, no account setup required)
echo [3] Run Local Testing Server (Runs only on your PC)
echo [4] Exit
echo.
set /p choice="Enter choice [1-4]: "

if "%choice%"=="1" goto deploy_vercel
if "%choice%"=="2" goto deploy_surge
if "%choice%"=="3" goto run_local
if "%choice%"=="4" goto end

:deploy_vercel
cls
echo =======================================================================
echo Deploying to Vercel (Free 24/7 Cloud)...
echo =======================================================================
echo.
echo Please follow the prompts in the terminal:
echo (Log in if asked, then press Enter to accept defaults)
echo.
cmd /c "npx -y vercel --prod"
echo.
echo =======================================================================
echo Deployment complete! Open the URL printed above on your mobile phone.
echo =======================================================================
pause
goto end

:deploy_surge
cls
echo =======================================================================
echo Deploying to Surge.sh (Instant Static Hosting)...
echo =======================================================================
echo.
cmd /c "npx -y surge ."
echo.
echo =======================================================================
echo Deployment complete! Open your Surge URL on your mobile phone.
echo =======================================================================
pause
goto end

:run_local
cls
echo Starting local node server...
call run_app.bat
goto end

:end
exit
