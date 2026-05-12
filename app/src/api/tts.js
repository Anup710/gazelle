import { request } from "./client.js";

const VALID = new Set(["english", "hindi", "hinglish"]);

function ttsLangParam(lang) {
  const l = (lang || "").toLowerCase();
  return VALID.has(l) ? l : "english";
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
