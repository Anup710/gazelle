import { request } from "./client.js";

// All three resolve to: { job_id: string, status: "pending" }

export const ingestYoutube = (url) =>
  request("/ingest/youtube", { method: "POST", body: { url } });

export const ingestUpload = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return request("/ingest/upload", { method: "POST", body: fd });
};

export const ingestText = (text) =>
  request("/ingest/text", { method: "POST", body: { text } });
