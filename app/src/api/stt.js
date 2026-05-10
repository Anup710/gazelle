import { request } from "./client.js";

// → { text: string }
export const transcribeVoice = (audioBlob, filename = "voice.webm") => {
  const fd = new FormData();
  fd.append("audio", audioBlob, filename);
  return request("/stt", { method: "POST", body: fd });
};
