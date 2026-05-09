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
| ASR Engine | Groq Whisper API |
| YouTube Extraction | yt-dlp |
| Native Captions | youtube-transcript-api |
| Audio Processing | FFmpeg |
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
Try Native Captions
    ↓
Fallback to ASR if unavailable
```

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

## 5.1 Caption-First Strategy

### YouTube Processing Priority

```text
Try Native Captions
        ↓
If unavailable:
Run ASR
```

### Reasoning
- Lower latency
- Lower cost
- Native captions are common for educational content

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

All transcription jobs should be asynchronous.

### Flow

```text
Submit Job
    ↓
Return Job ID
    ↓
Background Processing
    ↓
Status Polling
    ↓
Final Transcript Response
```

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
- id
- status
- source_type
- source
- created_at
- updated_at
- detected_language
- title
- duration_seconds
- used_native_captions
- transcript_json
- validation_result

---

# 11. Suggested Transcript JSON Schema

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

# 12. Error Handling

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

# 13. Deployment Notes

## Recommended Hosting

### Backend
- Render
- Railway

### Database
- Supabase Postgres

---

# 14. Explicit Non-Goals

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

# 15. Future Extensions (Out of Scope)

Potential future additions:
- additional Indic languages,
- user accounts,
- caching,
- analytics,
- transcript editing,
- realtime processing
