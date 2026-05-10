"""Singleton AsyncGroq client. Used for Whisper STT (ingest ASR + voice queries)."""

from functools import lru_cache

from groq import AsyncGroq

from ..core.config import settings


@lru_cache
def get() -> AsyncGroq:
    return AsyncGroq(api_key=settings().GROQ_API_KEY)
