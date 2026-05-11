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
    if not citations:
        return ""
    lines = ["RETRIEVED CONTEXT:"]
    for i, c in enumerate(citations, start=1):
        ts = f"{format_seconds(c.timestamp_start)}–{format_seconds(c.timestamp_end)}"
        speakers = f", {', '.join(c.speaker_set)}" if c.speaker_set else ""
        lines.append(f"\n[{i}] ({ts}{speakers})\n{c.text}")
    return "\n".join(lines)


def _render_document_summary(summary: Optional[dict]) -> str:
    if not summary:
        return ""
    tldr = (summary.get("tldr") or "").strip()
    key_points = [str(p).strip() for p in (summary.get("key_points") or []) if str(p).strip()]
    outline = summary.get("outline") or []

    lines = ["DOCUMENT SUMMARY:"]
    if tldr:
        lines.append(f"\nOverview:\n{tldr}")
    if key_points:
        lines.append("\nKey points:")
        for p in key_points:
            lines.append(f"- {p}")
    if isinstance(outline, list) and outline:
        rendered_outline: list[str] = []
        for item in outline:
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
            if end > 0.0:
                rendered_outline.append(
                    f"- {format_seconds(start)}–{format_seconds(end)}: {title}"
                )
            else:
                rendered_outline.append(f"- {title}")
        if rendered_outline:
            lines.append("\nOutline:")
            lines.extend(rendered_outline)
    return "\n".join(lines)


def _conversation_summary_block(summary: Optional[str]) -> str:
    if not summary:
        return ""
    return f"CONVERSATION SUMMARY (older turns, for context):\n{summary}"


async def generate_answer(
    query_text: str,
    query_language: str,
    citations: list[Citation],
    conversation_summary: Optional[str],
    recent_turns: list[Turn],
    document_summary: Optional[dict] = None,
) -> str:
    system = SYSTEM_PROMPT.format(
        language_name=_LANG_NAME.get(query_language, "English"),
        summary_block=_conversation_summary_block(conversation_summary),
    )

    blocks = [system]
    doc_summary_rendered = _render_document_summary(document_summary)
    if doc_summary_rendered:
        blocks.append(doc_summary_rendered)
    chunks_rendered = _render_chunks(citations)
    if chunks_rendered:
        blocks.append(chunks_rendered)
    full_system = "\n\n".join(blocks)

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
