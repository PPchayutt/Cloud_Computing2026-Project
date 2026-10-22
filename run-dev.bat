@echo off
setlocal
echo ===================================================
echo   Eventide - Local Development for Windows
echo ===================================================
echo.

set "PATH=%USERPROFILE%\.bun\bin;%PATH%"

echo [1/4] Checking Bun...
bun --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Bun is not found!
    pause
    goto :eof
)
echo Bun is ready!
echo.

echo [2/4] Starting PostgreSQL in Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo.
    echo ===================================================
    echo [!] DOCKER DESKTOP IS NOT RUNNING!
    echo Please open Docker Desktop from your Start Menu.
    echo Wait until the icon in bottom-left turns GREEN.
    echo Once Docker is running, press any key to continue.
    echo ===================================================
    echo.
    pause
)

echo Starting db container...
docker compose up -d db
if errorlevel 1 (
    echo [ERROR] Could not start Docker container. Please make sure Docker Desktop is running.
    pause
    goto :eof
)

echo Waiting 5 seconds for PostgreSQL to be ready...
timeout /t 5 /nobreak >nul
echo.

echo [3/4] Bootstrapping 4 databases...
call bun run --filter @eventide/db db:bootstrap
echo.

echo [4/4] Starting all services + Web Frontend...
echo ===================================================
echo  Frontend will be live at: http://localhost:5173
echo  KEEP THIS WINDOW OPEN!
echo ===================================================
echo.
bun run dev
