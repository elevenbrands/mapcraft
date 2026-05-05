"""
FastAPI application entry point
"""

import gzip
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes.chat import router as chat
from app.api.routes.export import router as export
from app.api.routes.models import router as models
from app.api.routes.payments import router as payments
from app.api.routes.session import router as session
from app.config import settings

# Configure logging before importing modules that use it
logging.basicConfig(
    level=settings.log_level,
    format="%(levelname)s:     %(name)s - %(message)s",
)


logger = logging.getLogger(__name__)

# Demo session IDs that must always exist (seeded from backend/seeds/)
DEMO_SESSION_IDS = [
    "61d92ed5-e96c-4872-9f32-d687f850e8dd",  # Aldea Medieval
    "4af3a3e4-5c8e-4083-b9d1-cec492b16bb6",  # Castillo de Hielo
    "c72266e9-2c3f-4486-a345-32f42810b6cc",  # Ciudad Futurista
]

_SEEDS_DIR = Path(__file__).parent.parent / "seeds"


def _seed_demo_sessions() -> None:
    """
    Copy compressed demo code.json files to the storage path on first boot.
    Skips any session that already has a code.json.
    """
    storage_root = Path(settings.storage_path)
    storage_root.mkdir(parents=True, exist_ok=True)

    for session_id in DEMO_SESSION_IDS:
        session_dir = storage_root / session_id
        code_path = session_dir / "code.json"

        if code_path.exists():
            continue  # already seeded

        seed_file = _SEEDS_DIR / f"{session_id}.json.gz"
        if not seed_file.exists():
            logger.warning("Demo seed file missing: %s", seed_file)
            continue

        session_dir.mkdir(parents=True, exist_ok=True)

        # Decompress and write code.json
        with gzip.open(seed_file, "rb") as f_in:
            data = f_in.read()
        code_path.write_bytes(data)

        # Write paid.json marker so demo maps can be previewed/exported
        paid_path = session_dir / "paid.json"
        paid_path.write_text(json.dumps({"paid": True, "demo": True}))

        logger.info("Seeded demo session %s", session_id)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Startup — seed demo maps so landing page previews always work
    _seed_demo_sessions()
    yield
    # Shutdown (nothing to clean up)


def add_routers(app: FastAPI):
    app.include_router(chat, prefix="/api", tags=["chat"])
    app.include_router(models, prefix="/api", tags=["models"])
    app.include_router(session, prefix="/api", tags=["sessions"])
    app.include_router(export, prefix="/api", tags=["export"])
    app.include_router(payments, prefix="/api", tags=["payments"])


app = FastAPI(
    title="Minecraft Schematic Generator",
    description="Agentic interface for generating Minecraft schematics",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
add_routers(app)


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy"}


# Serve static files from frontend build (if exists)
frontend_build = Path(__file__).parent.parent.parent / "frontend" / "dist"
if frontend_build.exists():
    # Mount static assets
    app.mount(
        "/assets", StaticFiles(directory=frontend_build / "assets"), name="assets"
    )

    # Catch-all route for SPA - must be last
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve React SPA for all non-API routes"""
        # If it's an API route, let it pass through (shouldn't reach here)
        if full_path.startswith("api/"):
            return {"error": "Not found"}

        # Check if file exists in build directory
        file_path = frontend_build / full_path
        if file_path.is_file():
            return FileResponse(file_path)

        # Otherwise return index.html for SPA routing
        return FileResponse(frontend_build / "index.html")
