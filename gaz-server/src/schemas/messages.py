from typing import Literal, Optional

from pydantic import BaseModel

from .rag import Citation, Language


class PersistedMessage(BaseModel):
    """One row from the `messages` table, as returned by the hydrate endpoint."""

    id: str
    role: Literal["user", "assistant"]
    content: str
    citations: list[Citation] = []
    language: Optional[Language] = None
    created_at: str


class MessagesListResponse(BaseModel):
    """Payload for GET /sessions/{session_id}/messages.

    `conversation_summary` and `turn_count` come from the `jobs` row so the
    client can rebuild its two-tier history (recent_turns + summary) without
    a second request.
    """

    messages: list[PersistedMessage]
    conversation_summary: Optional[str] = None
    turn_count: int = 0
