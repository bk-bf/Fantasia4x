#!/usr/bin/env bash
# Start the Fantasia4x dev server on a fixed port.
# If something is already listening on that port, print its info and exit.

PORT=5173

if lsof -ti tcp:$PORT >/dev/null 2>&1; then
  echo "Dev server already running on http://localhost:$PORT"
  echo "PID(s): $(lsof -ti tcp:$PORT | tr '\n' ' ')"
  exit 0
fi

exec npm run dev -- --port $PORT
