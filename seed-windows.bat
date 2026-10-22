@echo off
setlocal
echo ===================================================
echo   Eventide - Seed Demo Data (Windows)
echo ===================================================
echo.
set "PATH=%USERPROFILE%\.bun\bin;%PATH%"

echo Seeding users, events, and sample orders...
call bun run --filter @eventide/db db:seed

echo.
echo ===================================================
echo Seed completed! You can now log in at http://localhost:5173
echo Accounts:
echo   - Organizer: somchai@eventide.test (pass: seed-password-123)
echo   - Attendee:  priya@eventide.test   (pass: seed-password-123)
echo   - Admin:     admin@eventide.test   (pass: seed-password-123)
echo ===================================================
pause
