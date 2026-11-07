# Built by Home Assistant on the device. HA passes a BUILD_FROM base image,
# which this ignores in favour of the official Node and Python images.

FROM docker.io/library/node:24-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM docker.io/library/python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    OHM_DATA_DIR=/data
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --frozen --no-dev
COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
COPY backend/app ./app
COPY --from=frontend /app/frontend/dist /app/frontend/dist
COPY addon/run.sh /run.sh
RUN chmod +x /run.sh
CMD ["/run.sh"]
