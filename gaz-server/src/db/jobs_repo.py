"""All reads/writes against the `jobs` table.

Plain functions, no class — supabase-py returns dicts and we keep that shape.
Schema source of truth: plan/hosting/hosting.md §6.2.
"""

from typing import Optional

from ..clients import supabase_client

TABLE = "jobs"


def create_job(source_type: str, source: Optional[str], title: Optional[str]) -> str:
    payload = {
        "status": "pending",
        "source_type": source_type,
        "source": source,
        "title": title,
    }
    res = supabase_client.get().table(TABLE).insert(payload).execute()
    rows = res.data or []
    if not rows:
        raise RuntimeError("Supabase insert returned no rows")
    return rows[0]["id"]


def get_job(job_id: str) -> Optional[dict]:
    res = (
        supabase_client.get()
        .table(TABLE)
        .select("*")
        .eq("id", job_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def list_sessions() -> list[dict]:
    res = (
        supabase_client.get()
        .table(TABLE)
        .select("id,title,source_type,status,created_at")
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


def set_status(job_id: str, status: str) -> None:
    supabase_client.get().table(TABLE).update({"status": status}).eq("id", job_id).execute()


def save_transcript(
    job_id: str,
    transcript_json: dict,
    full_text: str,
    detected_language: str,
    duration_seconds: Optional[int],
    used_native_captions: Optional[bool],
    title: Optional[str],
) -> None:
    update = {
        "transcript_json": transcript_json,
        "full_text": full_text,
        "detected_language": detected_language,
        "duration_seconds": duration_seconds,
        "used_native_captions": used_native_captions,
    }
    if title is not None:
        update["title"] = title
    supabase_client.get().table(TABLE).update(update).eq("id", job_id).execute()


def save_validation(job_id: str, result: dict) -> None:
    supabase_client.get().table(TABLE).update({"validation_result": result}).eq("id", job_id).execute()


def mark_failed(job_id: str, failure_reason: str, error_message: str) -> None:
    supabase_client.get().table(TABLE).update(
        {
            "status": "failed",
            "failure_reason": failure_reason,
            "error_message": error_message,
        }
    ).eq("id", job_id).execute()
