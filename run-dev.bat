@echo off
setlocal
echo ===================================================
echo   Eventide - Local Development for Windows
echo ===================================================
echo.

set "PATH=%USERPROFILE%\.bun\bin;%PATH%"

echo [1/4] Checking Bun and Packages...
bun --version >nul 2>&1
if errorlevel 1 goto :install_bun
goto :bun_ready

:install_bun
if exist "%USERPROFILE%\.bun\bin\bun.exe" goto :bun_in_profile
echo [!] Bun is not found. Installing Bun automatically...
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"

:bun_in_profile
set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
bun --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Could not setup Bun automatically.
    echo Please install Bun manually by running in PowerShell:
    echo powershell -c "irm bun.sh/install.ps1 | iex"
    pause
    goto :eof
)

:bun_ready
echo Bun is ready!

if not exist "node_modules" (
    echo.
    echo [!] First-time setup: Installing project packages...
    call bun install
    echo Packages installed successfully!
)
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
