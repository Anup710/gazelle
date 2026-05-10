import { request } from "./client.js";

// → { sessions: Session[] }
// Session = { job_id, title, source_type, status, archived, created_at,
//             duration_seconds, detected_language }
export const listSessions = () => request("/sessions");
