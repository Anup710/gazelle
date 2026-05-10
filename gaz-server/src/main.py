"""FastAPI app entry. Lifespan eager-loads clients and ensures Qdrant is ready.

Boot requires SUPABASE_* and QDRANT_* env vars. OPENAI_API_KEY and GROQ_API_KEY
are not touched at boot — they're only consumed when an ingest or query runs.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .clients import qdrant_client
from .core.config import settings
from .core.errors import AppError
from .core.logging import setup_logging
from .routes import health, ingest, jobs, rag, sessions, stt, tts

setup_logging(settings().LOG_LEVEL)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Verify Qdrant is reachable + ensure collection + payload index.
    qdrant_client.ensure_collection()
    log.info("startup.complete")
    yield
    log.info("shutdown")


app = FastAPI(title="Gazelle Backend", version="1.0.0", lifespan=lifespan)

# --- CORS ------------------------------------------------------------------
# Source of truth: plan/implementation/backend/cors-caution.md §3.
_origins = [o.strip() for o in settings().ALLOWED_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
    allow_credentials=False,
)


# --- Error handlers --------------------------------------------------------
@app.exception_handler(AppError)
async def _app_error_handler(_request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


@app.exception_handler(RequestValidationError)
async def _validation_handler(_request, exc: RequestValidationError) -> JSONResponse:
    # Surface the first validation error as a friendly message.
    errors = exc.errors()
    if errors:
        first = errors[0]
        loc = ".".join(str(p) for p in first.get("loc", []) if p != "body")
        msg = first.get("msg", "Invalid input.")
        message = f"{loc}: {msg}" if loc else msg
    else:
        message = "Invalid input."
    return JSONResponse(
        status_code=400,
        content={"error": {"code": "invalid_input", "message": message}},
    )


# --- Routes ----------------------------------------------------------------
app.include_router(health.router)
app.include_router(ingest.router)
app.include_router(jobs.router)
app.include_router(sessions.router)
app.include_router(stt.router)
app.include_router(rag.router)
app.include_router(tts.router)
