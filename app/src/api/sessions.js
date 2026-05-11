import { request } from "./client.js";

// → { sessions: Session[] }
// Session = { job_id, title, source_type, source, status, archived, created_at,
//             duration_seconds, detected_language }
//   `source` is the canonical YouTube URL for source_type="youtube"
//   (e.g. https://www.youtube.com/watch?v=...), filename for "upload",
//   null for "transcript".
export const listSessions = () => request("/sessions");
