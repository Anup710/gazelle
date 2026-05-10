const BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function request(path, { method = "GET", body, headers, signal } = {}) {
  const isForm = body instanceof FormData;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: isForm ? headers : { "Content-Type": "application/json", ...headers },
      body: isForm ? body : body != null ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new ApiError("network_error", "Connection issue. Check your network and retry.", 0);
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    const err = payload.error || {};
    throw new ApiError(err.code || "unknown", err.message || res.statusText, res.status);
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res; // caller handles non-JSON (TTS streams audio/mpeg)
}

export const apiBaseUrl = BASE;
