# Один образ на два процесса: Next (фронтенд + SSR) и FastAPI (аккаунты,
# пины, соцблок). Они делят один домен: Next проксирует /api/* на бэкенд
# через rewrites, поэтому наружу нужен только порт 3000.
#
#   docker build -t pinly .
#   docker run -p 3000:3000 -v pinly-data:/app/.data -e PINLY_JWT_SECRET=... pinly

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip python3-venv tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- зависимости (отдельным слоем: меняются реже исходников) ---
COPY package.json package-lock.json ./
RUN npm ci

COPY backend/requirements.txt backend/requirements.txt
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install -r backend/requirements.txt

# --- сборка фронтенда ---
COPY . .
RUN npm run build

# --- запуск ---
ENV PATH="/opt/venv/bin:$PATH" \
    ACCOUNTS_BACKEND_URL=http://127.0.0.1:8000 \
    PINLY_DATA_DIR=/app/.data \
    NODE_ENV=production

# .data переживает контейнер — база аккаунтов и загруженные пины
VOLUME ["/app/.data"]
EXPOSE 3000

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# tini — чтобы сигналы доходили до обоих процессов и контейнер останавливался чисто
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
