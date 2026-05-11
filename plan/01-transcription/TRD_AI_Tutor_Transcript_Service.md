# Technical Requirements Document (TRD)
# AI Tutor – Transcript Ingestion Service (V1)

## 1. Technical Overview

This service is responsible for:
- input ingestion,
- transcript extraction/transcription,
- educational-content validation,
- and structured transcript generation.

The service boundary ends at transcript JSON generation.

---

# 2. Core Architecture

```text
             INPUT
                │
    ┌───────────┼───────────┐
    │           │           │
 YouTube     Upload      Raw Text
    │           │           │
    └──────┬────┴────┬──────┘
           │         │
    Transcript Extraction
           │
Educational Validation
           │
 Structured Transcript JSON
           │
        OUTPUT
```

---

# 3. Backend Stack

| Component | Choice |
|---|---|
| API Framework | FastAPI |
| Hosting | Render or Railway |
| Database | Supabase Postgres |
| ASR Engine | Groq Whisper API (uploads only) |
| YouTube Transcript | Supadata HTTP API (native + AI-generated handled server-side) |
| Audio Processing | FFmpeg (uploads only) |
| Async Processing | FastAPI BackgroundTasks (initially) |

---

# 4. Input Handling

## 4.1 YouTube URLs

### Flow

```text
YouTube URL
    ↓
Validate URL
    ↓
Supadata /v1/youtube/transcript
    ↓
Segments (start/end/text) + lang
```

Supadata returns native captions when available and AI-generated when not — we don't
maintain a separate fallback branch. Title comes from a best-effort YouTube oEmbed call;
duration is derived from the last segment's end time.

### Validation Rules

- Accept only valid YouTube URLs
- Reject all non-YouTube URLs
- Return structured error response on failure

---

## 4.2 Local Uploads

### Supported Formats
- MP4
- MOV
- AVI
- MKV (optional)

### Constraints
- Maximum upload size: 500MB

### Processing Flow

```text
Upload
    ↓
Temporary File Storage
    ↓
Audio Extraction
    ↓
ASR
```

---

## 4.3 Raw Transcript Upload

### Constraints
- Plain text only
- No PDF parsing
- No OCR
- No document extraction

---

# 5. Transcription Strategy

## 5.1 YouTube — Supadata

YouTube transcription is a single HTTP call to Supadata. Supadata internally prefers native
captions and falls back to AI-generated transcription; both paths return the same response
shape with timestamped segments.

### Reasoning
- Avoids YouTube bot-walling on datacenter IPs (yt-dlp's failure mode in production)
- Eliminates cookie-rotation operational burden
- One vendor, one code path, native + generated covered

## 5.2 Uploads — Groq Whisper

Uploaded video files still go through FFmpeg audio extraction → Groq Whisper ASR. This
path doesn't touch YouTube and isn't affected by the Supadata swap.

---

# 6. ASR Provider

## Primary Provider
Groq Whisper API

### Reasons
- Multilingual support
- Hindi support
- Fast inference
- Free experimentation tier
- Minimal infrastructure burden

---

## ASR Requirements

The ASR system should:
- support English and Hindi,
- perform automatic language detection,
- return timestamps,
- and handle multilingual/code-mixed speech where possible.

---

# 7. Educational Validation

## Validation Flow

```text
Transcript Sample
    ↓
LLM Classification
    ↓
Educational / Non-Educational
```

---

## Validation Strategy

- Use transcript sample only
- Avoid sending full transcript
- Use lightweight model for classification

---

## Expected Output

```json
{
  "is_educational": true,
  "reason": "Lecture/tutorial content detected"
}
```

---

# 8. Async Processing

## Processing Model

All processing is asynchronous and spans both Stage 0 (transcription) and Stage 1 (chunking + embedding) as a single continuous pipeline.

### Flow

```text
Submit Job
    ↓
Return Job ID (session_id)
    ↓
Stage 0: Transcription
    ↓
Stage 1: Chunking + Embedding (auto-triggered on transcription completion)
    ↓
Ready for Queries
```

The client polls a single `job_id`. There is no separate API call to trigger Stage 1 — it begins automatically when transcription completes. See Stage 1 TRD (`plan/02-kb-embedding/transcript_grounded_chat_trd.md`) for chunking and embedding details.

### Unified Job Status Enum

```python
status: "pending" | "transcribing" | "validating" | "embedding" | "ready" | "failed"
```

| Status | Meaning |
|---|---|
| pending | Job created, processing not yet started |
| transcribing | Audio/video being transcribed (Stage 0) |
| validating | Educational content validation in progress |
| embedding | Chunking + embedding in progress (Stage 1) |
| ready | Knowledge base built, ready for queries |
| failed | Processing failed at any stage |

The frontend uses this enum to show progress indicators (see `plan/05-ui/requirements.md`).

---

# 9. Storage Strategy

## Temporary Storage

Uploaded media should:
- be stored temporarily during processing,
- and deleted after transcription completes.

---

## Persistent Storage

Persist only:
- transcript JSON,
- metadata,
- job status,
- validation result.

Do NOT persist uploaded media.

---

# 10. Database Schema (High Level)

## Jobs Table

Suggested fields:
- id (serves as both `job_id` and `session_id`)
- status (`pending | transcribing | validating | embedding | ready | failed`)
- source_type
- source
- created_at
- updated_at
- detected_language
- title
- duration_seconds
- used_native_captions
- transcript_json
- full_text
- validation_result
- error_message (null unless status = failed)

---

# 11. API Endpoints

Three separate ingest endpoints — one per input type. This avoids mixing `multipart/form-data` (file upload) with `application/json` (URL/text) in a single handler, keeps each route focused, and makes the API self-documenting.

---

## `POST /ingest/youtube`

Submit a YouTube URL for processing.

### Request

```json
{
  "url": "https://www.youtube.com/watch?v=..."
}
```

### Response (202 Accepted)

```json
{
  "job_id": "uuid",
  "status": "pending"
}
```

---

## `POST /ingest/upload`

Upload a local video file.

### Request

```text
Content-Type: multipart/form-data
Field: file (MP4, MOV, AVI, MKV — max 500 MB)
```

### Response (202 Accepted)

```json
{
  "job_id": "uuid",
  "status": "pending"
}
```

---

## `POST /ingest/text`

Submit a raw transcript paste.

### Request

```json
{
  "text": "Today we will discuss matrices..."
}
```

### Response (202 Accepted)

```json
{
  "job_id": "uuid",
  "status": "pending"
}
```

---

## `GET /job/{job_id}`

Poll job status. The client calls this on an interval until status = `ready` or `failed`.

### Response

```json
{
  "job_id": "uuid",
  "status": "embedding",
  "source_type": "youtube",
  "title": "Intro to Linear Algebra",
  "created_at": "ISO timestamp"
}
```

When status = `ready`, the full transcript metadata is available:

```json
{
  "job_id": "uuid",
  "status": "ready",
  "source_type": "youtube",
  "source": "https://youtube.com/...",
  "title": "Intro to Linear Algebra",
  "detected_language": "en",
  "duration_seconds": 5421,
  "created_at": "ISO timestamp"
}
```

When status = `failed`:

```json
{
  "job_id": "uuid",
  "status": "failed",
  "error_message": "ASR transcription failed"
}
```

---

## `GET /sessions`

List all sessions (jobs) for the session sidebar.

### Response

```json
{
  "sessions": [
    {
      "job_id": "uuid",
      "title": "Intro to Linear Algebra",
      "source_type": "youtube",
      "status": "ready",
      "created_at": "ISO timestamp"
    }
  ]
}
```

This endpoint queries the `jobs` table. It returns session metadata only — no conversation history. Conversation history is client-managed in V1 (see Stage 2 TRD). In future versions, a separate conversations table in Supabase will store chat history and this endpoint (or a dedicated `/sessions/{id}/history` endpoint) will return it.

---

# 12. Suggested Transcript JSON Schema

```json
{
  "job_id": "uuid",
  "status": "completed",
  "source_type": "youtube",
  "source": "https://youtube.com/...",
  "title": "Intro to Linear Algebra",
  "detected_language": "en",
  "duration_seconds": 5421,
  "used_native_captions": true,
  "educational_validation": {
    "is_educational": true,
    "reason": "Lecture/tutorial content detected"
  },
  "transcript": [
    {
      "start": 12.4,
      "end": 18.7,
      "text": "Today we will discuss matrices."
    }
  ],
  "full_text": "..."
}
```

---

# 13. Error Handling

## Expected Errors

| Scenario | Behavior |
|---|---|
| Invalid YouTube URL | Reject request |
| Unsupported upload format | Reject request |
| File too large | Reject request |
| Captions unavailable | Fallback to ASR |
| ASR failure | Return processing error |
| Non-educational content | Block downstream processing |

---

# 14. Deployment Notes

## Recommended Hosting

### Backend
- Render
- Railway

### Database
- Supabase Postgres

---

# 15. Explicit Non-Goals

The following are intentionally excluded from V1:

- Authentication
- Authorization
- User accounts
- Embeddings
- Vector databases
- RAG pipelines
- Semantic chunking
- PDF parsing
- OCR
- Arbitrary website scraping
- Realtime streaming
- Browser automation

---

# 16. Future Extensions (Out of Scope)

Potential future additions:
- additional Indic languages,
- user accounts,
- caching,
- analytics,
- transcript editing,
- realtime processing
