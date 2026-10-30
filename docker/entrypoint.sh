#!/bin/bash
# Запускает оба процесса в одном контейнере: FastAPI на 8000 (локально, наружу
# не публикуется) и Next на 3000. Если любой из них упал — контейнер тоже
# падает, чтобы оркестратор его перезапустил, а не держал полусломанный сайт.
set -euo pipefail

python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 &
API_PID=$!

npm run start -- --hostname 0.0.0.0 --port 3000 &
WEB_PID=$!

# ждём первый завершившийся процесс и гасим второй
wait -n "$API_PID" "$WEB_PID"
STATUS=$?
kill "$API_PID" "$WEB_PID" 2>/dev/null || true
exit "$STATUS"
