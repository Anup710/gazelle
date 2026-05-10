"""Extract mono 16 kHz mp3 audio from a local video file using FFmpeg."""

import os
import tempfile

import ffmpeg

from ..core.errors import TranscriptionError


def extract_audio_to_mp3(video_path: str) -> str:
    """Returns the path to the produced mp3 (in /tmp). Caller is responsible for cleanup."""
    out_path = os.path.join(
        tempfile.gettempdir(), os.path.basename(video_path) + ".mp3"
    )
    try:
        (
            ffmpeg.input(video_path)
            .output(out_path, ac=1, ar=16000, format="mp3", **{"q:a": 5})
            .overwrite_output()
            .run(quiet=True)
        )
    except ffmpeg.Error as e:
        stderr = e.stderr.decode("utf-8", errors="ignore")[:200] if e.stderr else str(e)
        raise TranscriptionError(f"Audio extraction failed: {stderr}") from e
    return out_path
