@echo off
REM ===========================================================================
REM  Evotti — pull the latest code from GitHub (main) into this local clone.
REM  Double-click this file any time you want your local copy up to date.
REM  Works wherever the clone lives (it uses its own folder).
REM ===========================================================================
cd /d "%~dp0"
echo Updating Evotti from GitHub (main)...
echo.
git pull origin main
echo.
echo Done. Press any key to close.
pause >nul
