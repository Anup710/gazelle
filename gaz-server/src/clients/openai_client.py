"""Singleton AsyncOpenAI client. Used for embeddings, GPT-4o-mini, and TTS."""

from functools import lru_cache

from openai import AsyncOpenAI

from ..core.config import settings


@lru_cache
def get() -> AsyncOpenAI:
    return AsyncOpenAI(api_key=settings().OPENAI_API_KEY)
