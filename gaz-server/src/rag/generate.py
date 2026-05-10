"""Grounded answer generation. Builds the final prompt with retrieved chunks numbered
1..N so the LLM can emit [N] markers that align with the FE's citations[] order."""

import logging
from typing import Optional

from ..clients import openai_client
from ..core.config import settings
from ..core.errors import AppError
from ..schemas.rag import Citation, Turn
from ..utils.timing import format_seconds
from .prompts import SYSTEM_PROMPT

log = logging.getLogger(__name__)

_LANG_NAME = {"english": "English", "hindi": "Hindi", "hinglish": "Hinglish"}


def _render_chunks(citations: list[Citation]) -> str:
    lines = ["RETRIEVED CONTEXT:"]
    for i, c in enumerate(citations, start=1):
        ts = f"{format_seconds(c.timestamp_start)}–{format_seconds(c.timestamp_end)}"
        speakers = f", {', '.join(c.speaker_set)}" if c.speaker_set else ""
        lines.append(f"\n[{i}] ({ts}{speakers})\n{c.text}")
    return "\n".join(lines)


def _summary_block(summary: Optional[str]) -> str:
    if not summary:
        return ""
    return f"CONVERSATION SUMMARY (older turns, for context):\n{summary}"


async def generate_answer(
    query_text: str,
    query_language: str,
    citations: list[Citation],
    conversation_summary: Optional[str],
    recent_turns: list[Turn],
) -> str:
    system = SYSTEM_PROMPT.format(
        language_name=_LANG_NAME.get(query_language, "English"),
        summary_block=_summary_block(conversation_summary),
    )
    full_system = f"{system}\n\n{_render_chunks(citations)}"

    messages: list[dict] = [{"role": "system", "content": full_system}]
    for t in recent_turns:
        messages.append({"role": t.role, "content": t.content})
    messages.append({"role": "user", "content": query_text})

    try:
        rsp = await openai_client.get().chat.completions.create(
            model=settings().GEN_MODEL,
            temperature=0.3,
            max_tokens=800,
            messages=messages,
        )
    except Exception as e:
        log.exception("generate.failed")
        raise AppError(
            "generation_failed", "Something went wrong generating the response.", 500
        ) from e

    return (rsp.choices[0].message.content or "").strip()
