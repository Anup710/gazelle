"""YouTube transcription via Supadata. One HTTP call, native-or-AI-generated handled server-side.

Why Supadata: yt-dlp + youtube-transcript-api both hit YouTube directly from our datacenter IP,
which YouTube increasingly bot-walls. Supadata abstracts that away and returns a transcript
regardless of whether native captions exist.
"""

import logging
from typing import Optional

import httpx

from ...core.config import settings
from ...core.errors import TranscriptionError
from ...utils.titles import title_from_youtube
from ...utils.youtube_url import canonical_watch_url, extract_video_id
from ..types import IngestMeta

log = logging.getLogger(__name__)

_TRANSCRIPT_TIMEOUT_SECONDS = 300.0
_OEMBED_TIMEOUT_SECONDS = 5.0


async def _supadata_transcript(url: str) -> dict:
    """Call Supadata /v1/youtube/transcript. Returns parsed JSON or raises TranscriptionError."""
    cfg = settings()
    if not cfg.SUPADATA_API_KEY:
        raise TranscriptionError("SUPADATA_API_KEY not configured")

    endpoint = f"{cfg.SUPADATA_BASE_URL.rstrip('/')}/v1/youtube/transcript"
    params = {"url": url, "text": "false"}
    headers = {"x-api-key": cfg.SUPADATA_API_KEY}

    log.info("supadata.request.start", extra={"url": url})
    try:
        async with httpx.AsyncClient(timeout=_TRANSCRIPT_TIMEOUT_SECONDS) as client:
            rsp = await client.get(endpoint, params=params, headers=headers)
    except httpx.HTTPError as e:
        log.warning(
            "supadata.request.failed",
            extra={"url": url, "err_type": type(e).__name__, "err": str(e)[:400]},
        )
        raise TranscriptionError(f"Supadata request failed: {e}") from e

    if rsp.status_code >= 400:
        body_preview = rsp.text[:400] if rsp.text else ""
        log.warning(
            "supadata.request.http_error",
            extra={"url": url, "status": rsp.status_code, "body": body_preview},
        )
        # Try to surface Supadata's structured error code.
        try:
            err_payload = rsp.json()
            code = err_payload.get("error") or "supadata_error"
            msg = err_payload.get("message") or "Transcript unavailable"
        except ValueError:
            code, msg = "supadata_error", "Transcript unavailable"
        raise TranscriptionError(f"{code}: {msg}")

    try:
        data = rsp.json()
    except ValueError as e:
        raise TranscriptionError("Supadata returned non-JSON response") from e

    log.info(
        "supadata.request.ok",
        extra={
            "url": url,
            "lang": data.get("lang"),
            "segment_count": len(data.get("content") or []) if isinstance(data.get("content"), list) else 0,
        },
    )
    return data


def _normalize_segments(payload: dict) -> list[dict]:
    """Map Supadata's TranscriptChunk[] (offset/duration in ms) to our {start, end, text} in seconds."""
    raw = payload.get("content")
    if not isinstance(raw, list):
        return []
    segments: list[dict] = []
    for c in raw:
        text = (c.get("text") or "").strip()
        if not text:
            continue
        offset_ms = float(c.get("offset", 0) or 0)
        duration_ms = float(c.get("duration", 0) or 0)
        start = offset_ms / 1000.0
        end = start + (duration_ms / 1000.0)
        segments.append({"start": start, "end": end, "text": text})
    return segments


async def _title_via_oembed(url: str) -> Optional[str]:
    """Best-effort title lookup. Returns None on any failure — caller falls back to URL."""
    try:
        async with httpx.AsyncClient(timeout=_OEMBED_TIMEOUT_SECONDS) as client:
            rsp = await client.get(
                "https://www.youtube.com/oembed",
                params={"url": url, "format": "json"},
            )
        if rsp.status_code != 200:
            return None
        return (rsp.json().get("title") or "").strip() or None
    except Exception as e:
        log.info("oembed.failed", extra={"url": url, "err": str(e)[:200]})
        return None


async def transcribe_youtube(url: str) -> tuple[dict, IngestMeta]:
    video_id = extract_video_id(url)
    canonical = canonical_watch_url(video_id)
    log.info(
        "youtube.ingest.start",
        extra={"url": url, "video_id": video_id, "provider": "supadata"},
    )
    # Loud, unambiguous marker: this video is being routed through Supadata, not yt-dlp.
    log.info(
        "youtube.route.supadata",
        extra={"video_id": video_id, "canonical_url": canonical},
    )

    payload = await _supadata_transcript(canonical)
    segments = _normalize_segments(payload)
    if not segments:
        raise TranscriptionError("Supadata returned an empty transcript")

    language = (payload.get("lang") or "en")[:2].lower()
    full_text = " ".join(s["text"] for s in segments).strip()

    # Derive duration from segment end times — accurate enough for the UI badge.
    max_end = max((s["end"] for s in segments), default=0.0)
    duration = int(max_end) if max_end > 0 else None

    raw_title = await _title_via_oembed(canonical)
    title = title_from_youtube(raw_title, canonical)

    # Supadata doesn't expose a native-vs-generated flag, so this stays optional.
    used_native: Optional[bool] = None

    log.info(
        "youtube.ingest.complete",
        extra={
            "video_id": video_id,
            "provider": "supadata",
            "segment_count": len(segments),
            "duration_seconds": duration,
            "language": language,
        },
    )

    transcript_json = {
        "transcript": segments,
        "full_text": full_text,
        "detected_language": language,
        "duration_seconds": duration,
        "used_native_captions": used_native,
    }
    meta = IngestMeta(
        full_text=full_text,
        language=language,
        duration=duration,
        used_native_captions=used_native,
        title=title,
    )
    return transcript_json, meta
