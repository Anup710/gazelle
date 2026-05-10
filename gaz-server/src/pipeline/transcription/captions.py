"""YouTube native-caption fast path. Returns None if no usable transcript exists."""

import logging
from typing import Optional

from youtube_transcript_api import (
    NoTranscriptFound,
    TranscriptsDisabled,
    YouTubeTranscriptApi,
)

log = logging.getLogger(__name__)

_PREFERRED_LANGS = ("en", "hi")


def fetch_captions(video_id: str) -> Optional[tuple[list[dict], str]]:
    """Return (segments, lang_code) using manual or auto-generated captions, or None."""
    try:
        listing = YouTubeTranscriptApi().list(video_id)
    except (TranscriptsDisabled, NoTranscriptFound):
        return None
    except Exception as e:
        log.info("captions.list_failed", extra={"video_id": video_id, "err": str(e)[:120]})
        return None

    chosen = None
    # Prefer manually-created transcripts; fall back to auto-generated.
    for finder in (listing.find_manually_created_transcript, listing.find_generated_transcript):
        try:
            chosen = finder(list(_PREFERRED_LANGS))
            break
        except NoTranscriptFound:
            continue
        except Exception:
            continue

    if chosen is None:
        return None

    try:
        raw = chosen.fetch().to_raw_data()
    except Exception as e:
        log.info("captions.fetch_failed", extra={"err": str(e)[:120]})
        return None

    segments = [
        {
            "start": float(s["start"]),
            "end": float(s["start"]) + float(s.get("duration", 0.0)),
            "text": (s.get("text") or "").strip(),
        }
        for s in raw
        if (s.get("text") or "").strip()
    ]
    if not segments:
        return None

    lang = (getattr(chosen, "language_code", None) or "en")[:2].lower()
    return segments, lang
