"""Embed the augmented query, search Qdrant, filter by similarity threshold."""

import asyncio
import logging

from qdrant_client.http import models as qm

from ..clients import openai_client, qdrant_client
from ..core.config import settings
from ..schemas.rag import Citation

log = logging.getLogger(__name__)


async def embed_query(text: str) -> list[float]:
    rsp = await openai_client.get().embeddings.create(
        model=settings().EMBED_MODEL,
        input=[text],
    )
    return rsp.data[0].embedding


async def search(session_id: str, vector: list[float]) -> list[Citation]:
    s = settings()
    flt = qm.Filter(
        must=[qm.FieldCondition(key="session_id", match=qm.MatchValue(value=session_id))]
    )
    # qdrant-client >=1.12 removed .search(); use .query_points() and unwrap .points.
    res = await asyncio.to_thread(
        qdrant_client.get().query_points,
        collection_name=s.QDRANT_COLLECTION,
        query=vector,
        query_filter=flt,
        limit=s.TOP_K,
        with_payload=True,
    )
    hits = res.points

    citations: list[Citation] = []
    for h in hits:
        if h.score < s.MIN_SIMILARITY_SCORE:
            continue
        p = h.payload or {}
        citations.append(
            Citation(
                chunk_id=str(p.get("chunk_id", h.id)),
                text=str(p.get("text", "")),
                timestamp_start=float(p.get("start_time", 0.0)),
                timestamp_end=float(p.get("end_time", 0.0)),
                relevance_score=float(h.score),
                speaker_set=list(p.get("speaker_set") or []),
            )
        )
    log.info(
        "retrieval.done",
        extra={
            "session_id": session_id,
            "chunk_ids": [c.chunk_id for c in citations],
            "scores": [round(c.relevance_score, 3) for c in citations],
            "filtered_count": len(citations),
            "raw_count": len(hits),
        },
    )
    return citations
