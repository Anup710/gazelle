"""Synthesize a transcript shape from raw pasted text. No ASR involved."""

import re

from ...utils.titles import title_from_text
from ..types import IngestMeta

_DEVANAGARI = re.compile(r"[ऀ-ॿ]")
_WS = re.compile(r"[ \t]+")


def _normalize(text: str) -> str:
    # Collapse multiple spaces/tabs but preserve line breaks.
    out = []
    for line in text.splitlines():
        out.append(_WS.sub(" ", line).strip())
    return "\n".join(l for l in out if l)


def _detect_lang(text: str) -> str:
    sample = text[:500]
    return "hi" if _DEVANAGARI.search(sample) else "en"


def synthesize_transcript_from_text(text: str) -> tuple[dict, IngestMeta]:
    cleaned = _normalize(text)
    language = _detect_lang(cleaned)
    segments = [{"start": 0.0, "end": 0.0, "text": cleaned}]
    transcript_json = {
        "transcript": segments,
        "full_text": cleaned,
        "detected_language": language,
        "duration_seconds": None,
        "used_native_captions": None,
    }
    meta = IngestMeta(
        full_text=cleaned,
        language=language,
        duration=None,
        used_native_captions=None,
        title=title_from_text(cleaned),
    )
    return transcript_json, meta
