"""POST /rag/query — the core RAG endpoint.

Pipeline: validate session → augment + detect lang → embed → search →
threshold filter → (refusal | generate) → maybe-compact → return.
"""

import logging

from fastapi import APIRouter

from ..core.errors import AppError
from ..db import jobs_repo
from ..rag.augment import augment_query
from ..rag.compact import compact_history, should_compact
from ..rag.generate import generate_answer
from ..rag.prompts import INSUFFICIENT_CONTEXT_REFUSAL
from ..rag.retrieve import embed_query, search
from ..schemas.rag import RagRequest, RagResponse, ResponseBody

router = APIRouter()
log = logging.getLogger(__name__)


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

    # 2. Augment + detect language
    aug = await augment_query(req.query_text, req.conversation_summary, req.recent_turns)
    log.info("query.augmented", extra=aug)

    # 3. Embed + retrieve
    vec = await embed_query(aug["augmented_query"])
    citations = await search(req.session_id, vec)

    # 4. Refusal path
    if not citations:
        log.info(
            "refusal.insufficient_context",
            extra={"session_id": req.session_id, "augmented_query": aug["augmented_query"]},
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
