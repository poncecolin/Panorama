@echo off
setlocal
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

rem %~dp0 ends with a backslash; strip it so quoted paths don't escape the quote.
set "APPDIR=%~dp0"
set "APPDIR=%APPDIR:~0,-1%"

if not exist "out\main\index.js" call npm run build

start "" "%APPDIR%\node_modules\electron\dist\electron.exe" "%APPDIR%"
