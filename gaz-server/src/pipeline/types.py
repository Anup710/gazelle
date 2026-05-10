from dataclasses import dataclass
from typing import Optional


@dataclass
class IngestMeta:
    """Bundle of ingest-time metadata returned by every transcription module."""

    full_text: str
    language: str
    duration: Optional[int]
    used_native_captions: Optional[bool]
    title: Optional[str]
