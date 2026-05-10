# Gazelle Frontend — Implementation Plan

> **Audience:** any developer or AI agent implementing the Gazelle web frontend.
> **Strategy:** **Port, don't rewrite.** The prototype in `web-ui/project/` is the canonical visual + interaction design and is already structurally aligned with the V1 spec. This plan tells you exactly how to lift it into a deployable Vite project, swap mock data for the real backend, and close the few spec gaps that the prototype doesn't yet handle.

---

## 0. Read These First (Required Reading)

Read in this order before writing a line of code. Every decision below is rooted in these documents — if anything in this plan ever conflicts with them, the source documents win.

| File | Why |
|---|---|
| `summary.md` | Living source of truth for stack, decisions, status |
| `web-ui/README.md` | Original handoff intent |
| `web-ui/project/Gazelle.html` | Entry point — the design the user wants built |
| `web-ui/project/app.jsx` | Root component, wiring of views, mock seams |
| `web-ui/project/views.jsx` | ProcessingView, CitationPopover, RichText, TTSButton |
| `web-ui/project/chat.jsx` | ChatView + Message components |
| `web-ui/project/components.jsx` | Sidebar, InputView, Icon set |
| `web-ui/project/data.jsx` | All mock data (this is what you replace) |
| `web-ui/project/styles.css` | Theme tokens, component CSS — copy verbatim |
| `plan/05-ui/requirements.md` | Authoritative UI requirements (every screen, every state) |
| `plan/01-transcription/TRD_AI_Tutor_Transcript_Service.md` §11 | Ingest + job + sessions endpoints |
| `plan/03-input-and-RAG/gazelle_stage2_trd.md` (lines 500–610) | `/stt`, `/rag/query`, error schema |
| `plan/04-rendering-and-tts/gazelle_stage3_prd.md` | Canonical response schema (citations include `text`) |
| `plan/04-rendering-and-tts/gazelle_stage3_trd.md` | `/tts` endpoint, language map, 3500-char cap |
| `plan/hosting/hosting.md` | Vercel deployment, env vars |

If a behavior is not in this plan or in the documents above, **ask before inventing it.** The product surface is intentionally narrow for V1.

---

## 1. Goal

Ship a single-page React web app that lets a user:

1. Submit a YouTube URL, upload a video file, or paste a transcript.
2. Watch a job process in the background and auto-transition to chat when ready.
3. Ask text or voice questions about the indexed content.
4. Read grounded answers with inline citations that open a popover showing the **exact source chunk text + timestamps + relevance**.
5. Optionally play back any answer as audio (on-demand TTS).
6. Switch between past sessions in a sidebar; create new sessions at will.

That is the entire scope. Authentication, video playback, streaming, mobile apps, transcript editing, cross-session memory, and analytics are explicitly out of scope (see §15).

---

## 2. Tech Stack & Why

| Choice | Why |
|---|---|
| **Vite + React 18** | Prototype is React 18 already; Vite gives the smallest possible build setup with no framework opinions. Hosting plan calls out Vite by name. |
| **Plain JSX (no TypeScript)** | Prototype is plain JSX. V1 priority is a working demo, not type rigor. JSDoc comments on the API client are sufficient for IDE help. |
| **No state library** | App state fits in `useState` at the App root. Adding Redux/Zustand is overhead with no payoff at this scope. |
| **No CSS framework** | `styles.css` is hand-tuned, themed, and complete. Don't introduce Tailwind/MUI; copy the file as-is. |
| **`fetch` (no Axios)** | One thin wrapper in `src/api/client.js` is enough. |
| **Native `<audio>`** | Stage 3 spec is mp3, browsers handle it. |
| **`MediaRecorder` API** | For voice input. Webm/Opus on Chrome/Firefox, mp4 on Safari — pass the blob through to `/stt` as multipart. |
| **Vercel** | Per `plan/hosting/hosting.md`. |

**Do not introduce:** TypeScript, Tailwind, shadcn/ui, Next.js, Redux, React Query, Zustand, Storybook, Jest. They all cost time and buy nothing for V1.

---

## 3. Target Project Structure

Create a new app at the repo root in `app/` — peer to `plan/`, `web-ui/`, and `gaz-server/` (the backend). Per the monorepo decision in `CLAUDE.md`:

```
gazelle/
  web-ui/       # FROZEN — original prototype, read-only design reference
  app/          # ← this plan builds here
  gaz-server/   # backend (separate plan)
  plan/
```

**`web-ui/` is frozen.** Treat it as a read-only design artifact. Port files into `app/` by copying — never by editing in place or by symlinking. The prototype must remain pristine so it stays comparable as the source of truth for visual + interaction design.

`app/src/` is intentionally not pre-populated — it evolves from the submodules listed below as the port progresses, mirroring how `web-ui/src/` is currently organized in the prototype.

```text
app/
├── index.html                  # equivalent of Gazelle.html, but Vite-style
├── package.json
├── vite.config.js
├── .env.example                # VITE_API_BASE_URL=...
├── public/
│   └── gazelle-logo.jpeg       # copied from web-ui/project/assets/
└── src/
    ├── main.jsx                # ReactDOM.createRoot(...)
    ├── App.jsx                 # ported from web-ui/project/app.jsx (see §6)
    ├── styles.css              # copied verbatim from web-ui/project/styles.css
    ├── components/
    │   ├── Sidebar.jsx         # from components.jsx
    │   ├── SessionItem.jsx     # from components.jsx
    │   ├── InputView.jsx       # from components.jsx
    │   ├── ProcessingView.jsx  # from views.jsx
    │   ├── ChatView.jsx        # from chat.jsx
    │   ├── Message.jsx         # from chat.jsx
    │   ├── CitationPopover.jsx # from views.jsx
    │   ├── TTSButton.jsx       # from views.jsx
    │   ├── RichText.jsx        # from views.jsx
    │   └── Icon.jsx            # from components.jsx
    ├── api/
    │   ├── client.js           # fetch wrapper, base URL, error normalization
    │   ├── ingest.js           # POST /ingest/{youtube|upload|text}
    │   ├── job.js              # GET /job/{id}, polling helper
    │   ├── sessions.js         # GET /sessions
    │   ├── rag.js              # POST /rag/query
    │   ├── stt.js              # POST /stt
    │   └── tts.js              # POST /tts
    ├── lib/
    │   ├── citations.js        # tokenize "[1]"-marked text into RichText parts
    │   ├── conversation.js     # client-side history compaction logic
    │   ├── recorder.js         # MediaRecorder wrapper (start/stop → Blob)
    │   ├── format.js           # formatTimestampRange, formatDuration, relativeDate
    │   └── statusMap.js        # job status enum → UI stage label
    └── hooks/
        ├── useTweaks.js        # ported from tweaks-panel.jsx (theme switcher only)
        └── useJobPolling.js    # interval polling with backoff
```

**Component split rationale:** the prototype's three big files (`components.jsx`, `views.jsx`, `chat.jsx`) bundle multiple components for prototype convenience. Splitting them one-per-file is the only structural change needed.

---

## 4. Migration: From CDN Prototype → Vite

The prototype loads React, ReactDOM, and Babel from `unpkg.com` and uses `<script type="text/babel">` tags. Steps to convert:

1. **Scaffold:**
   ```bash
   npm create vite@latest app -- --template react
   cd app && npm install
   ```
2. **Copy CSS:** drop `web-ui/project/styles.css` into `app/src/styles.css`. Import once in `main.jsx`.
3. **Copy assets:** copy `web-ui/project/assets/gazelle-logo.jpeg` to `app/public/gazelle-logo.jpeg`. Update the `<img src>` in `Sidebar.jsx` to `/gazelle-logo.jpeg`.
4. **Port fonts:** keep the Google Fonts `<link>` tags from `Gazelle.html` in `app/index.html` `<head>`.
5. **Strip `window.X = X` exports.** The prototype uses globals (`window.Icon`, `window.RichText`, etc.) because it has no module system. Replace each with proper `import`/`export`.
6. **Strip the tweaks panel** except the theme switcher. The "demo" buttons (Jump to upload, Reset chat, Load demo conversation) were prototype affordances and should be removed for production.
7. **Drop the Babel CDN scripts.** Vite handles JSX.
8. **Remove `EDITMODE-BEGIN`/`EDITMODE-END` markers** from `App.jsx` — they were used by the design tool, not relevant here.
9. **Confirm parity:** `npm run dev`, hit `http://localhost:5173`, click through every screen in all three themes (Scholar / Studio / Focus). Visual output should be pixel-identical to the prototype.

Only after parity is achieved, begin §6 (API integration).

---

## 5. Environment & Config

### `.env.example`
```env
VITE_API_BASE_URL=http://localhost:8000
```

### `vite.config.js` additions
- No proxy needed in production (Render backend exposes a public URL).
- For local dev, optionally proxy `/api` to `http://localhost:8000` to avoid CORS prompts. Not required.

### Backend CORS expectation
The backend must allow:
- Origin: Vercel preview + production URLs, plus `http://localhost:5173`
- Methods: `GET, POST, OPTIONS`
- Headers: `Content-Type`
- Credentials: not required (no auth in V1)

Flag this back to whoever owns the backend if not already configured.

---

## 6. State Model (App-Level)

All app state lives in `App.jsx` via `useState`. There is no global store.

```js
// App.jsx state shape — verbatim contract for any AI working on this file

const [sessions, setSessions] = useState([]);
// Session[] — { job_id, title, source_type, status, created_at, detected_language?, duration_seconds? }
// Sourced from GET /sessions on mount; mutated when user creates a new session.

const [activeId, setActiveId] = useState(null);
// job_id of currently focused session, or null when on input/empty view.

const [view, setView] = useState("empty");
// "empty" | "input" | "processing" | "chat"

const [pendingJob, setPendingJob] = useState(null);
// { job_id, title, source_type } during processing view; null otherwise.

const [messagesBySession, setMessagesBySession] = useState({});
// { [job_id]: Message[] }
// Message = UserMessage | AssistantMessage
//   UserMessage: { id, role: "user", text }
//   AssistantMessage: { id, role: "assistant", parts, citations, lang }
// `parts` is RichText-tokenized output of citations.js (see §9).

const [historyBySession, setHistoryBySession] = useState({});
// { [job_id]: { conversation_summary: string|null, recent_turns: Turn[] } }
// Turn = { role: "user"|"assistant", content: string }
// See §10 for the exact protocol.

const [thinkingFor, setThinkingFor] = useState(null);
// job_id while a /rag/query call is in flight; null otherwise.

const [openCitation, setOpenCitation] = useState(null);
// { id, text, ts, relevance, speaker_set } when popover is open; null otherwise.

const [toast, setToast] = useState(null);
// { kind: "error"|"info", message: string } — auto-dismiss after 4s.

const [theme, setTheme] = useState("scholar");
// "scholar" | "studio" | "focus" — drives className on root div.
```

Persistence: **none**. Everything resets on refresh except the session list (which is rehydrated from `GET /sessions`). This is a deliberate V1 simplification per `summary.md`.

---

## 7. API Client Layer

### `src/api/client.js`
```js
const BASE = import.meta.env.VITE_API_BASE_URL;

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function request(path, { method = "GET", body, headers, signal } = {}) {
  const isForm = body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: isForm ? headers : { "Content-Type": "application/json", ...headers },
    body: isForm ? body : body != null ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    const err = payload.error || {};
    throw new ApiError(err.code || "unknown", err.message || res.statusText, res.status);
  }
  // Some endpoints (TTS) return audio/mpeg, not JSON.
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res; // caller handles non-JSON
}
```

### `src/api/ingest.js`
```js
import { request } from "./client";

export const ingestYoutube = (url) =>
  request("/ingest/youtube", { method: "POST", body: { url } });

export const ingestUpload = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return request("/ingest/upload", { method: "POST", body: fd });
};

export const ingestText = (text) =>
  request("/ingest/text", { method: "POST", body: { text } });

// All three resolve to: { job_id: string, status: "pending" }
```

### `src/api/job.js`
```js
import { request } from "./client";

export const getJob = (jobId) => request(`/job/${jobId}`);

// Response shape varies by status — see TRD §348:
//   pending|transcribing|validating|embedding: { job_id, status, source_type, title, created_at }
//   ready: + { source, detected_language, duration_seconds }
//   failed: + { failure_reason, error_message }
//     failure_reason ∈ "non_educational" | "transcription_failed" | "embedding_failed" | "invalid_input" | "unknown"
```

### `src/api/sessions.js`
```js
import { request } from "./client";

export const listSessions = () => request("/sessions");
// → { sessions: Session[] }
```

### `src/api/rag.js`
```js
import { request } from "./client";

export const ragQuery = ({ session_id, query_text, turn_count, conversation_summary, recent_turns }) =>
  request("/rag/query", {
    method: "POST",
    body: { session_id, query_text, turn_count, conversation_summary, recent_turns },
  });

// turn_count = number of USER turns in this session BEFORE the current one (0 on first query).
// The backend uses this to decide compaction cadence; it cannot infer turn position from
// recent_turns alone because that array is capped at 4 turns.
//
// → {
//     response: { text: string, language: "english"|"hindi"|"hinglish" },
//     conversation_summary: string | null,  // only on every-4th turn
//     citations: [{ chunk_id, text, timestamp_start, timestamp_end, relevance_score, speaker_set }]
//   }
```

### `src/api/stt.js`
```js
import { request } from "./client";

export const transcribeVoice = (audioBlob) => {
  const fd = new FormData();
  fd.append("audio", audioBlob, "voice.webm");
  return request("/stt", { method: "POST", body: fd });
};
// → { text: string }
```

### `src/api/tts.js`
```js
import { request } from "./client";

export async function synthesizeTTS({ text, language }) {
  const res = await request("/tts", {
    method: "POST",
    body: { text, language: ttsLangParam(language) },
  });
  const blob = await res.blob();
  return URL.createObjectURL(blob); // caller must URL.revokeObjectURL when done
}

function ttsLangParam(lang) {
  // Per Stage 3 TRD language map.
  if (lang === "english") return "en";
  if (lang === "hindi" || lang === "hinglish") return "hi";
  return "en";
}
```

---

## 8. The Six Mock Seams (Detailed Replacement Spec)

Every seam below has the exact prototype location, the replacement behavior, and the resulting state mutation.

### Seam 1 — Session list bootstrap
**Prototype:** `data.jsx:3` `SAMPLE_SESSIONS`, consumed by `app.jsx:12`.
**Replacement:** in `App.jsx`, on mount:
```js
useEffect(() => {
  listSessions()
    .then(({ sessions }) => setSessions(sessions))
    .catch(() => setToast({ kind: "error", message: "Couldn't load your sessions." }));
}, []);
```
**Empty state:** if `sessions.length === 0` and `view === "empty"`, render the existing empty-thread block with copy: *"Upload a video or paste a transcript to get started."* (per requirements §7).

### Seam 2 — Submit input → start ingest
**Prototype:** `app.jsx:33` `handleSubmitInput`.
**Replacement:**
```js
const handleSubmitInput = async ({ source, payload, title }) => {
  let res;
  try {
    if (source === "youtube") res = await ingestYoutube(payload.url);
    else if (source === "upload") res = await ingestUpload(payload.file);
    else res = await ingestText(payload.text);
  } catch (e) {
    setToast({ kind: "error", message: humanizeError(e) });
    return;
  }
  const newSession = {
    job_id: res.job_id,
    title,                    // optimistic; replaced on poll completion
    source_type: source,
    status: "pending",
    created_at: new Date().toISOString(),
  };
  setSessions(prev => [newSession, ...prev]);
  setMessagesBySession(m => ({ ...m, [res.job_id]: [] }));
  setHistoryBySession(h => ({ ...h, [res.job_id]: { conversation_summary: null, recent_turns: [] } }));
  setActiveId(res.job_id);
  setPendingJob(newSession);
  setView("processing");
};
```
**InputView contract change:** the prototype's `onSubmit({ source, title })` must now also return the raw payload (`{ url }`, `{ file }`, or `{ text }`). Update `InputView.jsx` accordingly.

### Seam 3 — Job polling (replaces fake timer)
**Prototype:** `views.jsx:10–26` uses `requestAnimationFrame` over a fixed 7.2-second timer.
**Replacement:** poll `GET /job/{id}` every **2 seconds** until status is `ready` or `failed`. No exponential backoff in V1 — most jobs finish under 60s.

```js
// hooks/useJobPolling.js
export function useJobPolling(jobId, onReady, onFailed) {
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const job = await getJob(jobId);
        if (cancelled) return;
        if (job.status === "ready") return onReady(job);
        if (job.status === "failed") return onFailed(job);
        // Update UI stage indicator via job.status.
        onProgress?.(job);
      } catch {
        // Transient network error — keep polling.
      }
      setTimeout(tick, 2000);
    };
    tick();
    return () => { cancelled = true; };
  }, [jobId]);
}
```

**Status-to-UI-stage mapping** (`lib/statusMap.js`):
```js
export const STATUS_TO_STAGE_INDEX = {
  pending: 0,
  transcribing: 0,    // "Extracting transcript"
  validating: 1,      // "Building knowledge base" (content gate phase)
  embedding: 2,       // "Creating search index"
  ready: 3,           // "Ready for questions"
  failed: -1,
};
```
The prototype's 4-stage UI labels (`PROCESSING_STAGES` in `data.jsx:93`) stay as-is. Map the backend enum onto them; do not rename the labels.

**On `ready`:**
- Refetch the session via `getJob` to populate `detected_language`, `duration_seconds`, `title` (the backend may rename the optimistic title).
- Update `sessions` array with the enriched session.
- `setView("chat")` and clear `pendingJob`.

**On `failed`:**
- Render an inline error in `ProcessingView` with the spec copy: *"Could not process this video. Please try another."* and an action button labeled "Try a different input" that navigates back to `InputView` and removes the failed session from the sidebar.

### Seam 4 — Send query → RAG
**Prototype:** `app.jsx:58` `handleSend` with `setTimeout(MOCK_REPLIES)`.
**Replacement:**
```js
const handleSend = async (text) => {
  const sid = activeId;
  if (!sid) return;
  const userMsg = { id: `u_${Date.now()}`, role: "user", text };
  setMessagesBySession(m => ({ ...m, [sid]: [...(m[sid] || []), userMsg] }));
  setThinkingFor(sid);

  // turn_count = user turns in this session BEFORE this one (so 0 on first query).
  const turn_count = (messagesBySession[sid] || []).filter(m => m.role === "user").length;
  const { conversation_summary, recent_turns } = historyBySession[sid] || { conversation_summary: null, recent_turns: [] };

  let res;
  try {
    res = await ragQuery({ session_id: sid, query_text: text, turn_count, conversation_summary, recent_turns });
  } catch (e) {
    setThinkingFor(null);
    setToast({ kind: "error", message: humanizeError(e) });
    return;
  }

  const asstMsg = {
    id: `a_${Date.now()}`,
    role: "assistant",
    responseText: res.response.text,                     // raw text — TTS reads this (§8 Seam 6)
    parts: tokenizeWithCitations(res.response.text),     // see §9
    citations: res.citations.map(adaptCitation),         // see §9
    lang: capitalize(res.response.language),             // "English"|"Hindi"|"Hinglish"
  };
  setMessagesBySession(m => ({ ...m, [sid]: [...(m[sid] || []), asstMsg] }));
  setHistoryBySession(h => updateHistory(h, sid, text, res.response.text, res.conversation_summary));
  setThinkingFor(null);
};
```

### Seam 5 — Voice input (mic button)
**Prototype:** `chat.jsx:32` `toggleRec` simulates with `setTimeout`.
**Replacement:**
```js
// lib/recorder.js
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mr = new MediaRecorder(stream, { mimeType: pickMime() });
  const chunks = [];
  mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  mr.start();
  return {
    stop: () => new Promise(resolve => {
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        resolve(new Blob(chunks, { type: mr.mimeType }));
      };
      mr.stop();
    }),
  };
}
function pickMime() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find(c => MediaRecorder.isTypeSupported(c)) || "";
}
```
**ChatView wiring:** replace `toggleRec` with real start/stop. After stop, call `transcribeVoice(blob)` → `{ text }` → set into the textarea (do not auto-send; let the user review and press Enter).

**Auto-stop:** keep the 8-second auto-stop ceiling from the prototype's UX (slightly longer than the 3.5s prototype value to account for real speech).

**Failure copy:** *"Couldn't capture audio. Please type your question."* (per requirements §7).

### Seam 6 — TTS playback
**Prototype:** `views.jsx:128` `TTSButton.start` simulates with `setTimeout`.
**Replacement:**
```js
const start = async () => {
  setTtsState(s => ({ ...s, [messageId]: { status: "loading" } }));
  let url;
  try {
    url = await synthesizeTTS({ text: message.responseText, language: message.lang.toLowerCase() });
  } catch {
    setTtsState(s => ({ ...s, [messageId]: { status: "error" } }));
    return;
  }
  const audio = new Audio(url);
  audio.onended = () => {
    URL.revokeObjectURL(url);
    setTtsState(s => ({ ...s, [messageId]: { status: "idle" } }));
  };
  audio.ontimeupdate = () => {
    const pct = audio.duration ? audio.currentTime / audio.duration : 0;
    setTtsState(s => ({ ...s, [messageId]: { status: "playing", pct, audio } }));
  };
  audio.play();
  setTtsState(s => ({ ...s, [messageId]: { status: "playing", pct: 0, audio } }));
};
const stop = () => {
  const cur = ttsState[messageId];
  if (cur?.audio) { cur.audio.pause(); URL.revokeObjectURL(cur.audio.src); }
  setTtsState(s => ({ ...s, [messageId]: { status: "idle" } }));
};
```

**Truncation notice:** if `message.responseText.length > 3500`, render a small italic note under the button: *"Audio truncated to the last complete paragraph that fit (3,500-character cap)."* The backend silently truncates per Stage 3 TRD line 152 — the user just needs to know.

**Note on `message.responseText`:** add this field when constructing assistant messages — it's the raw `res.response.text` string, kept alongside the tokenized `parts`. TTS uses raw text, not tokens.

**Error copy:** *"Unable to generate audio. Please try again."* — the existing `error` state in the button already handles the visual; just wire the copy in.

---

## 9. Citation Tokenizer

The backend returns `response.text` as a plain string with numeric citation markers like `[1]`, `[2]`. The prototype's `RichText` expects a pre-tokenized array of strings interleaved with `{ cite: N }` objects. Bridge them:

```js
// lib/citations.js

// Convert "Eigenvectors are special [1]. They satisfy A·v=λv [2]."
// into ["Eigenvectors are special ", { cite: 1 }, ". They satisfy A·v=λv ", { cite: 2 }, "."]
export function tokenizeWithCitations(text) {
  const parts = [];
  const re = /\[(\d+)\]/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ cite: parseInt(m[1], 10) });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// Adapt backend citation → popover-friendly shape used by CitationPopover.
//   Backend: { chunk_id, text, timestamp_start, timestamp_end, relevance_score, speaker_set }
//   UI:      { id, text, ts: "mm:ss – mm:ss", relevance: 0.0–1.0, speaker_set }
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

function formatSeconds(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}
```

**Backend prompt instruction (sanity check, not an action item):** confirm with backend that the LLM is told to emit `[N]` markers inline and that citation N corresponds to the Nth element in the returned `citations[]`. This is implied by Stage 2 TRD §340 but worth a sentence in the system prompt.

**Citation popover update:** the prototype already shows `text`, `ts`, and `relevance` — confirm `CitationPopover.jsx` reads from the adapted shape above. Add a subtle `speaker_set` chip if the array is non-empty (e.g., "Speaker · Instructor"). If empty, omit silently.

---

## 10. Conversation History Protocol (Client-Side)

The backend is stateless. The client maintains, **per session**, a `{ conversation_summary, recent_turns }` object and sends it with every `/rag/query` call. It also sends a `turn_count` (computed at send time, not stored) so the backend can decide when to compact.

```js
// lib/conversation.js

const COMPACTION_INTERVAL = 4;   // matches backend (gazelle_stage2_trd.md:227)
const RECENT_TURN_COUNT = 4;     // last 4 turns = up to 8 messages

export function updateHistory(historyBySession, sid, userText, assistantText, newSummary) {
  const cur = historyBySession[sid] || { conversation_summary: null, recent_turns: [] };
  const nextTurns = [...cur.recent_turns,
    { role: "user", content: userText },
    { role: "assistant", content: assistantText },
  ].slice(-RECENT_TURN_COUNT * 2);   // cap at 8 messages

  // Backend returns a fresh summary on every 4th turn; we just store whatever it sends.
  const conversation_summary = newSummary != null ? newSummary : cur.conversation_summary;

  return { ...historyBySession, [sid]: { conversation_summary, recent_turns: nextTurns } };
}
```

**`turn_count` is not stored** — it's derived per-request from the message log:

```js
const turn_count = (messagesBySession[sid] || []).filter(m => m.role === "user").length;
```

This is the count of user turns **before** the current one (so 0 on the very first query, 3 right before the 4th query, etc.). The backend uses `(turn_count + 1) % 4 === 0` to decide compaction — this works reliably past turn 4 even though `recent_turns` is capped, because the count is derived from the full message log on the client.

**Important:** the client does **not** decide when to compact — the backend does that and returns a fresh summary on its own cadence (`null` on non-compaction turns). The client's only responsibility is to send `turn_count`, persist whatever summary it receives, and echo it back next request.

**On session switch:** load the per-session history from `historyBySession[id]`. If absent (e.g., first time viewing a session loaded from `GET /sessions`), initialize to `{ conversation_summary: null, recent_turns: [] }` — V1 acceptance is that page refresh loses chat history but sidebar still shows the session. `turn_count` derives from `messagesBySession[id]`, which is also empty after refresh — so the cycle restarts cleanly.

---

## 11. Error Handling Matrix

The backend's error envelope (per `gazelle_stage2_trd.md:594`):
```json
{ "error": { "code": "...", "message": "..." } }
```

| Error code | HTTP | UI behavior |
|---|---|---|
| `invalid_session` | 404 | Toast: *"This session is no longer available."* Remove from sidebar. |
| `insufficient_context` | 200 | Render the response text as a normal assistant bubble — the refusal IS the answer. No special UI. |
| `stt_failed` | 500 | Toast: *"Couldn't capture audio. Please type your question."* |
| `generation_failed` | 500 | Toast: *"Something went wrong. Please try again."* Leave the user message in place. |
| `invalid_input` | 400 | Inline alert in the relevant input control. |
| Network error / timeout | — | Toast: *"Connection issue. Check your network and retry."* |
| `unknown` (fallback) | any | Toast: generic "Something went wrong." |

**Client-side validation errors** (before submission) use the inline `<div className="alert error">` pattern already in `InputView.jsx:182`. Required messages (per requirements §1):

| Trigger | Message |
|---|---|
| Empty / invalid YouTube URL | "Please enter a valid YouTube link" |
| Unsupported file format | "File format not supported. Use MP4, MOV, AVI, or MKV" |
| File > 500 MB | "File exceeds 500 MB limit" |
| Transcript < 80 chars | "Paste at least a few paragraphs of transcript" |

**Content-gate rejection** (job ends in `failed` due to non-educational content): the backend exposes a structured `failure_reason` enum on the job row. Branch on `job.failure_reason === "non_educational"` and render: *"This content doesn't appear to be educational. Please try a lecture, tutorial, or explainer."* For other failure reasons (`transcription_failed`, `embedding_failed`, `unknown`), fall back to: *"Could not process this video. Please try another."*

```js
// utils/humanizeError.js
export function humanizeError(e) {
  switch (e?.code) {
    case "invalid_session": return "This session is no longer available.";
    case "stt_failed": return "Couldn't capture audio. Please type your question.";
    case "generation_failed": return "Something went wrong. Please try again.";
    case "invalid_input": return e.message || "Please check your input.";
    default: return "Something went wrong. Please try again.";
  }
}
```

---

## 12. Empty States & Copy

All copy below is verbatim from `plan/05-ui/requirements.md` §7 — do not paraphrase.

| Context | Copy |
|---|---|
| Sidebar, no sessions | "Upload a video or paste a transcript to get started" |
| Session ready, no messages | "Ask a question about this video" + suggestion chips (use a static set; per-session AI-generated suggestions are a future improvement, not V1) |
| Session selected but no messages and not ready | "We're still building the knowledge base. Sit tight." (interim copy; spec doesn't require an explicit version — use this) |
| No active session | "Pick a session, or start a new one" (already in prototype `app.jsx:121`) |
| Insufficient retrieval | Render backend's response text as-is (server-side wording) |

**Suggestion chips:** the prototype hardcodes per-session suggestions in `data.jsx`. For V1, use a static set of 3 generic prompts:
- "Give me a one-paragraph summary"
- "What's the most important idea here?"
- "Quiz me on the first half"

Move them into a constant in `ChatView.jsx`.

---

## 13. Accessibility & Keyboard

- Send on `Enter`, newline on `Shift+Enter` (already wired in `chat.jsx:107`).
- `Escape` closes the citation popover (already wired in `views.jsx:67`).
- All buttons keep their existing `title` attributes (the prototype is reasonable here).
- Mic button must announce state changes via `aria-live="polite"` on the recording indicator. Add `aria-pressed` reflecting `recording` state.
- TTS button: add `aria-label` that updates between "Listen", "Loading", "Pause" based on state.
- Citation buttons (`<button className="cite">`): add `aria-label={\`Open citation ${cite}\`}`.

This is the floor, not the ceiling. Don't spend a day on a full WCAG audit for V1.

---

## 14. Theme Switcher

Keep it. The three themes (`scholar`, `studio`, `focus`) are all in `styles.css` and toggle by adding `theme-{name}` to the root `<div>`. Surface the switcher in a small footer control (or keep the existing tweaks panel, stripped to just the theme radio).

Persist `theme` to `localStorage` so it survives refresh. Two lines:
```js
const [theme, setTheme] = useState(() => localStorage.getItem("gazelle.theme") || "scholar");
useEffect(() => localStorage.setItem("gazelle.theme", theme), [theme]);
```

---

## 15. Out of Scope for V1 (Do Not Build)

Per `plan/05-ui/requirements.md` §9 and reinforced here:

- Authentication / login / accounts
- Embedded video playback
- Transcript editing
- Streaming response rendering (responses arrive complete)
- Voice cloning / voice picker / audio download / waveform UI
- Analytics dashboard
- Cross-session memory or retrieval
- Server-side chat history persistence (deliberate V1 trade-off)
- Mobile-native app (responsive web is sufficient — and the prototype's CSS already handles it acceptably)
- Per-session AI-generated suggestion chips
- Session delete / archive / rename
- Multi-user collaboration
- Light/dark auto-detect (user picks theme)

If a request touches anything in this list, push back and reference this section.

---

## 16. Manual Test Checklist

Run through this end-to-end before declaring "done." **No automated tests required for V1.**

### Happy paths
- [ ] App loads, session list populates from `GET /sessions` (or shows empty state).
- [ ] Click "New chat" → InputView opens.
- [ ] Submit YouTube URL → see `processing` → stages advance based on real `GET /job/{id}` polls → auto-transition to chat when `ready`.
- [ ] Submit a video file (MP4 < 500 MB) → same flow.
- [ ] Paste a transcript (≥80 chars) → same flow.
- [ ] Type a question, hit Enter → assistant bubble appears with citation markers.
- [ ] Click a citation `[1]` → popover opens showing chunk text + timestamp range + relevance %.
- [ ] Press Escape → popover closes.
- [ ] Click TTS speaker icon → audio plays; progress bar moves; clicking pause stops it.
- [ ] Click mic → record → speech is transcribed into the textarea (not auto-sent).
- [ ] Switch sessions in sidebar → previous chat persists in memory; new session loads its own (possibly empty) history.
- [ ] Refresh page → session list rehydrates; chat history is empty (V1 accepted behavior); active session can be re-opened.
- [ ] Send 5 turns in one session → confirm the 5th request body includes `conversation_summary` populated from a previous response, and `recent_turns` contains exactly the last 4 turns.

### Error / edge paths
- [ ] Invalid YouTube URL → inline error.
- [ ] File > 500 MB → inline error, no upload starts.
- [ ] File of wrong format → inline error.
- [ ] Empty/short transcript → inline error.
- [ ] Job ends in `failed` → ProcessingView shows failure copy + "Try a different input" button; failed session removed from sidebar.
- [ ] Backend returns `insufficient_context` → response renders as a normal bubble (the refusal text).
- [ ] Mic permissions denied → graceful toast, no crash.
- [ ] TTS fails → button enters error state, response text remains usable.
- [ ] Backend down → toast on every action; no white-screen crashes.
- [ ] Theme switch persists across refresh.
- [ ] All three themes render every screen without layout breakage.

### Cross-browser smoke
- [ ] Chrome (primary)
- [ ] Safari (MediaRecorder mime fallback)
- [ ] Firefox

---

## 17. Deployment (Vercel)

The repo is a monorepo (per `CLAUDE.md`). Vercel deploys the FE from the `app/` subdirectory; the BE deploys separately from `gaz-server/` to Render.

1. Connect the `gazelle/` GitHub repo to Vercel.
2. Vercel project settings:
   - Framework preset: **Vite**
   - **Root directory: `app/`** (this is the monorepo subdir flag — non-negotiable)
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
3. Environment variable: `VITE_API_BASE_URL` → Render backend URL (e.g., `https://gazelle-api.onrender.com`).
4. Deploy preview on every PR; production on `main`.
5. **Path-based deploy filter (recommended):** configure Vercel to ignore changes outside `app/` so commits that only touch `plan/` or `gaz-server/` don't trigger FE rebuilds. Vercel's "Ignored Build Step" or `vercel.json` `git.deploymentEnabled` config handles this.
6. After first deploy, visit and run the manual test checklist (§16).

**Cold-start caveat:** Render free tier spins down after 15 min idle. The first request after idle may take 30+ seconds. The processing UI's polling will gracefully wait, but consider showing a one-time toast if the first request takes > 5s: *"Waking up the backend — this can take a moment on the free tier."*

---

## 18. Implementation Order (Suggested Sequence)

For a single developer or AI working through this end-to-end:

1. **Scaffold + visual parity** (§4) — Vite app renders pixel-identical to the prototype with mock data. Half a day.
2. **API client layer** (§7) — all endpoints stubbed, no UI integration yet. Hour.
3. **Session list** (Seam 1) — sidebar pulls real sessions on mount.
4. **Input + ingest + polling** (Seams 2 + 3) — full happy path: submit → poll → auto-transition.
5. **RAG query** (Seam 4) — text questions work end-to-end with real citations.
6. **Citation tokenizer + popover** (§9) — `[1]` markers become clickable; popover shows chunk text.
7. **Conversation history** (§10) — verify summary + recent_turns travel with each request.
8. **Voice input** (Seam 5) — MediaRecorder → STT → textarea.
9. **TTS playback** (Seam 6) — speaker button works, plus 3,500-char notice.
10. **Error states** (§11) — every error code wired to a toast or inline alert.
11. **Empty / failure states** (§12 + processing failure UI from Seam 3).
12. **A11y + theme persistence** (§13 + §14).
13. **Manual QA pass** (§16).
14. **Deploy** (§17).

Each step ends with a runnable app. Ship behind no flags.

---

## 19. Things You Might Be Tempted To Do (And Shouldn't)

- **Add Tailwind / shadcn / a UI library.** The CSS exists. Touching it costs days and breaks themes.
- **Convert to TypeScript.** Adds friction with no V1 benefit. The API client is small enough that JSDoc covers the IDE story.
- **Add React Query / SWR.** Eight endpoints, no caching requirement, all calls are user-initiated except session-list-on-mount. Plain `fetch` is enough.
- **Add Redux / Zustand.** State fits in one component. Move it later if it grows.
- **Stream the response.** Stage 2 PRD explicitly excludes streaming for V1.
- **Persist chat history client-side via IndexedDB.** Spec accepts the "chat clears on refresh" trade-off. Don't gold-plate.
- **Add per-session suggestion generation.** Static suggestions are fine for V1.
- **Add an audio waveform visualizer for the mic button.** Out of scope.
- **Build a settings page.** There is nothing to configure besides the theme.
- **"Improve" the design.** The handoff was explicit: pixel-perfect recreation. Visual changes belong in a separate design loop.

---

## 20. Open Questions to Resolve Before Coding (Confirm With Owner)

These are not blockers — sensible defaults are above — but a 2-minute confirm saves rework.

1. **Backend CORS:** is `localhost:5173` + the Vercel preview domain pattern allowed? (§5)
2. **Backend citation marker convention:** does the LLM emit `[1]`, `[2]`, etc., positionally aligned with `citations[]`? (§9)
3. **Job-failure error codes:** does `GET /job/{id}` (status=`failed`) return a structured code for "non-educational content" rejection, or is it free-text in `error_message`? (§11)
4. **Polling interval:** is 2 seconds acceptable load on the backend, or should we go to 3? (§8 Seam 3)
5. **TTS truncation surfacing:** does `/tts` return any signal that truncation occurred (header, JSON wrapper), or do we infer from input length? (§8 Seam 6) — current plan infers client-side.

If any of these come back with a different answer, the affected section is the only one that changes.

---

## 21. Implementation Amendments (post-original-plan)

The plan above remains the contract for the V1.0 build. The amendments below capture decisions and code shapes that emerged during implementation and shipped with the demo. Sections are referenced by their original number; if you're rebuilding from scratch, read the original section first, then the amendment.

### 21.1 Theme is applied to `document.body` (§6, §14)

The original §6 sketches showed `<div className={themeClass}>...</div>` wrapping the app. In implementation that caused the focus theme to half-apply (sidebar darkened correctly because `.sidebar { background: var(--bg-side) }` is a descendant of the wrapper, but `body { background: var(--bg); color: var(--ink); }` is OUTSIDE the wrapped subtree — so body kept its `:root` cream).

**Final pattern** (in `App.jsx`):
```jsx
const THEME_CLASSES = ["theme-scholar", "theme-studio", "theme-focus"];
useEffect(() => {
  const next = `theme-${t.theme || "scholar"}`;
  THEME_CLASSES.forEach((c) => document.body.classList.remove(c));
  document.body.classList.add(next);
}, [t.theme]);
```

The wrapper `<div>` is removed; `App` returns a Fragment containing `<div className="app">` directly. With `body` itself carrying the theme class, every `body` rule and every descendant variable lookup resolves to the active theme.

`styles.css` adds `color-scheme` so native widgets (scrollbars, autofill, native `<select>` menus) match:
```css
.theme-scholar, .theme-studio { color-scheme: light; }
.theme-focus { color-scheme: dark; }
```

### 21.2 Recent-activity sort in the sidebar (§6, §3 Sidebar)

Sessions sort by a client-only `last_activity_at` field that defaults to `created_at` and bumps on activity. The behavior matches mainstream chat apps (most-recently-touched bubbles to the top).

State updates:
- On `listSessions` mount: each row is rehydrated as `{ ...row, last_activity_at: row.created_at }`.
- On `handleSubmitInput` success: new session gets `last_activity_at: nowISO()`.
- On `handleSend` (immediately after staging the user message): the active session's `last_activity_at` is bumped to `nowISO()`.

`Sidebar.jsx` does `[...sessions].sort(byActivityDesc)`, splits into active vs archived, then groups active into Today / Earlier by `relativeDate(last_activity_at)`. `SessionItem` reads `s.last_activity_at || s.created_at` for the date pill.

V1 trade-off: in-memory only. After refresh, sessions revert to `created_at` order until next interaction. Same trade-off class as "chat clears on refresh" already documented in §15.

### 21.3 Session archive + delete (new §11 row + new actions per row)

Added per the user's "elegant cleanup" request. Three new affordances appear hover-revealed on each session row (the row was refactored from `<button>` to `<div role="button">` so real `<button>` action elements can nest inside).

| Status | Hover affordance | Action |
|---|---|---|
| `failed` | Trash icon | `window.confirm("Remove this failed ingestion?")` → `DELETE /job/{id}` → `pruneLocalSession(id)` |
| `ready` (and not archived) | Archive icon | optimistic PATCH `{archived: true}` → row moves to "Archived (N)" section. Reverts on failure with toast. |
| `archived: true` | Restore + Trash icons | Restore: PATCH `{archived: false}`. Trash: `window.confirm("Delete this session forever?")` → DELETE → prune. |
| In-progress (`pending|transcribing|validating|embedding`) | none | Wait for terminal state. |

The "Archived (N)" heading is a collapsible toggle at the bottom of `.session-list`. Open/closed state persists to `localStorage` under `gazelle.archiveOpen`. Archived sessions stay clickable — opening one navigates into its chat normally; archived ≠ read-only. To remove from the active list permanently, restore first or hit "Delete forever" from the archive.

API client (`src/api/job.js`):
```js
export const archiveJob = (jobId, archived) =>
  request(`/job/${jobId}/archive`, { method: "PATCH", body: { archived } });
export const deleteJob = (jobId) =>
  request(`/job/${jobId}`, { method: "DELETE" });
```

App handlers (`src/App.jsx`):
- `handleArchive(sid, next)` — optimistic local update, rollback + toast on failure.
- `handleDelete(sid)` — awaits server success, then `pruneLocalSession(id)` (drops from `sessions[]`, clears `messagesBySession[id]` + `historyBySession[id]`, navigates to "empty" view if it was the active session).
- `handleAbandonFailure` (existing "Try a different input" flow) — also calls `deleteJob` best-effort so failed sessions don't accumulate when the user abandons.

CSS additions in `styles.css`:
- `.session-item .si-action` — opacity transition; hidden until `:hover` or `:focus-within`.
- `.si-btn` (neutral) and `.si-btn-danger` (red) for action buttons.
- `.session-section-toggle` — clickable variant of `.session-section-label` for the Archived heading.
- Three new icons in `Icon.jsx`: `Archive`, `Restore`, `Trash`.

Backend contract for these endpoints lives in `be-plan.md` §27.1.

### 21.4 File-tree updates since §3

- `src/components/SessionItem.jsx` is now a `<div role="button">` with `onKeyDown` for Enter/Space → onClick, so action `<button>`s inside are valid HTML.
- `Icon.jsx` gained `Archive`, `Restore`, `Trash`, in addition to the original 13.
- `lib/humanizeError.js` exports both `humanizeError(e)` (toast text) AND `failureMessage(failure_reason)` (the structured-failure-reason branch used by ProcessingView).
- `lib/format.js` exports `formatSeconds`, `relativeDate`, and `capitalize`.
- `hooks/useJobPolling.js` is implemented as specified; `hooks/useTweaks.js` is the minimal localStorage-backed theme hook (the original prototype's tweaks panel is fully removed — only the theme dropdown survives, in the sidebar foot).
- `lib/recorder.js`, `lib/citations.js`, `lib/conversation.js`, `lib/statusMap.js` — all implemented per their respective sections.
- `lib/mockData.js` was a temporary scaffold during visual-parity build (Task #14); deleted once §16 (Seam 4) wired real `/rag/query`.

### 21.5 BE drift fixes that affected the FE contract

None. The three BE drift fixes (yt-dlp v1 rename, Groq language map, qdrant-client `query_points()`) are internal to the BE. The FE contract is unchanged.

### 21.6 V1 manual-QA outcome

All twelve cases in §16 (happy + edge) verified end-to-end against a live BE. Captured in `summary.md` under "Frontend — verification checklist". Two follow-ups deferred:
- Whisper hallucinated-silence case (BE issue, not FE — see `summary.md` "Known minor issues").
- Re-tune `MIN_SIMILARITY_SCORE` from prototype `0.2` back toward spec `0.72` once realistic content distribution is in the index.

---

**End of plan.** This document is the contract. If something needs to change, change this file first, then change the code.
