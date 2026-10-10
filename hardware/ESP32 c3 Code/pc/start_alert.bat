@echo off
title Ward-C3 Space Alert
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install Python 3 and tick "Add python.exe to PATH".
  pause
  exit /b 1
)

python -c "import bleak" >nul 2>nul
if errorlevel 1 (
  echo Installing the Bluetooth library ^(bleak^)...
  python -m pip install -r requirements.txt
)

:run
echo.
echo Linking to Ward-C3 over Bluetooth...
python space_sender.py
echo.
choice /c RQ /n /m "Press R to reconnect, Q to close: "
if errorlevel 2 exit /b 0
goto run
