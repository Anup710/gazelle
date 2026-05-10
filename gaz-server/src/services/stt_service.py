"""POST /stt — transcribe a voice query via Groq Whisper."""

from ..clients import groq_client
from ..core.config import settings
from ..core.errors import AppError


async def transcribe_voice(audio_bytes: bytes, filename: str) -> str:
    try:
        rsp = await groq_client.get().audio.transcriptions.create(
            file=(filename, audio_bytes),
            model=settings().GROQ_WHISPER_MODEL,
            response_format="text",
        )
    except Exception as e:
        raise AppError("stt_failed", "Couldn't transcribe audio.", 500) from e

    # response_format="text" returns the raw transcript string
    text = (rsp if isinstance(rsp, str) else getattr(rsp, "text", "") or "").strip()
    if not text:
        raise AppError("stt_failed", "Couldn't transcribe audio.", 500)
    return text
