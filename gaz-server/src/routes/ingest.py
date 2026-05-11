"""POST /ingest/{youtube|upload|text} — three thin handlers, one orchestrator behind them."""

import logging
import os
import shutil
import tempfile

from fastapi import APIRouter, BackgroundTasks, File, UploadFile

from ..core.constants import ALLOWED_UPLOAD_EXTS, MAX_UPLOAD_MB
from ..core.errors import AppError
from ..db import jobs_repo
from ..pipeline.orchestrator import run_ingest_job
from ..schemas.ingest import (
    IngestAcceptedResponse,
    IngestTextRequest,
    IngestYouTubeRequest,
)
from ..utils.titles import title_from_text, title_from_upload
from ..utils.youtube_url import canonical_watch_url, extract_video_id

router = APIRouter()
log = logging.getLogger(__name__)


@router.post(
    "/ingest/youtube",
    response_model=IngestAcceptedResponse,
    status_code=202,
)
async def ingest_youtube(req: IngestYouTubeRequest, bg: BackgroundTasks) -> IngestAcceptedResponse:
    url = str(req.url)
    video_id = extract_video_id(url)   # raises AppError on bad URL
    canonical = canonical_watch_url(video_id)
    job_id = jobs_repo.create_job(
        source_type="youtube",
        source=canonical,
        title=canonical,  # optimistic; replaced after Supadata + oEmbed lookup
    )
    bg.add_task(run_ingest_job, job_id, "youtube", {"url": canonical})
    log.info("ingest.queued", extra={"job_id": job_id, "source_type": "youtube"})
    return IngestAcceptedResponse(job_id=job_id, status="pending")


@router.post(
    "/ingest/upload",
    response_model=IngestAcceptedResponse,
    status_code=202,
)
async def ingest_upload(
    bg: BackgroundTasks, file: UploadFile = File(...)
) -> IngestAcceptedResponse:
    filename = file.filename or "upload"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_UPLOAD_EXTS:
        raise AppError(
            "invalid_input",
            "File format not supported. Use MP4, MOV, AVI, or MKV",
            400,
        )

    # Stream the upload to a temp file while enforcing the size cap.
    max_bytes = MAX_UPLOAD_MB * 1024 * 1024
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    written = 0
    try:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            written += len(chunk)
            if written > max_bytes:
                tmp.close()
                os.remove(tmp.name)
                raise AppError("invalid_input", "File exceeds 500 MB limit", 400)
            tmp.write(chunk)
    finally:
        tmp.close()

    job_id = jobs_repo.create_job(
        source_type="upload",
        source=filename,
        title=title_from_upload(filename),
    )
    bg.add_task(
        run_ingest_job,
        job_id,
        "upload",
        {"temp_path": tmp.name, "original_filename": filename},
    )
    log.info(
        "ingest.queued",
        extra={"job_id": job_id, "source_type": "upload", "bytes": written},
    )
    return IngestAcceptedResponse(job_id=job_id, status="pending")


@router.post(
    "/ingest/text",
    response_model=IngestAcceptedResponse,
    status_code=202,
)
async def ingest_text(req: IngestTextRequest, bg: BackgroundTasks) -> IngestAcceptedResponse:
    text = req.text.strip()
    if len(text) < 80:
        # Pydantic already enforces min_length, but defend in depth.
        raise AppError(
            "invalid_input",
            "Paste at least a few paragraphs of transcript",
            400,
        )
    job_id = jobs_repo.create_job(
        source_type="transcript",
        source=None,
        title=title_from_text(text),
    )
    bg.add_task(run_ingest_job, job_id, "transcript", {"text": text})
    log.info("ingest.queued", extra={"job_id": job_id, "source_type": "transcript"})
    return IngestAcceptedResponse(job_id=job_id, status="pending")
