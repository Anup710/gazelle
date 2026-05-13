import { request } from "./client.js";

const VALID = new Set(["english", "hindi", "hinglish"]);

function ttsLangParam(lang) {
  const l = (lang || "").toLowerCase();
  return VALID.has(l) ? l : "english";
}

// Crude LaTeX → speakable plaintext. The LLM wraps math in \(...\) inline
// and \[...\] display per the system prompt; without this, TTS would read
// "backslash frac open brace a close brace" verbatim.
export function stripLatex(text) {
  if (!text) return text;
  return text
    .replace(/\$\$([\s\S]*?)\$\$/g, " $1 ")
    .replace(/\$([^$\n]+)\$/g, " $1 ")
    .replace(/\\\[([\s\S]*?)\\\]/g, " $1 ")
    .replace(/\\\(([\s\S]*?)\\\)/g, " $1 ")
    .replace(/\\([$%&_#{}])/g, "$1")
    .replace(/\\[a-zA-Z]+\*?/g, " ")
    .replace(/[{}^_&]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Returns an object URL the caller must URL.revokeObjectURL when done.
export async function synthesizeTTS({ text, language }) {
  const res = await request("/tts", {
    method: "POST",
    body: { text: stripLatex(text), language: ttsLangParam(language) },
  });
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
