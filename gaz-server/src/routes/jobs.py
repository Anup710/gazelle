from fastapi import APIRouter, Response

from ..clients import qdrant_client
from ..core.errors import AppError
from ..db import jobs_repo
from ..schemas.jobs import ArchiveRequest, JobView

router = APIRouter()


def _to_view(row: dict) -> JobView:
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
        archived=bool(row.get("archived", False)),
        created_at=str(row["created_at"]),
    )


@router.get("/job/{job_id}", response_model=JobView)
async def get_job(job_id: str) -> JobView:
    row = jobs_repo.get_job(job_id)
    if not row:
        raise AppError("invalid_session", "This session is no longer available.", 404)
    return _to_view(row)


@router.patch("/job/{job_id}/archive", response_model=JobView)
async def archive_job(job_id: str, body: ArchiveRequest) -> JobView:
    existing = jobs_repo.get_job(job_id)
    if not existing:
        raise AppError("invalid_session", "This session is no longer available.", 404)
    updated = jobs_repo.set_archived(job_id, body.archived)
    return _to_view(updated or {**existing, "archived": body.archived})


@router.delete("/job/{job_id}", status_code=204)
async def delete_job(job_id: str) -> Response:
    existing = jobs_repo.get_job(job_id)
    if not existing:
        raise AppError("invalid_session", "This session is no longer available.", 404)
    # Always cleanup Qdrant — idempotent, safe even if no points exist.
    qdrant_client.delete_by_session(job_id)
    jobs_repo.delete_job(job_id)
    return Response(status_code=204)
