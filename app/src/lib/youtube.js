// Mirrors gaz-server/src/utils/youtube_url.py — accepts the same two URL shapes
// the BE accepts at ingest time, so anything stored in `jobs.source` parses here.

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function extractVideoId(url) {
  if (!url || typeof url !== "string") return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = (parsed.hostname || "").toLowerCase();
  if (host === "www.youtube.com" || host === "youtube.com") {
    if (parsed.pathname !== "/watch") return null;
    const v = parsed.searchParams.get("v");
    return v && VIDEO_ID_RE.test(v) ? v : null;
  }
  if (host === "youtu.be") {
    const v = parsed.pathname.replace(/^\//, "");
    return VIDEO_ID_RE.test(v) ? v : null;
  }
  return null;
}

export const embedUrl = (videoId) =>
  `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;

export const thumbnailUrl = (videoId) =>
  `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

export const watchUrl = (videoId) =>
  `https://www.youtube.com/watch?v=${videoId}`;
