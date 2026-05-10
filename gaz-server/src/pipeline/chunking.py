"""Semantic-ish chunking: RecursiveCharacterTextSplitter with tiktoken length function.

Each output chunk records start_time/end_time/speaker_set by mapping its character
range in the synthesized full_text back to the source transcript segments.
"""

import uuid
from typing import Optional

import tiktoken
from langchain_text_splitters import RecursiveCharacterTextSplitter

from ..core.constants import CHUNK_OVERLAP_TOKENS, CHUNK_TARGET_TOKENS

_ENC = tiktoken.get_encoding("cl100k_base")


def _toklen(text: str) -> int:
    return len(_ENC.encode(text or ""))


_SPLITTER = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_TARGET_TOKENS,
    chunk_overlap=CHUNK_OVERLAP_TOKENS,
    length_function=_toklen,
    separators=["\n\n", "\n", ". ", " ", ""],
    add_start_index=True,
)


def _build_text_with_spans(segments: list[dict]) -> tuple[str, list[tuple[int, int, float, float, Optional[str]]]]:
    """Concatenate segment texts with single-space separators and record spans.
    Returns (full_text, spans) where each span is (char_start, char_end, t_start, t_end, speaker).
    """
    parts: list[str] = []
    spans: list[tuple[int, int, float, float, Optional[str]]] = []
    cursor = 0
    for seg in segments:
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        if parts:
            parts.append(" ")
            cursor += 1
        parts.append(text)
        end = cursor + len(text)
        spans.append(
            (
                cursor,
                end,
                float(seg.get("start", 0.0)),
                float(seg.get("end", 0.0)),
                seg.get("speaker"),
            )
        )
        cursor = end
    return "".join(parts), spans


def _spans_for(spans, char_start: int, char_end: int) -> tuple[float, float, list[str]]:
    starts: list[float] = []
    ends: list[float] = []
    speakers: set[str] = set()
    for s_start, s_end, t_start, t_end, speaker in spans:
        if s_end <= char_start or s_start >= char_end:
            continue
        starts.append(t_start)
        ends.append(t_end)
        if speaker:
            speakers.add(speaker)
    if not starts:
        return 0.0, 0.0, []
    return min(starts), max(ends), sorted(speakers)


def chunk_transcript(transcript_json: dict, session_id: str, language: str) -> list[dict]:
    segments = transcript_json.get("transcript") or []
    full_text, spans = _build_text_with_spans(segments)
    if not full_text:
        return []

    docs = _SPLITTER.create_documents([full_text])
    chunks: list[dict] = []
    for idx, doc in enumerate(docs):
        text = doc.page_content
        start_idx = int(doc.metadata.get("start_index", 0))
        end_idx = start_idx + len(text)
        start_t, end_t, speakers = _spans_for(spans, start_idx, end_idx)
        chunks.append(
            {
                "chunk_id": str(uuid.uuid4()),
                "session_id": session_id,
                "chunk_index": idx,
                "text": text,
                "start_time": start_t,
                "end_time": end_t,
                "speaker_set": speakers,
                "language": language,
                "prev_chunk_id": None,
                "next_chunk_id": None,
            }
        )

    for i, c in enumerate(chunks):
        c["prev_chunk_id"] = chunks[i - 1]["chunk_id"] if i > 0 else None
        c["next_chunk_id"] = chunks[i + 1]["chunk_id"] if i + 1 < len(chunks) else None
    return chunks
