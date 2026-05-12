"""GET /sessions/{session_id}/messages — hydrate a session's chat history.

Used by the FE on session-switch and after a refresh. Stateless: reads
`jobs` for the compaction mirror (conversation_summary, turn_count) and
`messages` for the per-turn rows, in one round-trip from the client's POV.
"""

from fastapi import APIRouter

from ..core.errors import AppError
from ..db import jobs_repo, messages_repo
from ..schemas.messages import MessagesListResponse, PersistedMessage

router = APIRouter()


@router.get("/sessions/{session_id}/messages", response_model=MessagesListResponse)
async def list_session_messages(session_id: str) -> MessagesListResponse:
    job = jobs_repo.get_job(session_id)
    if not job:
        raise AppError("invalid_session", "This session is no longer available.", 404)
    rows = messages_repo.list_messages(session_id)
    return MessagesListResponse(
        messages=[
            PersistedMessage(
                id=str(r["id"]),
                role=r["role"],
                content=r["content"],
                citations=r.get("citations") or [],
                language=r.get("language"),
                created_at=str(r["created_at"]),
            )
            for r in rows
        ],
        conversation_summary=job.get("conversation_summary"),
        turn_count=int(job.get("turn_count") or 0),
    )
