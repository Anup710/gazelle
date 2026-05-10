"""Embed chunks via OpenAI and upsert into Qdrant. Batched, idempotent on chunk_id."""

import asyncio
import logging

from qdrant_client.http import models as qm

from ..clients import openai_client, qdrant_client
from ..core.config import settings
from ..core.constants import EMBED_BATCH_SIZE
from ..core.errors import EmbeddingError

log = logging.getLogger(__name__)

_PAYLOAD_KEYS = (
    "session_id", "chunk_id", "chunk_index", "text",
    "start_time", "end_time", "speaker_set", "language",
    "prev_chunk_id", "next_chunk_id",
)


async def embed_and_upsert(chunks: list[dict]) -> None:
    if not chunks:
        log.info("embedding.no_chunks")
        return
    try:
        texts = [c["text"] for c in chunks]
        vectors: list[list[float]] = []
        for i in range(0, len(texts), EMBED_BATCH_SIZE):
            batch = texts[i : i + EMBED_BATCH_SIZE]
            rsp = await openai_client.get().embeddings.create(
                model=settings().EMBED_MODEL,
                input=batch,
            )
            vectors.extend([d.embedding for d in rsp.data])

        points = [
            qm.PointStruct(
                id=c["chunk_id"],
                vector=vec,
                payload={k: c[k] for k in _PAYLOAD_KEYS},
            )
            for c, vec in zip(chunks, vectors)
        ]
        await asyncio.to_thread(
            qdrant_client.get().upsert,
            collection_name=settings().QDRANT_COLLECTION,
            points=points,
            wait=True,
        )
        log.info("embedding.upserted", extra={"count": len(points)})
    except Exception as e:
        raise EmbeddingError(f"Embedding upsert failed: {e}") from e
