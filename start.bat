@echo off
echo ========================================
echo   OfficAttend - Face Recognition Attendance
echo ========================================
echo.
echo Starting OfficAttend...
echo.

:: Check if node_modules exists
if not exist "node_modules" (
    echo First time setup - installing dependencies...
    echo This may take a few minutes...
    call npm install
    echo.
)

:: Start both server and frontend
echo Starting backend server and frontend...
echo.
echo The app will open in your browser shortly.
echo Keep this window open while using the app.
echo Press Ctrl+C to stop the app.
echo.

start /B npm run server
timeout /t 2 /nobreak >nul
start http://localhost:5173
npm run dev
