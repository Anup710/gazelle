// Thin MediaRecorder wrapper. Returns a handle with .stop() that resolves to a Blob.

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4", // Safari
];

export function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c)) || "";
}

export async function startRecording() {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = pickMime();
  const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  const chunks = [];
  mr.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
  mr.start();

  return {
    mimeType: mr.mimeType || "audio/webm",
    stop: () =>
      new Promise((resolve) => {
        mr.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: mr.mimeType || "audio/webm" }));
        };
        try {
          mr.stop();
        } catch {
          // already stopped — resolve with whatever we have
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: mr.mimeType || "audio/webm" }));
        }
      }),
  };
}

export function filenameForMime(mime) {
  if (!mime) return "voice.webm";
  if (mime.includes("mp4")) return "voice.mp4";
  if (mime.includes("webm")) return "voice.webm";
  if (mime.includes("ogg")) return "voice.ogg";
  return "voice.webm";
}
