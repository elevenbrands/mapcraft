# =============================================================================
# Stage 1 — Build React/Vite frontend
# =============================================================================
FROM node:20-slim AS frontend-build

WORKDIR /build/frontend

# Install dependencies
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source and build
COPY frontend/ ./
RUN npm run build
# Output: /build/frontend/dist

# =============================================================================
# Stage 2 — Python backend + bundled frontend
# =============================================================================
FROM python:3.11-slim AS final

# Install uv (fast Python package manager used by this project)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend into the location FastAPI expects
COPY --from=frontend-build /build/frontend/dist ./frontend/dist

# Install Python dependencies (using uv, no venv — copies to site-packages)
WORKDIR /app/backend
RUN uv sync --frozen --no-dev

# Create default storage dir (overridden by Railway volume at /data/sessions)
RUN mkdir -p /app/.storage/sessions

# Expose port
EXPOSE 8000

# Start FastAPI via uv run (respects pyproject.toml entry point).
# Shell form so Railway's injected $PORT is honored; falls back to 8000 locally.
CMD uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
