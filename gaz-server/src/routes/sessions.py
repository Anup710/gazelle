from fastapi import APIRouter

from ..db import jobs_repo
from ..schemas.jobs import SessionRow, SessionsResponse

router = APIRouter()


@router.get("/sessions", response_model=SessionsResponse)
async def list_sessions() -> SessionsResponse:
    rows = jobs_repo.list_sessions()
    return SessionsResponse(
        sessions=[
            SessionRow(
                job_id=r["id"],
                title=r.get("title"),
                source_type=r["source_type"],
                source=r.get("source"),
                status=r["status"],
                archived=bool(r.get("archived", False)),
                created_at=str(r["created_at"]),
                duration_seconds=r.get("duration_seconds"),
                detected_language=r.get("detected_language"),
            )
            for r in rows
        ]
    )
