# Gazelle Backend — Implementation Plan

> **Audience:** any developer or AI agent implementing the Gazelle FastAPI backend.
> **Strategy:** **Build the thin pipeline first.** Stage 0+1 (ingest → transcribe → validate → chunk → embed) chained into a single background job, then Stage 2 (RAG) and Stage 3 (TTS) on top. Every endpoint is contractually fixed by the FE plan and the stage TRDs — this document tells you exactly how to wire them, where each module lives, what each prompt says, and what to do when things fail.

---

## 0. Read These First (Required Reading)

Read in this order before writing a line of code. Every decision below is rooted in these documents — if anything in this plan ever conflicts with them, the source documents win.

| File | Why |
|---|---|
| `summary.md` | Living source of truth for stack, decisions, status |
| `plan/pipeline.md` | One-paragraph mental model of the four stages |
| `plan/01-transcription/PRD_AI_Tutor_Transcript_Service.md` | Stage 0 product intent |
| `plan/01-transcription/TRD_AI_Tutor_Transcript_Service.md` | Stage 0 technical contract — endpoints, statuses, schemas |
| `plan/02-kb-embedding/transcript_grounded_chat_prd.md` | Stage 1 product intent |
| `plan/02-kb-embedding/transcript_grounded_chat_trd.md` | Stage 1 chunking + embedding contract |
| `plan/03-input-and-RAG/gazelle_stage2_prd.md` | Stage 2 product intent (chat + RAG) |
| `plan/03-input-and-RAG/gazelle_stage2_trd.md` | Stage 2 RAG pipeline + `/stt`, `/rag/query`, error schema |
| `plan/04-rendering-and-tts/gazelle_stage3_prd.md` | Canonical response schema (citations include `text`) |
| `plan/04-rendering-and-tts/gazelle_stage3_trd.md` | `/tts` endpoint, language map, 3,500-char cap |
| `plan/hosting/hosting.md` | Render deployment, env vars, Supabase SQL |
| `plan/implementation/backend/cors-caution.md` | CORS — copy the middleware verbatim |
| `plan/implementation/frontend/plan.md` | What the FE expects from every endpoint, error code, citation marker convention |

If a behavior is not in this plan or in the documents above, **ask before inventing it.** The product surface is intentionally narrow for V1.

---

## 1. Goal

Ship a single FastAPI service deployed to Render that exposes 8 HTTP endpoints, talks to Supabase (Postgres metadata) + Qdrant (vectors) + OpenAI (embeddings, GPT-4o-mini, TTS) + Groq (Whisper STT), and behaves exactly as the FE plan expects:

1. Accept a YouTube URL, file upload, or pasted transcript → return a `job_id`, run Stage 0 (transcribe + validate) and Stage 1 (chunk + embed) chained as one background task.
2. Expose `GET /job/{id}` for polling and `GET /sessions` for the sidebar.
3. Accept text questions on `POST /rag/query` → run query augmentation, dense retrieval (top 5, threshold 0.72), grounded generation, and conversation compaction every 4 turns. Return structured response with citations whose `text` is the verbatim source chunk.
4. Accept voice on `POST /stt` → return transcribed text.
5. Accept text on `POST /tts` → stream `audio/mpeg`.

That is the entire scope. Authentication, server-side chat persistence, streaming, multi-tenant isolation, transcript editing, a separate stage-1-trigger endpoint, video file storage — all out of scope (see §22).

---

## 2. Tech Stack & Why

| Choice | Why |
|---|---|
| **Python 3.11.9** | Pinned in `hosting.md` so Render and laptops match. 3.11 is fast, supported by every SDK in our stack. |
| **FastAPI** | Spec-mandated. Async-native, Pydantic-validated, OpenAPI for free, `BackgroundTasks` covers our async needs without Celery. |
| **Uvicorn (standard)** | Default ASGI server, what Render starts. |
| **Pydantic v2 + pydantic-settings** | Strong request/response validation; env loading without manual `os.getenv` boilerplate. |
| **`supabase-py`** | Hosted Postgres client. We only need `select`/`insert`/`update` on one table — no ORM needed. |
| **`qdrant-client`** | Official, supports payload-indexed filters and batched upserts. |
| **`openai` (>=1.x)** | Embeddings (`text-embedding-3-small`), GPT-4o-mini (augment + compact + generate), TTS (`tts-1`). One SDK, one auth. |
| **`groq`** | Official Python SDK for Groq Whisper. Used for ingest ASR (Stage 0) and voice queries (Stage 2 `/stt`). |
| **`yt-dlp`** | YouTube metadata + audio download. Most reliable extraction tool. |
| **`youtube-transcript-api`** | Native-caption fast path for YouTube — saves ASR cost when captions exist. |
| **`ffmpeg-python` + system FFmpeg** | Audio extraction from uploaded video; downsample to mono 16 kHz mp3 before sending to Groq. Render's apt buildpack ships FFmpeg. |
| **`langchain-text-splitters`** | `RecursiveCharacterTextSplitter` is the V1 chunker. Stable, sentence-aware separators, well-documented. We use it with a tiktoken length function so token targets are real. |
| **`tiktoken`** | Token counting (`cl100k_base`) compatible with OpenAI embeddings + GPT-4o-mini. |
| **`python-multipart`** | Required for `UploadFile` form parsing. |
| **`python-dotenv`** | Local `.env` loading (production uses Render's env injection). |

**Do not introduce:** Celery / Redis / RQ, SQLAlchemy / Alembic, LangChain agents/chains beyond the splitter, LlamaIndex, FAISS, sentence-transformers, pytest fixtures wiring up real APIs. They all cost time and buy nothing for V1.

### `requirements.txt` (locked versions are recommended pins; floor versions are minimums known to work together)

```
fastapi>=0.110
uvicorn[standard]>=0.27
pydantic>=2.6
pydantic-settings>=2.2
python-multipart>=0.0.9
python-dotenv>=1.0
httpx>=0.27
openai>=1.30
groq>=0.9
supabase>=2.4
qdrant-client>=1.9
yt-dlp>=2024.3.10
youtube-transcript-api>=0.6.2
ffmpeg-python>=0.2.0
langchain-text-splitters>=0.0.1
tiktoken>=0.7
```

### `runtime.txt`
```
python-3.11.9
```

---

## 3. Target Project Structure

Backend lives at `gaz-server/` — peer to `app/`, `web-ui/`, and `plan/` per `CLAUDE.md`. Per the locked decision, source code lives under `gaz-server/src/` and the uvicorn target is `src.main:app`.

```text
gaz-server/
├── requirements.txt
├── runtime.txt                       # python-3.11.9
├── .env                              # ⚠ git-ignored
├── .env.example                      # ✅ committed template
├── .gitignore
└── src/
    ├── __init__.py
    ├── main.py                       # FastAPI app: CORS, router include, startup hook
    │
    ├── core/
    │   ├── __init__.py
    │   ├── config.py                 # pydantic-settings — env loading
    │   ├── constants.py              # MIN_SIMILARITY_SCORE, TOP_K, TTS_CHAR_LIMIT, etc.
    │   └── logging.py                # logger setup
    │
    ├── schemas/                      # Pydantic request/response models — pure data, no I/O
    │   ├── __init__.py
    │   ├── jobs.py
    │   ├── ingest.py
    │   ├── rag.py
    │   ├── tts.py
    │   └── errors.py
    │
    ├── routes/                       # Thin HTTP handlers — parse, call service, format response
    │   ├── __init__.py
    │   ├── health.py                 # GET /health
    │   ├── ingest.py                 # POST /ingest/{youtube|upload|text}
    │   ├── jobs.py                   # GET /job/{id}
    │   ├── sessions.py               # GET /sessions
    │   ├── stt.py                    # POST /stt
    │   ├── rag.py                    # POST /rag/query
    │   └── tts.py                    # POST /tts
    │
    ├── clients/                      # Thin SDK wrappers — single instance per process
    │   ├── __init__.py
    │   ├── openai_client.py
    │   ├── groq_client.py
    │   ├── supabase_client.py
    │   └── qdrant_client.py
    │
    ├── db/
    │   ├── __init__.py
    │   └── jobs_repo.py              # All `jobs` table reads/writes
    │
    ├── pipeline/                     # Stage 0 + Stage 1 — ingest pipeline
    │   ├── __init__.py
    │   ├── orchestrator.py           # run_ingest_job(job_id, source_type, payload)
    │   ├── transcription/
    │   │   ├── __init__.py
    │   │   ├── youtube.py            # yt-dlp metadata + audio path
    │   │   ├── upload.py             # save UploadFile to /tmp, extract audio
    │   │   ├── text.py               # synthesize transcript[] from raw paste
    │   │   ├── captions.py           # youtube-transcript-api fast path
    │   │   └── asr.py                # Groq Whisper wrapper
    │   ├── validation.py             # GPT-4o-mini educational classifier
    │   ├── chunking.py               # RecursiveCharacterTextSplitter wiring
    │   └── embedding.py              # OpenAI embeddings + Qdrant upsert
    │
    ├── rag/                          # Stage 2 — query → answer
    │   ├── __init__.py
    │   ├── augment.py                # query augmentation + language detection (one LLM call)
    │   ├── retrieve.py               # Qdrant search + threshold filter + payload normalization
    │   ├── generate.py               # GPT-4o-mini answer generation
    │   ├── compact.py                # conversation summary (every 4th turn)
    │   └── prompts.py                # ALL prompt templates as module constants
    │
    ├── services/                     # Stage 2/3 endpoint helpers
    │   ├── __init__.py
    │   ├── stt_service.py            # /stt — Groq Whisper for voice query
    │   ├── tts_service.py            # /tts — OpenAI TTS streaming
    │   └── ffmpeg_audio.py           # video → mono 16kHz mp3
    │
    └── utils/
        ├── __init__.py
        ├── youtube_url.py            # canonicalize / validate
        ├── titles.py                 # title derivation per source_type
        └── timing.py                 # mm:ss formatting, span math
```

**Why this split:**
- `routes/` knows HTTP. `pipeline/` and `rag/` know domain logic. `clients/` know SDK quirks. `schemas/` knows shapes. Mixing them is the road to a 1,000-line `main.py`.
- Each pipeline module is independently runnable in a Python REPL once env vars are loaded — that is the unit-of-debugging.

---

## 4. Environment & Config

### `.env.example` (committed)

```env
# Required
OPENAI_API_KEY=
GROQ_API_KEY=
SUPABASE_URL=
SUPABASE_KEY=
QDRANT_URL=
QDRANT_API_KEY=

# CORS — comma-separated; Vite dev origin baseline
ALLOWED_ORIGINS=http://localhost:5173

# Optional overrides (sane defaults exist in code)
QDRANT_COLLECTION=transcript_chunks
EMBED_MODEL=text-embedding-3-small
GEN_MODEL=gpt-4o-mini
GROQ_WHISPER_MODEL=whisper-large-v3-turbo
TTS_MODEL=tts-1
TTS_VOICE=alloy
MIN_SIMILARITY_SCORE=0.72
TOP_K=5
LOG_LEVEL=INFO
```

### `src/core/config.py`

```python
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    OPENAI_API_KEY: str
    GROQ_API_KEY: str
    SUPABASE_URL: str
    SUPABASE_KEY: str
    QDRANT_URL: str
    QDRANT_API_KEY: str
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    QDRANT_COLLECTION: str = "transcript_chunks"
    EMBED_MODEL: str = "text-embedding-3-small"
    GEN_MODEL: str = "gpt-4o-mini"
    GROQ_WHISPER_MODEL: str = "whisper-large-v3-turbo"
    TTS_MODEL: str = "tts-1"
    TTS_VOICE: str = "alloy"
    MIN_SIMILARITY_SCORE: float = 0.72
    TOP_K: int = 5
    LOG_LEVEL: str = "INFO"

@lru_cache
def settings() -> Settings:
    return Settings()
```

`settings()` is called by every module that needs config — `lru_cache` makes it a singleton.

### `src/core/constants.py`

```python
EMBED_DIM = 1536
CHUNK_TARGET_TOKENS = 500
CHUNK_OVERLAP_TOKENS = 75
COMPACTION_INTERVAL = 4
RECENT_TURNS_KEPT = 4
TTS_CHAR_LIMIT = 3500
VALIDATION_SAMPLE_CHARS = 1500
EMBED_BATCH_SIZE = 100
MAX_UPLOAD_MB = 500
ALLOWED_UPLOAD_EXTS = {".mp4", ".mov", ".avi", ".mkv"}
```

These are tunable; values match the TRDs and FE plan.

---

## 5. Database Schema

### 5.1 Supabase — `jobs` table

The full SQL lives in `plan/hosting/hosting.md` §6.2 and is run **once** in the Supabase SQL editor on first setup. It is the single source of truth — do **not** redefine it here. Key columns the backend writes:

| Column | When written | Note |
|---|---|---|
| `id` | on ingest | auto-`gen_random_uuid()` — also serves as `session_id` |
| `status` | every state change | enum: `pending → transcribing → validating → embedding → ready → failed` |
| `source_type` | on ingest | `youtube` / `upload` / `transcript` |
| `source` | on ingest (where applicable) | YouTube URL, original filename, or `null` for paste |
| `title` | on ingest (optimistic) + after Stage 0 | see §10 — derivation rules |
| `detected_language` | after transcription | `"en"` / `"hi"` (lowercase 2-letter) |
| `duration_seconds` | after transcription | int; `null` for pasted text |
| `used_native_captions` | after transcription | bool; `null` for non-YouTube |
| `transcript_json` | after transcription | full Stage 0 schema (see TRD §12) |
| `full_text` | after transcription | concatenated transcript text |
| `validation_result` | after validation | `{is_educational: bool, reason: str}` |
| `error_message` | on failure | human-readable |
| `failure_reason` | on failure | enum `non_educational | transcription_failed | embedding_failed | invalid_input | unknown` |

### 5.2 Qdrant — `transcript_chunks` collection

**Auto-created on app startup** if missing (see §6 startup hook). Spec:

```python
# vector config
size = 1536                # text-embedding-3-small
distance = "Cosine"
```

**Payload schema (per point):**

```json
{
  "session_id": "uuid",
  "chunk_id": "uuid",
  "chunk_index": 0,
  "text": "Today we will discuss matrices...",
  "start_time": 12.4,
  "end_time": 89.2,
  "speaker_set": ["Instructor"],
  "language": "en",
  "prev_chunk_id": "uuid | null",
  "next_chunk_id": "uuid | null"
}
```

**Required payload index:** `session_id` (keyword) — created on startup so retrieval filters are O(1):

```python
client.create_payload_index(
    collection_name="transcript_chunks",
    field_name="session_id",
    field_schema="keyword",
)
```

Point IDs use the same `chunk_id` UUIDs as the payload (one source of truth).

---

## 6. Application Wiring

### `src/main.py`

```python
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .core.logging import setup_logging
from .clients import qdrant_client, supabase_client, openai_client, groq_client
from .routes import health, ingest, jobs, sessions, stt, rag, tts

setup_logging(settings().LOG_LEVEL)
log = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Eagerly construct clients (fail fast on bad creds).
    openai_client.get()
    groq_client.get()
    supabase_client.get()
    # Ensure Qdrant collection + payload index exist.
    qdrant_client.ensure_collection()
    log.info("Startup complete.")
    yield

app = FastAPI(title="Gazelle Backend", version="1.0.0", lifespan=lifespan)

origins = [o.strip() for o in settings().ALLOWED_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app",   # preview deploys
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
    allow_credentials=False,
)

app.include_router(health.router)
app.include_router(ingest.router)
app.include_router(jobs.router)
app.include_router(sessions.router)
app.include_router(stt.router)
app.include_router(rag.router)
app.include_router(tts.router)
```

CORS values mirror `plan/implementation/backend/cors-caution.md` §3 — that file is the source of truth.

---

## 7. API Endpoints — Full Contracts

Every endpoint below specifies: HTTP signature, request schema, response schema, error codes. All error responses use the envelope from `plan/03-input-and-RAG/gazelle_stage2_trd.md` §592:

```json
{ "error": { "code": "...", "message": "..." } }
```

### 7.1 `GET /health`

Liveness probe for Render. No DB roundtrip — keep cheap.

**Response 200**
```json
{ "status": "ok" }
```

### 7.2 `POST /ingest/youtube`

**Request**
```json
{ "url": "https://www.youtube.com/watch?v=..." }
```

**Validation:** must match `youtube.com/watch?v=...` or `youtu.be/...` (see `utils/youtube_url.py`). Other forms (`m.`, `/embed/`, `/shorts/`, playlists) → 400 `invalid_input`.

**Response 202**
```json
{ "job_id": "uuid", "status": "pending" }
```

**Behavior:** insert `jobs` row → enqueue background task `run_ingest_job(job_id, "youtube", {url})` → return immediately.

### 7.3 `POST /ingest/upload`

**Request:** `multipart/form-data` with field `file` (MP4, MOV, AVI, MKV; ≤ 500 MB).

**Validation:**
- Extension must be in `ALLOWED_UPLOAD_EXTS` → else 400 `invalid_input` `"File format not supported. Use MP4, MOV, AVI, or MKV"`.
- `file.size` (or streaming length cap) ≤ `MAX_UPLOAD_MB * 1024 * 1024` → else 400 `invalid_input` `"File exceeds 500 MB limit"`.

**Response 202** — same shape as 7.2.

**Behavior:** save `UploadFile` to `tempfile.NamedTemporaryFile(delete=False, suffix=ext)` → insert job row with `source = original_filename` and `title = filename_without_ext` → enqueue background task with the temp path → return.

### 7.4 `POST /ingest/text`

**Request**
```json
{ "text": "Today we will discuss matrices..." }
```

**Validation:** `len(text.strip()) >= 80` (matches FE plan §11 client-side rule) — else 400 `invalid_input` `"Paste at least a few paragraphs of transcript"`.

**Response 202** — same shape.

**Behavior:** insert job row with `source_type = "transcript"`, `source = null`, `title` from `utils/titles.py` → enqueue background task with `{text}` → return.

### 7.5 `GET /job/{job_id}`

**Response 200** — three shapes by status:

```json
// pending | transcribing | validating | embedding
{
  "job_id": "uuid",
  "status": "embedding",
  "source_type": "youtube",
  "title": "Intro to Linear Algebra",
  "created_at": "2026-05-10T12:00:00Z"
}

// ready
{
  "job_id": "uuid",
  "status": "ready",
  "source_type": "youtube",
  "source": "https://youtube.com/...",
  "title": "Intro to Linear Algebra",
  "detected_language": "en",
  "duration_seconds": 5421,
  "created_at": "2026-05-10T12:00:00Z"
}

// failed
{
  "job_id": "uuid",
  "status": "failed",
  "failure_reason": "non_educational",
  "error_message": "This content doesn't appear to be educational.",
  "created_at": "2026-05-10T12:00:00Z"
}
```

**Errors:** 404 `invalid_session` if job not found.

### 7.6 `GET /sessions`

Returns metadata for the sidebar. **Includes failed jobs** so the user sees a complete timeline (FE may filter — that is FE's call). Ordered by `created_at desc`.

**Response 200**
```json
{
  "sessions": [
    {
      "job_id": "uuid",
      "title": "Intro to Linear Algebra",
      "source_type": "youtube",
      "status": "ready",
      "created_at": "2026-05-10T12:00:00Z"
    }
  ]
}
```

### 7.7 `POST /stt`

Transcribe a voice query to text using Groq Whisper.

**Request:** `multipart/form-data`, field `audio` (any browser-recorded format — webm/opus, mp4, ogg, wav). Soft cap 25 MB (Groq's hard limit).

**Response 200**
```json
{ "text": "What is backpropagation?" }
```

**Errors:** 500 `stt_failed` if Groq returns an error or empty transcript.

### 7.8 `POST /rag/query`

The core RAG endpoint. Full pipeline in §13.

**Request**
```json
{
  "session_id": "uuid",
  "query_text": "Why does that happen?",
  "turn_count": 3,
  "conversation_summary": "Previously discussed Newton's laws...",
  "recent_turns": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

- `turn_count` is the number of **user** turns in this session **before** the current one (0 on the first query). The FE computes it as `messagesBySession[sid].filter(m => m.role === "user").length`. The server uses this to decide compaction cadence reliably — `recent_turns` is capped at 4 turns, so the server cannot infer turn position from it past turn 4.
- `conversation_summary` may be `null` or `""` on the first query. `recent_turns` may be `[]`.

**Response 200**
```json
{
  "response": {
    "text": "Eigenvectors are special vectors that... [1] They satisfy A·v=λv [2].",
    "language": "english"
  },
  "conversation_summary": null,
  "citations": [
    {
      "chunk_id": "uuid",
      "text": "An eigenvector of a matrix A is a non-zero vector...",
      "timestamp_start": 120.5,
      "timestamp_end": 142.9,
      "relevance_score": 0.83,
      "speaker_set": ["Instructor"]
    }
  ]
}
```

`conversation_summary` is **non-null only on compaction turns** (every 4th turn). On all other turns it is `null` and the client retains its previously stored summary.

**`response.text` citation marker convention (locked):** the LLM is instructed by the system prompt to emit inline `[N]` markers where `N` is **1-indexed** and refers positionally to `citations[N-1]`. The FE relies on this.

**Errors:**
| Code | HTTP | When |
|---|---|---|
| `invalid_session` | 404 | `session_id` not in `jobs` or `status != "ready"` |
| `insufficient_context` | 200 | No retrieved chunk meets the similarity threshold — refusal text rendered as a normal assistant message |
| `generation_failed` | 500 | LLM call exceptions / timeouts |
| `invalid_input` | 400 | Missing required fields or malformed body |

**`insufficient_context` returns 200**, not an error envelope — the response body is a normal assistant message with the refusal text (per Stage 2 TRD §608, §613). Verbatim refusals in §17.

### 7.9 `POST /tts`

Generate audio for an answer.

**Request**
```json
{ "text": "Eigenvectors are special vectors...", "language": "en" }
```

`language ∈ {"en", "hi"}`. The FE uses the language map from Stage 3 TRD §97 (hindi/hinglish → `hi`, english → `en`); the backend just forwards.

**Response 200:** `Content-Type: audio/mpeg`, body is the mp3 stream from OpenAI TTS.

**Behavior:**
1. Truncate `text` to last complete paragraph within `TTS_CHAR_LIMIT = 3500`. If `text` already ≤ limit, no-op. (The truncation is silent — FE infers from input length per FE plan §8 Seam 6.)
2. Call OpenAI `audio.speech.create(model=settings().TTS_MODEL, voice=settings().TTS_VOICE, input=text, response_format="mp3")`.
3. Stream the response via `StreamingResponse(..., media_type="audio/mpeg")`.

**Errors:** 500 `generation_failed` if OpenAI errors. (Stage 2 TRD doesn't define a `tts_failed` code — reuse `generation_failed`; FE handles that bucket as "Unable to generate audio.")

---

## 8. Pydantic Schemas

All request/response bodies are typed. Skeleton:

### `src/schemas/ingest.py`
```python
from pydantic import BaseModel, HttpUrl, Field

class IngestYouTube(BaseModel):
    url: HttpUrl

class IngestText(BaseModel):
    text: str = Field(min_length=80)

class IngestAccepted(BaseModel):
    job_id: str
    status: str = "pending"
```

### `src/schemas/jobs.py`
```python
from typing import Literal, Optional
from pydantic import BaseModel

JobStatus = Literal["pending", "transcribing", "validating", "embedding", "ready", "failed"]
FailureReason = Literal[
    "non_educational", "transcription_failed", "embedding_failed", "invalid_input", "unknown"
]

class JobView(BaseModel):
    job_id: str
    status: JobStatus
    source_type: Literal["youtube", "upload", "transcript"]
    title: Optional[str] = None
    source: Optional[str] = None
    detected_language: Optional[str] = None
    duration_seconds: Optional[int] = None
    failure_reason: Optional[FailureReason] = None
    error_message: Optional[str] = None
    created_at: str

class SessionRow(BaseModel):
    job_id: str
    title: Optional[str]
    source_type: str
    status: JobStatus
    created_at: str

class SessionsResponse(BaseModel):
    sessions: list[SessionRow]
```

### `src/schemas/rag.py`
```python
from typing import Literal, Optional
from pydantic import BaseModel, Field

Language = Literal["english", "hindi", "hinglish"]

class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class RagRequest(BaseModel):
    session_id: str
    query_text: str = Field(min_length=1)
    turn_count: int = Field(default=0, ge=0)   # user turns BEFORE this one
    conversation_summary: Optional[str] = None
    recent_turns: list[Turn] = []

class Citation(BaseModel):
    chunk_id: str
    text: str
    timestamp_start: float
    timestamp_end: float
    relevance_score: float
    speaker_set: list[str] = []

class ResponseBody(BaseModel):
    text: str
    language: Language

class RagResponse(BaseModel):
    response: ResponseBody
    conversation_summary: Optional[str] = None
    citations: list[Citation]
```

### `src/schemas/tts.py`
```python
from typing import Literal
from pydantic import BaseModel, Field

class TTSRequest(BaseModel):
    text: str = Field(min_length=1)
    language: Literal["en", "hi"]
```

### `src/schemas/errors.py`
```python
from pydantic import BaseModel

class ErrorBody(BaseModel):
    code: str
    message: str

class ErrorEnvelope(BaseModel):
    error: ErrorBody
```

A FastAPI exception handler converts an internal `AppError(code, message, status)` into this envelope. One handler, one shape, zero ad-hoc error JSON.

---

## 9. Database Layer (`src/db/jobs_repo.py`)

A thin module of **named functions** — no repository class. Each function takes the supabase client from `clients/supabase_client.py` and returns plain dicts or domain objects.

```python
def create_job(source_type: str, source: str | None, title: str | None) -> str
def get_job(job_id: str) -> dict | None
def list_sessions() -> list[dict]
def set_status(job_id: str, status: str) -> None
def save_transcript(job_id: str, transcript_json: dict, full_text: str,
                    detected_language: str, duration_seconds: int | None,
                    used_native_captions: bool | None, title: str | None) -> None
def save_validation(job_id: str, result: dict) -> None
def mark_failed(job_id: str, failure_reason: str, error_message: str) -> None
```

`set_status` is called at every transition by the orchestrator. Keep one writer per concern.

---

## 10. Title Derivation (`src/utils/titles.py`)

Locked rules:

```python
def title_from_youtube(metadata_title: str | None, url: str) -> str:
    return metadata_title or url

def title_from_upload(filename: str) -> str:
    base = os.path.splitext(os.path.basename(filename))[0]
    return base[:80] if base else "Uploaded video"

def title_from_text(text: str) -> str:
    snippet = text.strip().splitlines()[0][:60].strip() if text.strip() else ""
    if not snippet:
        return "Pasted transcript"
    return snippet + ("…" if len(text.strip()) > 60 else "")
```

For YouTube, the optimistic title at ingest time is the URL itself; once `yt-dlp` resolves metadata in the background task, the row's `title` is updated. The FE refetches on `ready` and replaces the optimistic title (FE plan Seam 3 §8).

---

## 11. Ingest Orchestrator (`src/pipeline/orchestrator.py`)

This is the spine of Stages 0+1. One function, one job. Catches every exception, marks the job failed with a structured `failure_reason`, and never raises out.

```python
async def run_ingest_job(job_id: str, source_type: str, payload: dict) -> None:
    try:
        # 1. Transcribe
        set_status(job_id, "transcribing")
        if source_type == "youtube":
            transcript, meta = await transcribe_youtube(payload["url"])
        elif source_type == "upload":
            transcript, meta = await transcribe_upload(payload["temp_path"])
        else:  # "transcript"
            transcript, meta = synthesize_transcript_from_text(payload["text"])

        save_transcript(
            job_id,
            transcript_json=transcript,
            full_text=meta.full_text,
            detected_language=meta.language,
            duration_seconds=meta.duration,
            used_native_captions=meta.used_native_captions,
            title=meta.title,
        )

        # 2. Validate
        set_status(job_id, "validating")
        result = classify_educational(meta.full_text)
        save_validation(job_id, result)
        if not result["is_educational"]:
            mark_failed(
                job_id,
                failure_reason="non_educational",
                error_message="This content doesn't appear to be educational.",
            )
            return

        # 3. Chunk + embed + upsert
        set_status(job_id, "embedding")
        chunks = chunk_transcript(transcript, session_id=job_id, language=meta.language)
        await embed_and_upsert(chunks)

        # 4. Done
        set_status(job_id, "ready")

    except TranscriptionError as e:
        mark_failed(job_id, "transcription_failed", str(e))
    except EmbeddingError as e:
        mark_failed(job_id, "embedding_failed", str(e))
    except Exception as e:
        log.exception("ingest job %s crashed", job_id)
        mark_failed(job_id, "unknown", "An unexpected error occurred. Please try again.")
    finally:
        # Clean up temp file for upload paths
        if source_type == "upload":
            cleanup_temp(payload.get("temp_path"))
```

**Async vs sync trade-off:** OpenAI/Groq SDKs ship async clients (`openai.AsyncOpenAI`, `groq.AsyncGroq`). yt-dlp and ffmpeg are sync but invoked via `asyncio.to_thread`. FastAPI's `BackgroundTasks.add_task` accepts coroutines via the workaround:

```python
# routes/ingest.py
def _enqueue(bg: BackgroundTasks, coro):
    bg.add_task(asyncio.run, coro)
```

(Or simpler: have the orchestrator synchronously kick off `asyncio.create_task` from within an async background function — pick one and document it inside the orchestrator file.)

---

## 12. Transcription Strategies

### 12.1 YouTube — `pipeline/transcription/youtube.py`

**Caption-first strategy** per Stage 0 TRD §5.

1. Validate URL via `utils/youtube_url.py` → extract `video_id`.
2. Get metadata only (no download) via `yt_dlp.YoutubeDL({"skip_download": True, "quiet": True}).extract_info(url)`.
   - Capture: `title`, `duration`.
3. Try native captions:
   ```python
   from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
   try:
       segments = YouTubeTranscriptApi.get_transcript(video_id, languages=["en", "hi"])
       used_native_captions = True
       transcript = [
           {"start": s["start"], "end": s["start"] + s["duration"], "text": s["text"]}
           for s in segments
       ]
       language = "en"  # YouTubeTranscriptApi returns the matched lang code
   except (TranscriptsDisabled, NoTranscriptFound):
       used_native_captions = False
       audio_path = download_audio(url)
       transcript, language = await asr_transcribe(audio_path)
       cleanup(audio_path)
   ```
4. Build `transcript_json` per Stage 0 TRD §12 schema and `full_text = " ".join(s["text"] for s in transcript)`.
5. Return `(transcript_json, IngestMeta(...))`.

**Audio download (when captions unavailable):**

```python
ydl_opts = {
    "format": "bestaudio/best",
    "outtmpl": "/tmp/%(id)s.%(ext)s",
    "postprocessors": [{
        "key": "FFmpegExtractAudio",
        "preferredcodec": "mp3",
        "preferredquality": "64",
    }],
    "quiet": True,
}
```

Mono downsample is handled by `services/ffmpeg_audio.py` if needed.

### 12.2 Upload — `pipeline/transcription/upload.py`

1. Receive temp video path from the route.
2. Extract audio via FFmpeg → mono 16 kHz mp3 in `/tmp`:
   ```python
   ffmpeg.input(video_path).output(audio_path, ac=1, ar=16000, format="mp3").run(quiet=True, overwrite_output=True)
   ```
3. `language, duration = ffprobe(video_path)` for `duration_seconds`. If language tag absent (almost always the case), pass `None` to ASR and let Whisper detect.
4. Send the mp3 to Groq Whisper.
5. Build the same `transcript_json` shape.
6. Always delete both temp files in `finally`.

`used_native_captions = None` for non-YouTube sources.

### 12.3 Pasted text — `pipeline/transcription/text.py`

No real transcription. Fabricate the transcript shape so downstream code is uniform:

```python
def synthesize_transcript_from_text(text: str) -> tuple[dict, IngestMeta]:
    cleaned = normalize_whitespace(text)
    transcript = [{"start": 0.0, "end": 0.0, "text": cleaned}]
    language = detect_language_quick(cleaned)   # see below
    return (
        {
            "transcript": transcript,
            "full_text": cleaned,
            "detected_language": language,
            "duration_seconds": None,
            "used_native_captions": None,
        },
        IngestMeta(full_text=cleaned, language=language, duration=None,
                   used_native_captions=None, title=title_from_text(cleaned)),
    )
```

**Language detection for pasted text:** call GPT-4o-mini once with a tiny prompt that returns `{"language": "en" | "hi"}`. We avoid pulling in `langdetect` / `fasttext` for one call. Treat Hinglish → `"hi"` since the user types in Latin script but downstream embedding is multilingual.

Timestamp-less chunks still flow through the pipeline cleanly — `start_time` and `end_time` will all be `0.0`, and the citation popover simply shows `0:00 – 0:00` (acceptable for V1 paste-mode).

### 12.4 ASR wrapper — `pipeline/transcription/asr.py`

```python
# Groq Whisper returns the language *name* (e.g. "english"), not the ISO code.
# Map to lowercase ISO 639-1 to match the captions path. V1 targets en + hi.
_NAME_TO_ISO = {"english": "en", "hindi": "hi"}

async def asr_transcribe(audio_path: str) -> tuple[list[dict], str]:
    with open(audio_path, "rb") as f:
        rsp = await groq_client.get().audio.transcriptions.create(
            file=(os.path.basename(audio_path), f.read()),
            model=settings().GROQ_WHISPER_MODEL,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )
    segments = [
        {"start": seg["start"], "end": seg["end"], "text": seg["text"]}
        for seg in rsp.segments
    ]
    language = _NAME_TO_ISO.get((rsp.language or "").strip().lower(), "en")
    return segments, language
```

> **Why the name→ISO mapping (not `rsp.language[:2]`):** Groq's `verbose_json` returns the language *name* (`"english"`, `"hindi"`), not an ISO code. Slicing to 2 chars happens to work for English/Hindi by coincidence and produces wrong codes for other languages (e.g. `"spanish"[:2] = "sp"`, real ISO is `"es"`). The captions path already returns lowercase ISO codes from `youtube-transcript-api` — both paths must match so `detected_language` is consistent across rows.

If Groq returns 4xx/5xx → raise `TranscriptionError("ASR transcription failed")` for the orchestrator to catch.

---

## 13. Educational Validation (`src/pipeline/validation.py`)

```python
def classify_educational(full_text: str) -> dict:
    sample = full_text[:VALIDATION_SAMPLE_CHARS]
    rsp = openai_client.get().chat.completions.create(
        model=settings().GEN_MODEL,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": VALIDATION_SYSTEM_PROMPT},
            {"role": "user", "content": f"TRANSCRIPT SAMPLE:\n{sample}"},
        ],
    )
    return json.loads(rsp.choices[0].message.content)
    # → {"is_educational": bool, "reason": str}
```

Prompt verbatim in §17.4. On any exception → re-raise as `EmbeddingError` is wrong; just allow the orchestrator's general `Exception` branch to catch it as `unknown`.

---

## 14. Chunking (`src/pipeline/chunking.py`)

```python
import tiktoken
from langchain_text_splitters import RecursiveCharacterTextSplitter
import uuid

ENC = tiktoken.get_encoding("cl100k_base")
def _toklen(text: str) -> int:
    return len(ENC.encode(text))

splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_TARGET_TOKENS,
    chunk_overlap=CHUNK_OVERLAP_TOKENS,
    length_function=_toklen,
    separators=["\n\n", "\n", ". ", " ", ""],
)

def chunk_transcript(transcript_json: dict, session_id: str, language: str) -> list[dict]:
    segments = transcript_json["transcript"]
    full_text, segment_spans = _build_text_with_spans(segments)
    pieces = splitter.split_text(full_text)
    chunks = []
    cursor = 0
    for idx, text in enumerate(pieces):
        start_offset = full_text.find(text, cursor)
        end_offset = start_offset + len(text)
        cursor = max(cursor, start_offset)   # forward only
        start_time, end_time, speaker_set = _spans_for(segment_spans, start_offset, end_offset)
        chunk_id = str(uuid.uuid4())
        chunks.append({
            "chunk_id": chunk_id,
            "session_id": session_id,
            "chunk_index": idx,
            "text": text,
            "start_time": start_time,
            "end_time": end_time,
            "speaker_set": list(speaker_set),
            "language": language,
            "prev_chunk_id": None,
            "next_chunk_id": None,
        })
    # Wire prev/next pointers in a second pass
    for i, c in enumerate(chunks):
        c["prev_chunk_id"] = chunks[i-1]["chunk_id"] if i > 0 else None
        c["next_chunk_id"] = chunks[i+1]["chunk_id"] if i+1 < len(chunks) else None
    return chunks
```

**`_build_text_with_spans`** concatenates all `text` fields from segments into `full_text`, recording the `(char_start, char_end, segment_start_time, segment_end_time, speaker)` of each segment. **`_spans_for`** finds all segments overlapping `[start_offset, end_offset)` and returns `(min_start_time, max_end_time, set_of_speakers)`.

For pasted text (one synthetic segment with `start=end=0.0`), every chunk gets `start_time = end_time = 0.0` and `speaker_set = []`. That's fine.

**Token budget rationale:** 500 target × 5 chunks = 2,500 tokens of context per query. Plus system prompt (~400) + summary (~150) + recent turns (~600) + query (~50) ≈ 3,700 tokens — safely within GPT-4o-mini's 128k window with massive headroom.

---

## 15. Embedding + Qdrant Upsert (`src/pipeline/embedding.py`)

```python
async def embed_and_upsert(chunks: list[dict]) -> None:
    if not chunks:
        return
    texts = [c["text"] for c in chunks]
    vectors: list[list[float]] = []
    for batch_start in range(0, len(texts), EMBED_BATCH_SIZE):
        batch = texts[batch_start : batch_start + EMBED_BATCH_SIZE]
        rsp = await openai_client.get().embeddings.create(
            model=settings().EMBED_MODEL,
            input=batch,
        )
        vectors.extend([d.embedding for d in rsp.data])

    points = [
        {
            "id": c["chunk_id"],
            "vector": vec,
            "payload": {k: c[k] for k in (
                "session_id", "chunk_id", "chunk_index", "text",
                "start_time", "end_time", "speaker_set", "language",
                "prev_chunk_id", "next_chunk_id",
            )},
        }
        for c, vec in zip(chunks, vectors)
    ]
    qdrant_client.get().upsert(
        collection_name=settings().QDRANT_COLLECTION,
        points=points,
        wait=True,
    )
```

Wrap any OpenAI/Qdrant exception as `EmbeddingError("Embedding failed")` so the orchestrator marks `failure_reason = embedding_failed`.

---

## 16. RAG Pipeline

### 16.1 Augmentation (`src/rag/augment.py`)

One LLM call returns both the augmented query and the language. JSON mode for safety.

```python
async def augment_query(query_text: str, conversation_summary: str | None,
                        recent_turns: list[Turn]) -> dict:
    rsp = await openai_client.get().chat.completions.create(
        model=settings().GEN_MODEL,
        temperature=0.2,
        max_tokens=160,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": AUGMENT_SYSTEM_PROMPT},
            {"role": "user", "content": _build_augment_user(
                query_text, conversation_summary, recent_turns)},
        ],
    )
    return json.loads(rsp.choices[0].message.content)
    # → {"augmented_query": str, "query_language": "english"|"hindi"|"hinglish"}
```

### 16.2 Retrieval (`src/rag/retrieve.py`)

```python
async def embed_query(text: str) -> list[float]:
    rsp = await openai_client.get().embeddings.create(
        model=settings().EMBED_MODEL,
        input=[text],
    )
    return rsp.data[0].embedding

def search(session_id: str, vector: list[float]) -> list[Citation]:
    # qdrant-client >=1.12 removed .search(); the replacement .query_points()
    # returns a QueryResponse whose .points attribute holds the hit list.
    res = qdrant_client.get().query_points(
        collection_name=settings().QDRANT_COLLECTION,
        query=vector,
        query_filter={"must": [{"key": "session_id", "match": {"value": session_id}}]},
        limit=settings().TOP_K,
        with_payload=True,
    )
    hits = res.points
    citations = []
    for h in hits:
        if h.score < settings().MIN_SIMILARITY_SCORE:
            continue
        p = h.payload
        citations.append(Citation(
            chunk_id=p["chunk_id"],
            text=p["text"],
            timestamp_start=p["start_time"],
            timestamp_end=p["end_time"],
            relevance_score=h.score,
            speaker_set=p.get("speaker_set", []),
        ))
    return citations
```

Threshold filtering happens **after** retrieval — Qdrant returns top-K by similarity, then we drop anything under 0.72. If 0 chunks survive → caller returns the insufficient-context refusal.

### 16.3 Generation (`src/rag/generate.py`)

```python
async def generate_answer(
    query_text: str, query_language: str,
    citations: list[Citation],
    conversation_summary: str | None, recent_turns: list[Turn],
) -> str:
    system = SYSTEM_PROMPT.format(
        language_name=query_language.capitalize(),
        summary_block=_render_summary(conversation_summary),
    )
    context_block = _render_chunks(citations)
    messages = [{"role": "system", "content": system + "\n\n" + context_block}]
    for t in recent_turns:
        messages.append({"role": t.role, "content": t.content})
    messages.append({"role": "user", "content": query_text})

    rsp = await openai_client.get().chat.completions.create(
        model=settings().GEN_MODEL,
        temperature=0.3,
        max_tokens=800,
        messages=messages,
    )
    return rsp.choices[0].message.content.strip()
```

`_render_chunks` formats citations as a numbered block (1-indexed) so the model can emit `[1]`, `[2]` matching the order returned to the FE:

```text
[1] (00:12 – 01:29, Instructor)
An eigenvector of a matrix A is...

[2] (02:04 – 02:55)
...
```

### 16.4 Compaction (`src/rag/compact.py`)

The server cannot infer the true turn position from `recent_turns` alone — the FE caps that array at the last 4 turns, so once we're past turn 4 the count plateaus. The client therefore sends `turn_count` (number of user turns **before** the current one) with every request, and the server uses it as the single source of truth for compaction cadence.

```python
def should_compact(turn_count: int) -> bool:
    """True on the 4th, 8th, 12th, ... user turn overall.

    `turn_count` is the number of user turns BEFORE this one.
    The current turn is the (turn_count + 1)-th user turn.
    """
    return (turn_count + 1) % COMPACTION_INTERVAL == 0


async def compact_history(
    prior_summary: str | None,
    recent_turns: list[Turn],
    current_user: str,
    current_assistant: str,
) -> str:
    rsp = await openai_client.get().chat.completions.create(
        model=settings().GEN_MODEL,
        temperature=0.2,
        max_tokens=200,
        messages=[
            {"role": "system", "content": COMPACTION_SYSTEM_PROMPT},
            {"role": "user", "content": _build_compaction_user(
                prior_summary, recent_turns, current_user, current_assistant)},
        ],
    )
    return rsp.choices[0].message.content.strip()
```

The client treats a `null` `conversation_summary` in the response as "keep your existing summary" (FE plan §10). Compaction always replaces the prior summary with the fresh one — it is *cumulative* (the LLM is given the prior summary and the recent turns and asked to fold them together).

### 16.5 Endpoint glue (`src/routes/rag.py`)

```python
@router.post("/rag/query", response_model=RagResponse)
async def query(req: RagRequest) -> RagResponse:
    job = get_job(req.session_id)
    if not job:
        raise AppError("invalid_session", "This session is no longer available.", 404)
    if job["status"] != "ready":
        raise AppError("invalid_session", "This session is not ready yet.", 404)

    aug = await augment_query(req.query_text, req.conversation_summary, req.recent_turns)
    vec = await embed_query(aug["augmented_query"])
    citations = search(req.session_id, vec)

    if not citations:
        return RagResponse(
            response=ResponseBody(
                text=INSUFFICIENT_CONTEXT_REFUSAL[aug["query_language"]],
                language=aug["query_language"],
            ),
            conversation_summary=None,
            citations=[],
        )

    answer = await generate_answer(
        query_text=req.query_text,
        query_language=aug["query_language"],
        citations=citations,
        conversation_summary=req.conversation_summary,
        recent_turns=req.recent_turns,
    )

    new_summary = None
    if should_compact(req.turn_count):
        new_summary = await compact_history(
            prior_summary=req.conversation_summary,
            recent_turns=req.recent_turns,
            current_user=req.query_text,
            current_assistant=answer,
        )

    return RagResponse(
        response=ResponseBody(text=answer, language=aug["query_language"]),
        conversation_summary=new_summary,
        citations=citations,
    )
```

Wrap exceptions in `generate_answer` / `embed_query` so they surface as `generation_failed` (500).

---

## 17. Prompts (Verbatim)

These live in `src/rag/prompts.py` (and `src/pipeline/prompts.py` for ingest-side prompts). Put them at module top as `Final` constants. Do not template-rewrite at call time.

### 17.1 `SYSTEM_PROMPT` — answer generation

```text
You are Gazelle, an educational AI tutor. You answer questions strictly using the
RETRIEVED CONTEXT below, which comes from a single video the user uploaded.

Rules:
1. Answer in {language_name}. Match the user's language exactly.
2. Stay grounded in the RETRIEVED CONTEXT. Do not introduce facts not present there.
3. Cite every claim with bracketed numbers like [1], [2] referring to the numbered
   chunks below. Place the citation IMMEDIATELY after the sentence it supports.
   Citation numbers are 1-indexed and correspond exactly to the order of the chunks
   in RETRIEVED CONTEXT.
4. If the context does not contain enough information to answer, say so explicitly
   in {language_name}. Do not guess.
5. Keep answers focused and pedagogical — explain like a patient tutor, not a
   summarizer. Use short paragraphs. Avoid headings.

{summary_block}
```

`summary_block` is either empty or:
```text
CONVERSATION SUMMARY (older turns, for context):
<the summary>
```

### 17.2 `AUGMENT_SYSTEM_PROMPT` — query augmentation + language detection

```text
You rewrite a user's question to be a self-contained retrieval query for a
semantic search over an educational video transcript.

Output strict JSON with two fields:
{
  "augmented_query": "<rewritten query>",
  "query_language": "<english|hindi|hinglish>"
}

Rules:
- Resolve pronouns and follow-ups using the RECENT CONVERSATION and SUMMARY.
- Keep the original language of the user query.
- Do NOT answer the question. Do NOT add facts.
- Keep the rewrite under 30 words.
- "hinglish" means Hindi written in Latin script or mixed with English words.
```

The user message is built as:
```text
SUMMARY: <conversation_summary or "(none)">
RECENT:
  user: ...
  assistant: ...
QUESTION: <query_text>
```

### 17.3 `COMPACTION_SYSTEM_PROMPT` — every-4th-turn summary

```text
You maintain a running summary of an educational tutoring conversation about a
single video. Update the PRIOR SUMMARY with the new exchanges so future retrieval
calls have the topics, conclusions, and open threads — without verbatim history.

Rules:
- 3–5 sentences max. Plain prose, no lists.
- Preserve the language(s) used in the conversation.
- Capture: topics covered, key conclusions, unresolved questions.
- Do NOT include the most recent verbatim turn — those are kept separately.
```

User message:
```text
PRIOR SUMMARY: <prior_summary or "(none yet)">

RECENT TURNS:
  user: ...
  assistant: ...
  ...

LATEST EXCHANGE (also include in summary):
  user: <current_user>
  assistant: <current_assistant>
```

### 17.4 `VALIDATION_SYSTEM_PROMPT` — educational classifier

```text
Classify whether the following transcript sample is from EDUCATIONAL content
(lecture, tutorial, course, explainer, instructional video) or NOT (entertainment,
vlog, podcast chatter, music, ads, news commentary without instructional intent).

Respond with strict JSON:
{
  "is_educational": true | false,
  "reason": "<one short sentence>"
}

Be permissive: science, math, programming, history, literature, finance, art
tutorials, language lessons, and how-to content are all EDUCATIONAL. A talk-show
interview without teaching intent is NOT.
```

### 17.5 Refusal text — `INSUFFICIENT_CONTEXT_REFUSAL`

```python
INSUFFICIENT_CONTEXT_REFUSAL = {
    "english":  "I couldn't find this in the uploaded content. Could you rephrase, or ask about something covered in the video?",
    "hindi":    "मुझे यह जानकारी अपलोड किए गए कंटेंट में नहीं मिली। कृपया प्रश्न दूसरे शब्दों में पूछें या वीडियो में मौजूद किसी विषय पर पूछें।",
    "hinglish": "Mujhe yeh information uploaded content mein nahi mili. Thoda rephrase karke ya video mein cover hue topic par puchhiye.",
}
```

---

## 18. Error Handling

### 18.1 Internal exception

```python
class AppError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code, self.message, self.status = code, message, status

@app.exception_handler(AppError)
async def app_error_handler(_req, exc: AppError):
    return JSONResponse(
        status_code=exc.status,
        content={"error": {"code": exc.code, "message": exc.message}},
    )
```

### 18.2 Code → status → trigger matrix

| Code | HTTP | Where raised | Message (default) |
|---|---|---|---|
| `invalid_input` | 400 | request validation, ingest endpoints, RAG endpoint | varies — pass through Pydantic / hand-written |
| `invalid_session` | 404 | `GET /job/{id}`, `POST /rag/query` | "This session is no longer available." |
| `insufficient_context` | 200 | `POST /rag/query` (returned in body, not envelope) | refusal text per language map |
| `stt_failed` | 500 | `POST /stt` | "Couldn't transcribe audio." |
| `generation_failed` | 500 | `POST /rag/query`, `POST /tts` | "Something went wrong generating the response." |

The FE plan's §11 humanizes these — keep the codes stable, the messages can be terse on the backend.

### 18.3 Validation errors

FastAPI's default 422 is verbose. Override with a handler that maps `RequestValidationError` → `invalid_input` 400 envelope so the FE matrix has one shape to switch on:

```python
@app.exception_handler(RequestValidationError)
async def validation_handler(_req, exc):
    return JSONResponse(
        status_code=400,
        content={"error": {"code": "invalid_input", "message": _humanize(exc.errors())}},
    )
```

### 18.4 Job-failure surfacing

When a background job fails, `GET /job/{id}` returns:

```json
{
  "job_id": "...",
  "status": "failed",
  "failure_reason": "non_educational",
  "error_message": "This content doesn't appear to be educational.",
  "created_at": "..."
}
```

FE switches on `failure_reason` enum (no string pattern-matching needed). FE plan §11 will be updated by FE owner to consume this; until then `error_message` is sufficient.

---

## 19. Logging

Use stdlib `logging` only. JSON-ish line format is enough for Render's log viewer.

```python
# src/core/logging.py
import logging, sys, json, time

class JsonFormatter(logging.Formatter):
    def format(self, r):
        payload = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(r.created)),
            "level": r.levelname,
            "logger": r.name,
            "msg": r.getMessage(),
        }
        if r.exc_info:
            payload["exc"] = self.formatException(r.exc_info)
        return json.dumps(payload, ensure_ascii=False)

def setup_logging(level: str):
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [h]
    root.setLevel(level)
```

**What to log (per Stage 2 TRD §617):**

In `rag/`:
- `query.received` — `{session_id, query_text}`
- `query.augmented` — `{augmented_query, query_language}`
- `retrieval.done` — `{chunk_ids: [...], scores: [...], filtered_count}`
- `generation.done` — `{latency_ms, response_chars}`
- `refusal.insufficient_context` — `{session_id, augmented_query}`

In `pipeline/`:
- `ingest.start` / `transition` / `ready` / `failed` with `{job_id, status, failure_reason}`

Do **not** log full transcripts or full chunks — emit IDs and lengths.

---

## 20. CORS

Implementation lives in `src/main.py` per §6. The complete rationale, gotchas, and verification protocol live in `plan/implementation/backend/cors-caution.md` — that file is the source of truth for CORS. Do not duplicate its content here. Just include the middleware before route registration and verify in a real browser, not curl.

---

## 21. Manual Test Checklist

Run through this end-to-end before declaring "done." **No automated tests required for V1** — same trade-off as the FE plan.

### Local boot
- [ ] `pip install -r requirements.txt` clean.
- [ ] `uvicorn src.main:app --reload --port 8000` starts without exceptions.
- [ ] `GET /health` → `{"status":"ok"}`.
- [ ] `GET /sessions` → `{"sessions":[]}` (Supabase reachable).
- [ ] On startup logs, see "Startup complete." and Qdrant collection log line.

### Ingest — YouTube (with native captions)
- [ ] `POST /ingest/youtube` with `https://www.youtube.com/watch?v=<short-lecture>` → 202 with `job_id`.
- [ ] `GET /job/{id}` cycles `pending → transcribing → validating → embedding → ready` within ~30–60s.
- [ ] Final `GET /job/{id}` shows `used_native_captions: true`, `detected_language`, `duration_seconds`.
- [ ] Qdrant collection has new points filterable by `session_id == job_id`.

### Ingest — YouTube (no native captions, ASR fallback)
- [ ] Use a video known to have captions disabled. Same checks. Job takes longer (~1–3 min depending on length).
- [ ] `used_native_captions: false`.

### Ingest — Upload
- [ ] `POST /ingest/upload` with a 30 MB MP4. Returns 202.
- [ ] Job reaches `ready`. Temp file removed from `/tmp` after job completes (verify with `ls /tmp`).
- [ ] Wrong extension (e.g., `.txt`) → 400 `invalid_input`.
- [ ] File > 500 MB → 400 `invalid_input`.

### Ingest — Text
- [ ] `POST /ingest/text` with 200 chars → 202; reaches `ready`.
- [ ] `POST /ingest/text` with 50 chars → 400 `invalid_input`.
- [ ] After ready, a few chunks exist with `start_time = end_time = 0.0`.

### Validation gate
- [ ] Submit a known non-educational video (a music clip). Job reaches `failed` with `failure_reason: "non_educational"`.

### RAG happy path
- [ ] On a ready session, `POST /rag/query` with a relevant question.
- [ ] Response includes citations; each citation has `text`, timestamps, `relevance_score >= 0.72`, `speaker_set`.
- [ ] `response.text` contains `[N]` markers matching `citations[]` order.
- [ ] `response.language` matches the query language.

### RAG insufficient context
- [ ] Ask an off-topic question (e.g., "Who is the president of France?" on a math lecture).
- [ ] Status 200 with `citations: []` and the language-appropriate refusal text in `response.text`.

### RAG conversation continuity
- [ ] Send 4 user turns. On the 4th, the response includes a non-null `conversation_summary`.
- [ ] On turns 1–3 and 5–7, `conversation_summary` is `null`.
- [ ] Turn 8 again returns a non-null summary.

### STT
- [ ] `POST /stt` with a 5-second webm/opus blob → 200 with non-empty `text`.
- [ ] Empty/garbage upload → 500 `stt_failed`.

### TTS
- [ ] `POST /tts` `{"text":"Hello","language":"en"}` → 200 audio/mpeg, plays in browser.
- [ ] `POST /tts` with text > 3,500 chars → returns audio of last-paragraph-truncated text.
- [ ] Hindi text with `language:"hi"` → plays acceptably.

### Errors
- [ ] `POST /rag/query` with unknown `session_id` → 404 `invalid_session`.
- [ ] `POST /rag/query` against a session in `pending` status → 404 `invalid_session`.
- [ ] Malformed JSON body → 400 `invalid_input`.

### CORS
- [ ] In Chrome DevTools, hit any endpoint from the FE running on `localhost:5173`. Request shows `Access-Control-Allow-Origin: http://localhost:5173`. No red console errors.
- [ ] Preflight `OPTIONS /rag/query` returns 200 with the right headers.

---

## 22. Out of Scope for V1 (Do Not Build)

- Auth / user accounts / API keys for FE
- Server-side conversation history persistence (FE manages it)
- Streaming responses (SSE / WebSockets)
- Streaming TTS, voice cloning, multiple TTS voices, audio caching
- Analytics / event pipeline / PostHog
- Cross-session retrieval, multi-document RAG, hybrid search, reranking, BM25
- Adaptive top-K, multi-query expansion, agentic retrieval
- A separate `/embed` or `/chunk` endpoint (Stage 1 chains automatically inside the same job)
- Resumable uploads, multipart upload, video file persistence in Supabase Storage
- Pre-computed lecture summaries (a noted future improvement in `summary.md`)
- Job cancellation / deletion endpoints
- Rate limiting, captcha, abuse prevention
- Background worker isolation (Celery / RQ / Cloud Tasks) — `BackgroundTasks` is enough
- Database migrations framework (Alembic) — one table, one SQL file in `hosting.md`
- Webhooks back to a frontend on job completion (FE polls)
- Auto-scaling beyond Render free tier

If a request touches anything in this list, push back and reference this section.

---

## 23. Deployment

Step-by-step Render deploy is in `plan/hosting/hosting.md` §10. Specifically:

- Root Directory: `gaz-server`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn src.main:app --host 0.0.0.0 --port $PORT`
- All env vars from §4 above (and `PYTHON_VERSION=3.11.9`)
- After first deploy: set `ALLOWED_ORIGINS` to include the Vercel production URL (per `cors-caution.md` §4) and let Render redeploy.

**Cold-start caveat:** Render free tier spins down after 15 min idle. The first request after idle takes 30–60s. The FE handles this with its toast (FE plan §17). Don't attempt to "fix" this — it's a hosting tier choice, not a bug.

**FFmpeg on Render:** the apt buildpack installs FFmpeg automatically when `ffmpeg-python` is in `requirements.txt` and uvicorn detects audio processing. If not, add a `aptfile` at the repo root with the single line `ffmpeg`.

---

## 24. Implementation Order (Suggested Sequence)

For a single developer or AI working through this end-to-end. Each step ends with a runnable, testable backend.

1. **Scaffold** (§3, §4, §6) — `gaz-server/src/...` tree, `requirements.txt`, `runtime.txt`, `.env.example`, `main.py` with CORS + health route only. `GET /health` works locally. **0.5 day.**
2. **Clients + Supabase wiring** (§9) — `clients/*`, `db/jobs_repo.py`, lifespan startup verifies env. `GET /sessions` returns `{"sessions": []}`. **Half a day.**
3. **Ingest endpoints, no pipeline yet** (§7.2–7.4) — three endpoints insert a job row and return 202. `GET /job/{id}` returns the row. No background work yet. **Half a day.**
4. **Transcription — YouTube captions** (§12.1) — implement caption fast-path only. Job moves `pending → transcribing → ready`. Skip ASR fallback initially. **Half a day.**
5. **Transcription — text + upload + ASR fallback** (§12.2–12.4) — round out the three sources. **One day.**
6. **Validation** (§13) — wire educational classifier; honor `failure_reason`. **Half a day.**
7. **Chunking** (§14) — implement splitter + span-mapping. Verify chunk counts and timestamp coverage on a real lecture. **Half a day.**
8. **Embedding + Qdrant upsert** (§15) — collection auto-creation + payload index on startup; batched upsert. Job reaches `ready`. **Half a day.**
9. **RAG happy path** (§16.1–16.3, §16.5) — augmentation, retrieve, generate. Hand-test with curl. **One day.**
10. **Threshold + refusal** (§16.2 filter, §17.5) — verify low-similarity case returns the language-correct refusal. **0.25 day.**
11. **Compaction** (§16.4) — verify `conversation_summary` returns null/non-null on the right cadence. **Half a day.**
12. **STT** (§7.7, `services/stt_service.py`) — record a webm in browser, hit endpoint, get text. **0.25 day.**
13. **TTS** (§7.9, `services/tts_service.py`) — stream mp3, paragraph-truncation logic. **0.25 day.**
14. **Error envelope unification** (§18) — every code returns the right shape. Hand-test each. **0.25 day.**
15. **Logging pass** (§19) — structured logs flowing to stdout for the events listed. **0.25 day.**
16. **Manual QA** (§21). **0.5 day.**
17. **Deploy to Render** (§23 + `hosting.md`). Set CORS, smoke-test from the Vercel-deployed FE. **0.25 day.**

Total: ~7 working days for a single competent dev. Each step ships behind no flags.

---

## 25. Things You Might Be Tempted To Do (And Shouldn't)

- **Add Celery / Redis / RQ.** `BackgroundTasks` is sufficient for the V1 job concurrency we expect (a handful of users). Adding a broker triples the moving parts.
- **Add SQLAlchemy or an ORM.** One table, three columns ever queried by name. `supabase-py` returns dicts. Keep it.
- **Build a separate Stage-1 trigger endpoint.** Stage 1 auto-chains inside the same background job (per Stage 1 TRD §1). The FE never calls "start embedding."
- **Persist audio or video in Supabase Storage.** Stage 0 TRD §9 says: temporary storage only, delete after transcription.
- **Cache embeddings or TTS audio.** Out of scope. Pay the per-query OpenAI cost; it's pennies.
- **Stream the LLM response.** Stage 2 TRD §468 is explicit: deferred. The FE doesn't have a stream consumer.
- **Add pgvector / FAISS / sentence-transformers.** Qdrant + OpenAI embeddings are the locked stack.
- **Run a separate "language detection" model (`langdetect`, `fasttext`).** GPT-4o-mini detects language as part of augmentation. One call, one result.
- **Add a richer chunking strategy** (LlamaIndex SemanticSplitter, character-based with embedding similarity boundaries). RecursiveCharacterTextSplitter with token-aware sizing is sufficient for V1 retrieval quality. Optimize later if recall complaints come in.
- **Build session DELETE / archive / rename endpoints.** Out of scope per FE plan §15.
- **Wire pytest with mocked SDKs.** Manual smoke test is the V1 acceptance gate.
- **Add `allow_credentials=True` or a wildcard origin.** See `cors-caution.md` §6, §7.
- **Increase `MIN_SIMILARITY_SCORE` "to be safe."** 0.72 is the locked starting point per Stage 2 TRD §430. Tune via experimentation, not opinion.
- **Add "smart" retries inside the orchestrator.** A failed job is failed; user retries. Don't hide flakiness.
- **Generate a TTS preview at answer time.** Stage 3 PRD §94 is explicit: TTS is on-demand only.

---

## 26. Open Questions

None at the time of writing — every previously-flagged ambiguity (§20 of the FE plan) was resolved before this document was finalized:

| FE plan question | Resolution (locked here) |
|---|---|
| Backend CORS allow list | Implemented per `cors-caution.md` §4 — `localhost:5173`, prod Vercel URL, `*.vercel.app` regex. |
| Citation marker convention | System prompt §17.1 instructs `[N]` markers, 1-indexed, positionally aligned with `citations[]`. |
| Job-failure error codes | Structured `failure_reason` enum on `jobs` row, returned in `GET /job/{id}` (§5.1, §7.5, §18.4). |
| Polling interval (FE asks: 2s OK?) | Yes — backend imposes no rate limit. Bump to 3s only if Render shows load. |
| TTS truncation surfacing | Silent server-side truncation to 3,500 chars; FE infers from input length and shows the notice. |

If a new question arises during implementation, raise it in this document **before** writing the code that depends on the answer.

---

**End of plan.** This document is the contract. If something needs to change, change this file first, then change the code.
