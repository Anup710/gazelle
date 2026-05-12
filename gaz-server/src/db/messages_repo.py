"""All reads/writes against the `messages` table.

Mirrors `jobs_repo` — plain functions, dict in / dict out. supabase-py is
synchronous; callers in async handlers invoke these directly (calls are
single-row inserts / short-list selects, well below the threshold where
offloading to a threadpool would matter).

Schema source of truth: plan/hosting/hosting.md §6.2.
"""

from typing import Optional

from ..clients import supabase_client

TABLE = "messages"


def insert_message(
    session_id: str,
    role: str,
    content: str,
    citations: Optional[list[dict]] = None,
    language: Optional[str] = None,
) -> dict:
    """Insert one user-or-assistant turn. Returns the inserted row.

    `citations` defaults to `[]` (table-level default also enforces this).
    `language` is the ISO-style label we use elsewhere ("english"/"hindi"/
    "hinglish"); nullable because user-turn rows do not carry one.
    """
    payload: dict = {
        "session_id": session_id,
        "role": role,
        "content": content,
        "citations": citations if citations is not None else [],
    }
    if language is not None:
        payload["language"] = language
    res = supabase_client.get().table(TABLE).insert(payload).execute()
    rows = res.data or []
    if not rows:
        raise RuntimeError("Supabase insert returned no rows")
    return rows[0]


def list_messages(session_id: str) -> list[dict]:
    """Return all messages for a session, oldest first."""
    res = (
        supabase_client.get()
        .table(TABLE)
        .select("id,role,content,citations,language,created_at")
        .eq("session_id", session_id)
        .order("created_at", desc=False)
        .execute()
    )
    return res.data or []
