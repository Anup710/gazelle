"""Validate and canonicalize YouTube URLs. V1 accepts only:
  - youtube.com/watch?v=...
  - youtu.be/...
Rejects m.youtube.com, /embed/, /shorts/, and playlists.
"""

import re
from urllib.parse import parse_qs, urlparse

from ..core.errors import AppError

_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def extract_video_id(url: str) -> str:
    """Return the 11-char video id, or raise AppError('invalid_input', ...)."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    path = parsed.path or ""

    if host in ("www.youtube.com", "youtube.com"):
        if path != "/watch":
            raise AppError(
                "invalid_input",
                "Please enter a valid YouTube link (only /watch?v= URLs are supported).",
            )
        qs = parse_qs(parsed.query)
        vids = qs.get("v") or []
        if not vids or not _VIDEO_ID_RE.match(vids[0]):
            raise AppError("invalid_input", "Please enter a valid YouTube link")
        return vids[0]

    if host == "youtu.be":
        vid = path.lstrip("/")
        if not _VIDEO_ID_RE.match(vid):
            raise AppError("invalid_input", "Please enter a valid YouTube link")
        return vid

    raise AppError(
        "invalid_input",
        "Please enter a valid YouTube link (youtube.com/watch?v=... or youtu.be/...)",
    )


def canonical_watch_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"
