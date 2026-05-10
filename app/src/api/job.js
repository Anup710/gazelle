import { request } from "./client.js";

// Response shape varies by status:
//   pending|transcribing|validating|embedding: { job_id, status, source_type, title, archived, created_at }
//   ready: + { source, detected_language, duration_seconds }
//   failed: + { failure_reason, error_message }
//     failure_reason ∈ "non_educational" | "transcription_failed" | "embedding_failed" | "invalid_input" | "unknown"
export const getJob = (jobId) => request(`/job/${jobId}`);

// Toggle archived flag. Returns the updated JobView.
export const archiveJob = (jobId, archived) =>
  request(`/job/${jobId}/archive`, { method: "PATCH", body: { archived } });

// Hard-delete a session. Removes Supabase row + cleans Qdrant points.
// Returns 204 No Content (the Response object); the caller doesn't need the body.
export const deleteJob = (jobId) =>
  request(`/job/${jobId}`, { method: "DELETE" });
