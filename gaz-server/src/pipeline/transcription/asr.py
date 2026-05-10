"""Wrapper around Groq Whisper. Used for both YouTube ASR fallback and uploaded videos."""

import os

from ...clients import groq_client
from ...core.config import settings
from ...core.errors import TranscriptionError


def _seg(obj, name):
    return obj[name] if isinstance(obj, dict) else getattr(obj, name)


# Groq Whisper returns the language *name* (e.g. "english"), not the ISO code.
# Map to lowercase ISO 639-1 to match captions-path output. V1 targets en + hi.
_NAME_TO_ISO = {"english": "en", "hindi": "hi"}


async def asr_transcribe(audio_path: str) -> tuple[list[dict], str]:
    """Returns (segments, lang_code). segments shape matches captions.fetch_captions output."""
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()
    try:
        rsp = await groq_client.get().audio.transcriptions.create(
            file=(os.path.basename(audio_path), audio_bytes),
            model=settings().GROQ_WHISPER_MODEL,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )
    except Exception as e:
        raise TranscriptionError(f"ASR transcription failed: {e}") from e

    raw_segments = getattr(rsp, "segments", None) or (
        rsp.get("segments") if isinstance(rsp, dict) else []
    )
    segments = [
        {
            "start": float(_seg(s, "start")),
            "end": float(_seg(s, "end")),
            "text": (_seg(s, "text") or "").strip(),
        }
        for s in raw_segments
        if (_seg(s, "text") or "").strip()
    ]

    if not segments:
        # Fall back to whole-text segment if Groq didn't return segments.
        whole = getattr(rsp, "text", None) or (rsp.get("text") if isinstance(rsp, dict) else "")
        if whole and whole.strip():
            segments = [{"start": 0.0, "end": 0.0, "text": whole.strip()}]
        else:
            raise TranscriptionError("ASR returned an empty transcript")

    lang_attr = getattr(rsp, "language", None) or (rsp.get("language") if isinstance(rsp, dict) else None)
    language = _NAME_TO_ISO.get((lang_attr or "").strip().lower(), "en")
    return segments, language
