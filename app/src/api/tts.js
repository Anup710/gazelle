import { request } from "./client.js";

// Server expects "en" or "hi" — map from rag/query language values.
function ttsLangParam(lang) {
  if (!lang) return "en";
  const l = lang.toLowerCase();
  if (l === "english") return "en";
  if (l === "hindi" || l === "hinglish") return "hi";
  return "en";
}

// Returns an object URL the caller must URL.revokeObjectURL when done.
export async function synthesizeTTS({ text, language }) {
  const res = await request("/tts", {
    method: "POST",
    body: { text, language: ttsLangParam(language) },
  });
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
