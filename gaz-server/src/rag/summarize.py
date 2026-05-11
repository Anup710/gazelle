"""Per-session video summary generation.

One gpt-4o-mini call over the full transcript produces a structured JSON
summary cached on jobs.summary_json. Generated lazily on first
summary-intent query, then reused.

Output shape:
    {
      "tldr": "<one-paragraph overview>",
      "key_points": ["...", "..."],
      "outline": [{"title": "...", "start": <sec>, "end": <sec>}]
    }
"""

import json
import logging

import tiktoken

from ..clients import openai_client
from ..core.config import settings
from ..core.constants import SUMMARY_INPUT_TOKEN_BUDGET, SUMMARY_MAX_TOKENS
from .prompts import SUMMARY_SYSTEM_PROMPT

log = logging.getLogger(__name__)

_LANG_NAME = {"english": "English", "hindi": "Hindi", "hinglish": "Hinglish"}
_ENC = tiktoken.get_encoding("cl100k_base")

# Insert a [HH:MM:SS] marker roughly every TIMESTAMP_INTERVAL_SEC so the model
# can pick section boundaries with real timestamps. Cheap on tokens.
TIMESTAMP_INTERVAL_SEC = 60.0


def _has_timestamps(segments: list[dict]) -> bool:
    return any(float(s.get("end") or 0.0) > 0.0 for s in segments)


def _format_ts(seconds: float) -> str:
    s = int(round(seconds))
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{sec:02d}"


def _build_timestamped_input(segments: list[dict]) -> str:
    """Interleave [HH:MM:SS] markers with transcript text."""
    out: list[str] = []
    next_marker = 0.0
    for seg in segments:
        start = float(seg.get("start") or 0.0)
        if start >= next_marker:
            out.append(f"\n[{_format_ts(start)}]")
            next_marker = start + TIMESTAMP_INTERVAL_SEC
        text = (seg.get("text") or "").strip()
        if text:
            out.append(text)
    return " ".join(out).strip()


def _truncate_to_budget(text: str, budget: int) -> str:
    toks = _ENC.encode(text)
    if len(toks) <= budget:
        return text
    return _ENC.decode(toks[:budget])


def _shape_input(transcript_json: dict) -> str:
    segments = transcript_json.get("transcript") or []
    if segments and _has_timestamps(segments):
        raw = _build_timestamped_input(segments)
    else:
        raw = (transcript_json.get("full_text") or "").strip()
    return _truncate_to_budget(raw, SUMMARY_INPUT_TOKEN_BUDGET)


def _coerce_outline(raw_outline) -> list[dict]:
    if not isinstance(raw_outline, list):
        return []
    cleaned: list[dict] = []
    for item in raw_outline:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        try:
            start = float(item.get("start") or 0.0)
            end = float(item.get("end") or 0.0)
        except (TypeError, ValueError):
            start, end = 0.0, 0.0
        cleaned.append({"title": title, "start": start, "end": end})
    return cleaned


def _coerce_key_points(raw_points) -> list[str]:
    if not isinstance(raw_points, list):
        return []
    return [str(p).strip() for p in raw_points if str(p).strip()]


async def generate_session_summary(transcript_json: dict, language: str) -> dict:
    """One LLM call → structured summary dict. Safe defaults on parse errors."""
    input_text = _shape_input(transcript_json)
    if not input_text:
        return {"tldr": "", "key_points": [], "outline": []}

    system = SUMMARY_SYSTEM_PROMPT.format(
        language_name=_LANG_NAME.get(language, "English")
    )

    rsp = await openai_client.get().chat.completions.create(
        model=settings().GEN_MODEL,
        temperature=0.2,
        max_tokens=SUMMARY_MAX_TOKENS,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": input_text},
        ],
    )

    raw = rsp.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        log.warning("summarize.bad_json", extra={"raw": raw[:200]})
        parsed = {}

    return {
        "tldr": str(parsed.get("tldr") or "").strip(),
        "key_points": _coerce_key_points(parsed.get("key_points")),
        "outline": _coerce_outline(parsed.get("outline")),
    }
