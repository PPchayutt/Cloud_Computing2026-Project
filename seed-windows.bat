@echo off
setlocal
echo ===================================================
echo   Eventide - Seed Demo Data (Windows)
echo ===================================================
echo.
set "PATH=%USERPROFILE%\.bun\bin;%PATH%"

echo Seeding users, events, and sample orders...
call bun run --filter @eventide/db db:seed

if errorlevel 1 (
    echo.
    echo ===================================================
    echo [ERROR] Seeding failed!
    echo สาเหตุ: หน้าต่าง run-dev.bat ไม่ได้เปิดอยู่
    echo วิธีแก้: ให้เปิดหน้าต่าง run-dev.bat ทิ้งไว้ก่อน
    echo แล้วค่อยมารัน seed-windows.bat ในหน้าต่างนี้นะครับ
    echo ===================================================
    echo.
    pause
    goto :eof
)

echo.
echo ===================================================
echo Seed completed! You can now log in at http://localhost:5173
echo Accounts:
echo   - Organizer: somchai@eventide.test (pass: seed-password-123)
echo   - Attendee:  priya@eventide.test   (pass: seed-password-123)
echo   - Admin:     admin@eventide.test   (pass: seed-password-123)
echo ===================================================
pause
