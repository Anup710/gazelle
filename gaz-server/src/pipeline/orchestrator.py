"""Stage 0+1 orchestrator. One async function = one ingest job.

Catches every exception, marks the job failed with a structured failure_reason,
and never raises out. Cleans up upload temp files in `finally`.
"""

import logging
import os
from typing import Any

from ..core.errors import EmbeddingError, TranscriptionError
from ..db import jobs_repo
from .chunking import chunk_transcript
from .embedding import embed_and_upsert
from .transcription.text import synthesize_transcript_from_text
from .transcription.upload import transcribe_upload
from .transcription.youtube import transcribe_youtube
from .validation import classify_educational

log = logging.getLogger(__name__)


async def run_ingest_job(job_id: str, source_type: str, payload: dict[str, Any]) -> None:
    log.info("ingest.start", extra={"job_id": job_id, "source_type": source_type})
    try:
        # 1. Transcription
        jobs_repo.set_status(job_id, "transcribing")
        log.info("ingest.transition", extra={"job_id": job_id, "to": "transcribing"})

        if source_type == "youtube":
            transcript_json, meta = await transcribe_youtube(payload["url"])
        elif source_type == "upload":
            transcript_json, meta = await transcribe_upload(
                payload["temp_path"], payload["original_filename"]
            )
        elif source_type == "transcript":
            transcript_json, meta = synthesize_transcript_from_text(payload["text"])
        else:
            raise ValueError(f"unknown source_type: {source_type}")

        jobs_repo.save_transcript(
            job_id,
            transcript_json=transcript_json,
            full_text=meta.full_text,
            detected_language=meta.language,
            duration_seconds=meta.duration,
            used_native_captions=meta.used_native_captions,
            title=meta.title,
        )

        # 2. Validation
        jobs_repo.set_status(job_id, "validating")
        log.info("ingest.transition", extra={"job_id": job_id, "to": "validating"})

        result = await classify_educational(meta.full_text)
        jobs_repo.save_validation(job_id, result)
        if not result.get("is_educational", True):
            jobs_repo.mark_failed(
                job_id,
                failure_reason="non_educational",
                error_message="This content doesn't appear to be educational.",
            )
            log.info(
                "ingest.failed",
                extra={"job_id": job_id, "failure_reason": "non_educational"},
            )
            return

        # 3. Chunk + embed + upsert
        jobs_repo.set_status(job_id, "embedding")
        log.info("ingest.transition", extra={"job_id": job_id, "to": "embedding"})

        chunks = chunk_transcript(transcript_json, session_id=job_id, language=meta.language)
        await embed_and_upsert(chunks)

        # 4. Done
        jobs_repo.set_status(job_id, "ready")
        log.info("ingest.ready", extra={"job_id": job_id, "chunk_count": len(chunks)})

    except TranscriptionError as e:
        log.exception("ingest.transcription_failed", extra={"job_id": job_id})
        jobs_repo.mark_failed(job_id, "transcription_failed", str(e) or "Transcription failed.")
    except EmbeddingError as e:
        log.exception("ingest.embedding_failed", extra={"job_id": job_id})
        jobs_repo.mark_failed(job_id, "embedding_failed", str(e) or "Embedding failed.")
    except Exception as e:
        log.exception("ingest.unknown_failure", extra={"job_id": job_id})
        jobs_repo.mark_failed(job_id, "unknown", "An unexpected error occurred. Please try again.")
    finally:
        # Always clean up upload temp file, even on failure.
        if source_type == "upload":
            tp = payload.get("temp_path")
            if tp and os.path.exists(tp):
                try:
                    os.remove(tp)
                except OSError:
                    pass
