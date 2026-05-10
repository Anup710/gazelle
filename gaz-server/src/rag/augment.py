"""Query augmentation + language detection — one GPT-4o-mini call returns both."""

import json
import logging
from typing import Optional

from ..clients import openai_client
from ..core.config import settings
from ..schemas.rag import Turn
from .prompts import AUGMENT_SYSTEM_PROMPT

log = logging.getLogger(__name__)


def _build_user(query_text: str, summary: Optional[str], recent: list[Turn]) -> str:
    lines = [f"SUMMARY: {summary or '(none)'}", "RECENT:"]
    if recent:
        for t in recent:
            lines.append(f"  {t.role}: {t.content}")
    else:
        lines.append("  (none)")
    lines.append(f"QUESTION: {query_text}")
    return "\n".join(lines)


async def augment_query(
    query_text: str,
    conversation_summary: Optional[str],
    recent_turns: list[Turn],
) -> dict:
    """Returns {'augmented_query': str, 'query_language': 'english'|'hindi'|'hinglish'}."""
    user_msg = _build_user(query_text, conversation_summary, recent_turns)
    rsp = await openai_client.get().chat.completions.create(
        model=settings().GEN_MODEL,
        temperature=0.2,
        max_tokens=160,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": AUGMENT_SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
    )
    raw = rsp.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        log.warning("augment.bad_json", extra={"raw": raw[:200]})
        parsed = {}

    augmented = (parsed.get("augmented_query") or "").strip() or query_text
    lang = (parsed.get("query_language") or "english").strip().lower()
    if lang not in ("english", "hindi", "hinglish"):
        lang = "english"
    return {"augmented_query": augmented, "query_language": lang}
