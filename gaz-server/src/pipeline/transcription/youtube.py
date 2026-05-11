"""Top-level YouTube transcription. Caption-first → ASR fallback per stage 0 TRD §5."""

import asyncio
import logging
import os
import tempfile

import yt_dlp

from ...core.config import settings
from ...core.errors import TranscriptionError
from ...utils.titles import title_from_youtube
from ...utils.youtube_url import canonical_watch_url, extract_video_id
from ..types import IngestMeta
from .asr import asr_transcribe
from .captions import fetch_captions

log = logging.getLogger(__name__)

# YouTube's bot detection aggressively flags datacenter IPs on the default `web` client.
# Falling back through TV-embedded → Safari → mobile web tends to slip past it.
_YT_EXTRACTOR_ARGS = {"youtube": {"player_client": ["tv_embedded", "web_safari", "mweb"]}}


def _common_yt_opts() -> dict:
    """Shared yt-dlp opts: player-client fallbacks + cookies file when configured."""
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "extractor_args": _YT_EXTRACTOR_ARGS,
    }
    cookies_path = settings().YOUTUBE_COOKIES_FILE
    if cookies_path:
        if os.path.exists(cookies_path):
            opts["cookiefile"] = cookies_path
        else:
            log.warning("youtube.cookies_file_missing", extra={"path": cookies_path})
    return opts


def _get_metadata(url: str) -> dict:
    opts = {**_common_yt_opts(), "skip_download": True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    return info or {}


def _download_audio(url: str, video_id: str) -> str:
    out_template = os.path.join(tempfile.gettempdir(), f"gazelle_{video_id}.%(ext)s")
    opts = {
        **_common_yt_opts(),
        "format": "bestaudio/best",
        "outtmpl": out_template,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "64",
            }
        ],
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])
    expected = os.path.join(tempfile.gettempdir(), f"gazelle_{video_id}.mp3")
    if not os.path.exists(expected):
        raise TranscriptionError("Audio download failed")
    return expected


async def transcribe_youtube(url: str) -> tuple[dict, IngestMeta]:
    video_id = extract_video_id(url)
    canonical = canonical_watch_url(video_id)

    # Metadata + captions in parallel — both are independent network calls.
    info_task = asyncio.to_thread(_get_metadata, canonical)
    captions_task = asyncio.to_thread(fetch_captions, video_id)
    info, captions = await asyncio.gather(info_task, captions_task)

    title = title_from_youtube(info.get("title"), canonical)
    duration_raw = info.get("duration")
    duration = int(duration_raw) if duration_raw else None

    if captions is not None:
        segments, language = captions
        used_native = True
        log.info("youtube.captions_used", extra={"video_id": video_id, "lang": language})
    else:
        log.info("youtube.captions_unavailable", extra={"video_id": video_id})
        audio_path = await asyncio.to_thread(_download_audio, canonical, video_id)
        try:
            segments, language = await asr_transcribe(audio_path)
        finally:
            try:
                os.remove(audio_path)
            except OSError:
                pass
        used_native = False

    full_text = " ".join(s["text"] for s in segments).strip()
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
