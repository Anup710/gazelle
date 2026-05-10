from fastapi import APIRouter

from ..core.errors import AppError
from ..db import jobs_repo
from ..schemas.jobs import JobView

router = APIRouter()


@router.get("/job/{job_id}", response_model=JobView)
async def get_job(job_id: str) -> JobView:
    row = jobs_repo.get_job(job_id)
    if not row:
        raise AppError("invalid_session", "This session is no longer available.", 404)

    return JobView(
        job_id=row["id"],
        status=row["status"],
        source_type=row["source_type"],
        title=row.get("title"),
        source=row.get("source"),
        detected_language=row.get("detected_language"),
        duration_seconds=row.get("duration_seconds"),
        failure_reason=row.get("failure_reason"),
        error_message=row.get("error_message"),
        created_at=str(row["created_at"]),
    )
