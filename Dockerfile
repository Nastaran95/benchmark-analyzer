# Production image: FastAPI + built frontend + bundled data
# Build: docker build -t benchmark-analyzer .
# Run:   docker run -p 8000:8000 benchmark-analyzer

FROM node:22-alpine AS web
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim AS app
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    BENCHMARK_BUNDLE=/app/data/benchmark-bundle.json

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server/ ./server/
COPY data/benchmark-bundle.json ./data/benchmark-bundle.json
COPY --from=web /build/web/dist ./web/dist

RUN test -f /app/data/benchmark-bundle.json

EXPOSE 8000

CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
