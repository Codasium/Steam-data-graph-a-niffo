@echo off
setlocal

:menu
echo.
echo --- Server Control ---
echo 1. Start Server
echo 2. Restart Server
echo 3. Stop Server
echo 4. Open Database editor
echo 5. Exit
set /p choice="Choose an option: "

if "%choice%"=="1" goto start
if "%choice%"=="2" goto restart
if "%choice%"=="3" goto stop
if "%choice%"=="4" goto db
if "%choice%"=="5" exit

goto menu

:start
REM Start server and log output/errors to server.log
start "Server" cmd /c "node server.js > server.log 2>&1"
echo Server started. Logging to server.log
goto menu

:restart
REM Kill the node server (assumes only one server.js running)
for /f "tokens=2" %%a in ('tasklist ^| findstr node.exe') do taskkill /F /PID %%a
goto start

:stop
REM Kill the node server (assumes only one server.js running)
for /f "tokens=2" %%a in ('tasklist ^| findstr node.exe') do taskkill /F /PID %%a
echo Server stopped.
goto menu

:db
REM Open the database viewer (assuming it's a local Python file)
start python dbviewer.py
goto menu
