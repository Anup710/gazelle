"""Title derivation per source_type, locked in be-plan.md §10."""

import os


def title_from_youtube(metadata_title: str | None, url: str) -> str:
    if metadata_title:
        return metadata_title[:200]
    return url


def title_from_upload(filename: str) -> str:
    base = os.path.splitext(os.path.basename(filename))[0].strip()
    return base[:80] if base else "Uploaded video"


def title_from_text(text: str) -> str:
    stripped = text.strip()
    if not stripped:
        return "Pasted transcript"
    snippet = stripped.splitlines()[0][:60].strip()
    if not snippet:
        return "Pasted transcript"
    return snippet + ("…" if len(stripped) > 60 else "")
