#!/bin/bash
set -euo pipefail

if [ "${RUN_MIGRATIONS_ON_STARTUP:-0}" = "1" ]; then
    echo "[entrypoint] Running Alembic migrations..."
    alembic upgrade head
fi

if [ "$#" -gt 0 ]; then
    exec "$@"
fi

echo "[entrypoint] Starting Uvicorn..."
exec uvicorn main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers 1 \
    --log-level info
