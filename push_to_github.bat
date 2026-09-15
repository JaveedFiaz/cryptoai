@echo off
title Push Crypto Scalper Pro to GitHub
cls
echo =======================================================================
echo     PUSH CRYPTO SCALPER PRO TO GITHUB (JaveedFiaz/cryptoai)
echo =======================================================================
echo.
set "GIT_PATH=C:\Users\scree\AppData\Local\Microsoft\WinGet\Packages\Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd\git.exe"
if not exist "%GIT_PATH%" set "GIT_PATH=git"

echo Staging changes...
"%GIT_PATH%" add .

echo Committing...
"%GIT_PATH%" commit -m "Update Crypto Scalper Pro v7" 2>nul

echo Pushing to GitHub (https://github.com/JaveedFiaz/cryptoai)...
echo (If prompted, sign in with GitHub or paste your GitHub Personal Access Token)
echo.
"%GIT_PATH%" push -u origin main

echo.
if %ERRORLEVEL% EQU 0 (
    echo =======================================================================
    echo  SUCCESS! Code pushed to https://github.com/JaveedFiaz/cryptoai
    echo =======================================================================
) else (
    echo [!] Push authorization needed.
    echo     If you have a GitHub Personal Access Token, you can also run:
    echo     git push https://TOKEN@github.com/JaveedFiaz/cryptoai.git main
)
pause
