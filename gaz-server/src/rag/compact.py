"""Conversation summary compaction — fires every 4th user turn (cumulative)."""

from typing import Optional

from ..clients import openai_client
from ..core.config import settings
from ..core.constants import COMPACTION_INTERVAL
from ..schemas.rag import Turn
from .prompts import COMPACTION_SYSTEM_PROMPT


def should_compact(turn_count: int) -> bool:
    """True on the 4th, 8th, 12th, ... user turn overall.

    `turn_count` is the number of user turns BEFORE this one;
    the current turn is therefore the (turn_count + 1)-th user turn.
    """
    return (turn_count + 1) % COMPACTION_INTERVAL == 0


def _build_user(
    prior: Optional[str],
    recent: list[Turn],
    current_user: str,
    current_assistant: str,
) -> str:
    lines = [f"PRIOR SUMMARY: {prior or '(none yet)'}", "", "RECENT TURNS:"]
    if recent:
        for t in recent:
            lines.append(f"  {t.role}: {t.content}")
    else:
        lines.append("  (none)")
    lines += [
        "",
        "LATEST EXCHANGE (also include in summary):",
        f"  user: {current_user}",
        f"  assistant: {current_assistant}",
    ]
    return "\n".join(lines)


async def compact_history(
    prior_summary: Optional[str],
    recent_turns: list[Turn],
    current_user: str,
    current_assistant: str,
) -> str:
    rsp = await openai_client.get().chat.completions.create(
        model=settings().GEN_MODEL,
        temperature=0.2,
        max_tokens=200,
        messages=[
            {"role": "system", "content": COMPACTION_SYSTEM_PROMPT},
            {"role": "user", "content": _build_user(
                prior_summary, recent_turns, current_user, current_assistant
            )},
        ],
    )
    return (rsp.choices[0].message.content or "").strip()
