import { request } from "./client.js";

// → { sessions: Session[] }
// Session = { job_id, title, source_type, status, created_at }
export const listSessions = () => request("/sessions");
