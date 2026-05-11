#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Check ffmpeg
if ! command -v ffmpeg &> /dev/null; then
  echo "ffmpeg not found. Install with: brew install ffmpeg"
  exit 1
fi

# Set up Python venv if needed
if [ ! -d "$ROOT/backend/.venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv "$ROOT/backend/.venv"
  source "$ROOT/backend/.venv/bin/activate"
  echo "Installing torch (CPU-only)..."
  pip install torch --index-url https://download.pytorch.org/whl/cpu -q
  echo "Installing Python dependencies..."
  pip install -r "$ROOT/backend/requirements.txt" -q
else
  source "$ROOT/backend/.venv/bin/activate"
fi

# Install npm deps if needed
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  cd "$ROOT/frontend" && npm install --silent
fi

# Start backend
cd "$ROOT/backend"
echo "Starting backend at http://localhost:8000 ..."
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# Start frontend
cd "$ROOT/frontend"
echo "Starting frontend at http://localhost:5173 ..."
npm run dev &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" EXIT INT TERM

echo ""
echo "App running at http://localhost:5173"
echo "Press Ctrl+C to stop."
wait
