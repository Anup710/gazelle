"""Singleton Qdrant client + collection bootstrap.

The lifespan hook in main.py calls `ensure_collection()` on startup so the
collection and the session_id payload index always exist before serving traffic.
"""

import logging
from functools import lru_cache

from qdrant_client import QdrantClient
from qdrant_client.http import models as qm

from ..core.config import settings
from ..core.constants import EMBED_DIM

log = logging.getLogger(__name__)


@lru_cache
def get() -> QdrantClient:
    s = settings()
    return QdrantClient(url=s.QDRANT_URL, api_key=s.QDRANT_API_KEY, timeout=30.0)


def ensure_collection() -> None:
    """Create the collection and the session_id payload index if missing.
    Idempotent — safe to call on every boot.
    """
    client = get()
    name = settings().QDRANT_COLLECTION

    existing = {c.name for c in client.get_collections().collections}
    if name not in existing:
        client.create_collection(
            collection_name=name,
            vectors_config=qm.VectorParams(size=EMBED_DIM, distance=qm.Distance.COSINE),
        )
        log.info("qdrant.collection_created", extra={"collection": name})
    else:
        log.info("qdrant.collection_exists", extra={"collection": name})

    # Payload index on session_id — required for fast filtered search per stage 1 TRD §9.
    try:
        client.create_payload_index(
            collection_name=name,
            field_name="session_id",
            field_schema=qm.PayloadSchemaType.KEYWORD,
        )
        log.info("qdrant.payload_index_created", extra={"field": "session_id"})
    except Exception as e:
        # Already exists is the common case — Qdrant raises rather than no-op.
        log.info("qdrant.payload_index_skip", extra={"reason": str(e)[:120]})
