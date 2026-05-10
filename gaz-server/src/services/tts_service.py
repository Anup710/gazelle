"""POST /tts — stream mp3 audio from OpenAI TTS.

Truncates input to the last complete paragraph within the 3,500-character cap
(silent — FE infers from input length per FE plan §8 Seam 6).
"""

from typing import AsyncIterator

from ..clients import openai_client
from ..core.config import settings
from ..core.constants import TTS_CHAR_LIMIT
from ..core.errors import AppError


def truncate_to_paragraph(text: str, limit: int = TTS_CHAR_LIMIT) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit]
    # Prefer paragraph boundary, then sentence boundary, then hard cut.
    p = cut.rfind("\n\n")
    if p > 0:
        return cut[:p].rstrip()
    p = cut.rfind(". ")
    if p > 0:
        return cut[: p + 1].rstrip()
    return cut.rstrip()


async def stream_speech(text: str, _language: str) -> AsyncIterator[bytes]:
    """Yields mp3 chunks. The OpenAI TTS voice is the same regardless of language —
    `tts-1` voices speak whatever language they're given, so `language` is currently
    only an FE→server hint that we accept but don't switch on."""
    s = settings()
    payload = truncate_to_paragraph(text)
    try:
        async with openai_client.get().audio.speech.with_streaming_response.create(
            model=s.TTS_MODEL,
            voice=s.TTS_VOICE,
            input=payload,
            response_format="mp3",
        ) as rsp:
            async for chunk in rsp.iter_bytes(chunk_size=8192):
                yield chunk
    except AppError:
        raise
    except Exception as e:
        raise AppError("generation_failed", "Unable to generate audio.", 500) from e
