// Two-tier client-managed history per session.
//
// On every /rag/query the client sends:
//   - conversation_summary: persists across requests; replaced when server returns a new one
//   - recent_turns:         capped at last RECENT_TURN_COUNT turns (= 2 * RECENT_TURN_COUNT messages)
//   - turn_count:           derived per-request from messagesBySession (NOT stored here)
//
// The backend decides compaction cadence via (turn_count + 1) % COMPACTION_INTERVAL === 0.
// This works reliably past turn 4 because turn_count is derived from the full message log,
// not from the truncated recent_turns array.

export const COMPACTION_INTERVAL = 4;
export const RECENT_TURN_COUNT = 4;
const MAX_RECENT_MESSAGES = RECENT_TURN_COUNT * 2;

export function updateHistory(historyBySession, sid, userText, assistantText, newSummary) {
  const cur = historyBySession[sid] || { conversation_summary: null, recent_turns: [] };
  const nextTurns = [
    ...cur.recent_turns,
    { role: "user", content: userText },
    { role: "assistant", content: assistantText },
  ].slice(-MAX_RECENT_MESSAGES);

  const conversation_summary = newSummary != null ? newSummary : cur.conversation_summary;

  return { ...historyBySession, [sid]: { conversation_summary, recent_turns: nextTurns } };
}

// Build the `recent_turns` array the server expects from a hydrated message
// list. Mirrors the truncation rule applied by `updateHistory` after every
// turn, so a refresh-and-send produces the same payload as a fresh send
// would have. `messages` items use the frontend shape ({ role, text } for
// users, { role, responseText } for assistants — see App.jsx).
export function deriveRecentTurns(messages) {
  return messages.slice(-MAX_RECENT_MESSAGES).map((m) => ({
    role: m.role,
    content: m.role === "user" ? m.text : m.responseText,
  }));
}
