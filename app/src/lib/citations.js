import { formatSeconds } from "./format.js";

// "Eigenvectors are special [1]. They satisfy A·v=λv [2]."
// → ["Eigenvectors are special ", { cite: 1 }, ". They satisfy A·v=λv ", { cite: 2 }, "."]
// The negative lookbehind on \\ keeps escaped LaTeX display math like
// \[42\] from being misread as a citation #42 (the LLM may emit purely
// numeric display math).
export function tokenizeWithCitations(text) {
  if (!text) return [];
  const parts = [];
  const re = /(?<!\\)\[(\d+)\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ cite: parseInt(m[1], 10) });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// Backend citation → popover-friendly shape used by CitationPopover.
// Backend: { chunk_id, text, timestamp_start, timestamp_end, relevance_score, speaker_set }
// UI:      { id, text, ts: "mm:ss – mm:ss", relevance: 0.0–1.0, speaker_set }
// Citations are positionally numbered in the order returned (1-indexed).
export function adaptCitation(c, idx) {
  return {
    id: idx + 1,
    text: c.text,
    ts: `${formatSeconds(c.timestamp_start)} – ${formatSeconds(c.timestamp_end)}`,
    relevance: c.relevance_score,
    speaker_set: c.speaker_set || [],
  };
}
