"""Transcribe an uploaded video file: extract audio → ASR → build transcript shape."""

import asyncio
import logging
import os
from typing import Optional

import ffmpeg

from ...services.ffmpeg_audio import extract_audio_to_mp3
from ...utils.titles import title_from_upload
from ..types import IngestMeta
from .asr import asr_transcribe

log = logging.getLogger(__name__)


def _probe_duration(video_path: str) -> Optional[int]:
    try:
        info = ffmpeg.probe(video_path)
        d = float(info.get("format", {}).get("duration") or 0)
        return int(d) if d > 0 else None
    except Exception as e:
        log.info("ffprobe.failed", extra={"err": str(e)[:120]})
        return None


async def transcribe_upload(temp_path: str, original_filename: str) -> tuple[dict, IngestMeta]:
    duration = await asyncio.to_thread(_probe_duration, temp_path)
    audio_path = await asyncio.to_thread(extract_audio_to_mp3, temp_path)
    try:
        segments, language = await asr_transcribe(audio_path)
    finally:
        try:
            os.remove(audio_path)
        except OSError:
            pass

    full_text = " ".join(s["text"] for s in segments).strip()
    transcript_json = {
        "transcript": segments,
        "full_text": full_text,
        "detected_language": language,
        "duration_seconds": duration,
        "used_native_captions": None,
    }
    meta = IngestMeta(
        full_text=full_text,
        language=language,
        duration=duration,
        used_native_captions=None,
        title=title_from_upload(original_filename),
    )
    return transcript_json, meta
