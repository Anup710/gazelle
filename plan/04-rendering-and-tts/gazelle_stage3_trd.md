# Gazelle — Stage 3 TRD (Technical Requirements Document)

## Stage

Stage 3 — Response Rendering + TTS

---

# Objective

Implement the infrastructure required for:

- structured RAG responses
- citation metadata propagation
- frontend rendering compatibility
- on-demand multilingual TTS generation
- browser audio playback

---

# System Architecture

```text
User Query
→ Stage 2 RAG Pipeline
→ Structured Response Object
→ Frontend Rendering
→ Speaker Button Click
→ /tts API
→ TTS Provider
→ Audio Stream/Blob
→ Browser Playback
```

---

# Backend Changes

## Existing Endpoint

> Defined in Stage 2 TRD (`plan/03-input-and-RAG/gazelle_stage2_trd.md`). Stage 3 extends the response schema; it does not create a separate route.

```text
POST /rag/query
```

This endpoint now returns a structured response schema (extended from Stage 2's internal output with citation metadata, relevance scores, and TTS availability).

---

## New Endpoint

```text
POST /tts
```

Purpose:

Generate audio from final rendered response text.

---

# Citation Propagation Requirements

The retrieval layer must propagate citation metadata into the final response.

Required fields:

| Field | Description |
|---|---|
| chunk_id | Original retrieved chunk identifier |
| text | Verbatim source chunk text (shown in citation popover) |
| timestamp_start | Start timestamp in source media |
| timestamp_end | End timestamp in source media |
| relevance_score | Retrieval similarity score |
| speaker_set | Speakers in the cited chunk (array, may contain one element) |

---

# TTS API

## Endpoint

```text
POST /tts
```

## Input

```json
{
  "text": "Backpropagation is...",
  "language": "en"
}
```

### Language Mapping for TTS

| query_language | TTS language parameter |
|---|---|
| english | en |
| hindi | hi |
| hinglish | hi |

Hinglish uses the Hindi voice. OpenAI TTS handles mixed-language text acceptably for V1.

### Text Length

Soft cap: **3,500 characters**. If response text exceeds this, truncate to the last complete paragraph within the limit. OpenAI TTS hard limit is 4,096 characters per call.

## Output

Audio response in **mp3** format (OpenAI TTS default, universal browser support).

Response type: `audio/mpeg` streamed via `StreamingResponse`.

---

# Recommended TTS Providers

## Preferred V1 Choice

### OpenAI TTS (`tts-1`)

Reasons:

- already using OpenAI ecosystem
- multilingual support (English, Hindi; handles Hinglish via Hindi voice)
- low integration overhead
- simpler infra management
- lowest latency among OpenAI TTS models
- cost: ~$15 per 1M characters

Expected latency: **1–3 seconds** for a typical ~200 word tutoring response. Acceptable since TTS is async (user sees a loading state on the speaker button).

---

# FastAPI Endpoint Design

## Query Endpoint

```python
@app.post("/rag/query")
async def query():
    return structured_response
```

## TTS Endpoint

```python
LANGUAGE_MAP = {"english": "en", "hindi": "hi", "hinglish": "hi"}
TTS_CHAR_LIMIT = 3500

@app.post("/tts")
async def generate_tts(payload):
    text = payload.text[:TTS_CHAR_LIMIT]
    language = LANGUAGE_MAP.get(payload.language, "en")

    audio = tts_provider.generate(
        text=text,
        language=language,
        response_format="mp3"
    )

    return StreamingResponse(audio, media_type="audio/mpeg")
```

---

# Recommended Internal Structure

```text
services/
  tts/
    provider.py
    openai_tts.py
```

---

# Frontend Requirements

## Response Card Component

```text
ResponseCard
 ├── response text
 ├── citations
 └── speaker button
```

---

# Speaker Button States

```text
Idle
Loading
Playing
Error
```

---

# Frontend Playback Flow

```text
click
→ fetch audio
→ create audio blob
→ browser play()
```

---

# Recommended V1 Priorities

Priority order:

1. Stable structured response schema
2. Citation propagation
3. Clean frontend rendering
4. On-demand TTS generation
5. Reliable playback UX
