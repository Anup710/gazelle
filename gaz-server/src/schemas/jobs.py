from typing import Literal, Optional

from pydantic import BaseModel

JobStatus = Literal[
    "pending", "transcribing", "validating", "embedding", "ready", "failed"
]
SourceType = Literal["youtube", "upload", "transcript"]
FailureReason = Literal[
    "non_educational",
    "transcription_failed",
    "embedding_failed",
    "invalid_input",
    "unknown",
]


class JobView(BaseModel):
    """Returned by GET /job/{id}. Fields are populated based on `status`."""

    job_id: str
    status: JobStatus
    source_type: SourceType
    title: Optional[str] = None
    source: Optional[str] = None
    detected_language: Optional[str] = None
    duration_seconds: Optional[int] = None
    failure_reason: Optional[FailureReason] = None
    error_message: Optional[str] = None
    archived: bool = False
    created_at: str


class SessionRow(BaseModel):
    """Returned by GET /sessions (one per row)."""

    job_id: str
    title: Optional[str]
    source_type: SourceType
    source: Optional[str] = None
    status: JobStatus
    archived: bool = False
    created_at: str
    # Wall-clock of the last server-side write — reflects chat activity once
    # /rag/query starts mirroring turns into Supabase. Falls back to
    # `created_at` on the FE for sessions that haven't been chatted with yet.
    last_activity_at: Optional[str] = None
    duration_seconds: Optional[int] = None
    detected_language: Optional[str] = None


class SessionsResponse(BaseModel):
    sessions: list[SessionRow]


class ArchiveRequest(BaseModel):
    archived: bool
