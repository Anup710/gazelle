"""POST /rag/query — the core RAG endpoint.

Pipeline: validate session → augment + detect lang + classify intent →
branch on query_type:
  - summary : load/lazy-generate jobs.summary_json, skip retrieval
  - thematic: retrieve + load/lazy-generate summary, use both
  - detail  : embed + retrieve + threshold (refusal on empty)
→ generate → maybe-compact → return.
"""

import logging
from typing import Optional

from fastapi import APIRouter

from ..core.errors import AppError
from ..db import jobs_repo
from ..rag.augment import augment_query
from ..rag.compact import compact_history, should_compact
from ..rag.generate import generate_answer
from ..rag.prompts import INSUFFICIENT_CONTEXT_REFUSAL
from ..rag.retrieve import embed_query, search
from ..rag.summarize import generate_session_summary
from ..schemas.rag import RagRequest, RagResponse, ResponseBody

router = APIRouter()
log = logging.getLogger(__name__)

# Map the ISO 2-char language code stored in jobs.detected_language onto the
# prompt-facing names the summary/generation prompts expect.
_ISO_TO_PROMPT_LANG = {"en": "english", "hi": "hindi"}


def _video_prompt_language(job: dict) -> str:
    iso = (job.get("detected_language") or "").lower()
    return _ISO_TO_PROMPT_LANG.get(iso, "english")


async def _load_or_generate_summary(job: dict) -> Optional[dict]:
    """Return the cached summary_json for this job, generating + persisting on first use.

    Returns None if generation fails — callers must tolerate that.
    """
    cached = job.get("summary_json")
    if cached:
        return cached

    transcript_json = job.get("transcript_json") or {}
    if not transcript_json.get("transcript") and not transcript_json.get("full_text"):
        log.warning("summary.no_transcript", extra={"session_id": job.get("id")})
        return None

    try:
        log.info("summary.generating", extra={"session_id": job.get("id")})
        summary = await generate_session_summary(
            transcript_json=transcript_json,
            language=_video_prompt_language(job),
        )
    except Exception:
        log.exception("summary.generation_failed", extra={"session_id": job.get("id")})
        return None

    if not summary.get("tldr") and not summary.get("key_points"):
        log.warning("summary.empty_result", extra={"session_id": job.get("id")})
        return None

    try:
        jobs_repo.save_summary(job["id"], summary)
    except Exception:
        log.exception("summary.save_failed", extra={"session_id": job.get("id")})
        # Still return it — we just won't cache. Next query will regenerate.

    return summary


@router.post("/rag/query", response_model=RagResponse)
async def rag_query(req: RagRequest) -> RagResponse:
    log.info(
        "query.received",
        extra={"session_id": req.session_id, "turn_count": req.turn_count},
    )

    # 1. Validate session
    job = jobs_repo.get_job(req.session_id)
    if not job:
        raise AppError("invalid_session", "This session is no longer available.", 404)
    if job.get("status") != "ready":
        raise AppError("invalid_session", "This session is not ready yet.", 404)

    # 2. Augment + detect language + classify intent
    aug = await augment_query(req.query_text, req.conversation_summary, req.recent_turns)
    log.info("query.augmented", extra=aug)

    query_type = aug["query_type"]
    citations = []
    document_summary: Optional[dict] = None

    # 3. Branch on intent
    if query_type == "summary":
        document_summary = await _load_or_generate_summary(job)
        if document_summary is None:
            # Fall back to standard retrieval rather than refusing outright.
            log.info("summary.fallback_to_retrieve", extra={"session_id": req.session_id})
            vec = await embed_query(aug["augmented_query"])
            citations = await search(req.session_id, vec)
    elif query_type == "thematic":
        document_summary = await _load_or_generate_summary(job)
        vec = await embed_query(aug["augmented_query"])
        citations = await search(req.session_id, vec)
    else:  # "detail" — unchanged path
        vec = await embed_query(aug["augmented_query"])
        citations = await search(req.session_id, vec)

    # 4. Refusal path — only when we have NO grounding material at all.
    if not citations and not document_summary:
        log.info(
            "refusal.insufficient_context",
            extra={
                "session_id": req.session_id,
                "augmented_query": aug["augmented_query"],
                "query_type": query_type,
            },
        )
        return RagResponse(
            response=ResponseBody(
                text=INSUFFICIENT_CONTEXT_REFUSAL.get(
                    aug["query_language"], INSUFFICIENT_CONTEXT_REFUSAL["english"]
                ),
                language=aug["query_language"],
            ),
            conversation_summary=None,
            citations=[],
        )

    # 5. Generate
    answer = await generate_answer(
        query_text=req.query_text,
        query_language=aug["query_language"],
        citations=citations,
        conversation_summary=req.conversation_summary,
        recent_turns=req.recent_turns,
        document_summary=document_summary,
    )

    # 6. Maybe compact
    new_summary = None
    if should_compact(req.turn_count):
        new_summary = await compact_history(
            prior_summary=req.conversation_summary,
            recent_turns=req.recent_turns,
            current_user=req.query_text,
            current_assistant=answer,
        )
        log.info("compaction.fired", extra={"turn_count": req.turn_count + 1})

    return RagResponse(
        response=ResponseBody(text=answer, language=aug["query_language"]),
        conversation_summary=new_summary,
        citations=citations,
    )
