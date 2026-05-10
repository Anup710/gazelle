import { request } from "./client.js";

// turn_count = number of USER turns in this session BEFORE the current one (0 on first query).
// Server uses (turn_count + 1) % 4 === 0 to decide compaction; cannot infer from recent_turns alone
// because that array is capped at 4 turns.
//
// → {
//     response: { text: string, language: "english"|"hindi"|"hinglish" },
//     conversation_summary: string | null,    // only on every-4th turn
//     citations: [{ chunk_id, text, timestamp_start, timestamp_end, relevance_score, speaker_set }]
//   }
export const ragQuery = ({ session_id, query_text, turn_count, conversation_summary, recent_turns }) =>
  request("/rag/query", {
    method: "POST",
    body: { session_id, query_text, turn_count, conversation_summary, recent_turns },
  });
