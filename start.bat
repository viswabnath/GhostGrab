@echo off
echo.
echo  ===================================
echo    GhostGrab - OneMark Digital Agency
echo  ===================================
echo.

REM ── Backend ─────────────────────────────────
cd /d "%~dp0backend"

if not exist ".venv" (
    echo [Setup] Creating Python virtual environment...
    python -m venv .venv
)

echo [Backend] Installing dependencies...
call .venv\Scripts\activate.bat
pip install -r requirements.txt --quiet

echo [Backend] Starting FastAPI server on http://localhost:8000
start "GhostGrab Backend" cmd /k "call .venv\Scripts\activate.bat && uvicorn main:app --host 0.0.0.0 --port 8000"

REM Wait a moment for backend to start
timeout /t 3 /nobreak > nul

REM ── Frontend ────────────────────────────────
cd /d "%~dp0frontend"

if not exist "node_modules" (
    echo [Setup] Installing frontend dependencies...
    npm install
)

echo [Frontend] Starting Vite dev server on http://localhost:5173
start "GhostGrab Frontend" cmd /k "npm run dev"

REM ── Open browser ────────────────────────────
timeout /t 3 /nobreak > nul
echo [GhostGrab] Opening http://localhost:5173 in your browser...
start http://localhost:5173

echo.
echo  GhostGrab is running!
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:5173
echo.
echo  Close the Backend and Frontend windows to stop.
pause
