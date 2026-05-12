import { request } from "./client.js";

// → {
//     messages: [{ id, role: "user"|"assistant", content, citations: [...], language, created_at }],
//     conversation_summary: string | null,
//     turn_count: number,
//   }
// Returned in created_at ascending order. Used to hydrate a session on
// session-switch / refresh; live state on /rag/query is otherwise unchanged.
export const listMessages = (sid) => request(`/sessions/${sid}/messages`);
