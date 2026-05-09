# Gazelle — Stage 3 PRD (Product Requirements Document)

## Stage

Stage 3 — Response Rendering + TTS

---

# Objective

Convert generated RAG answers into a structured, renderable response format and support optional audio playback in the source language of the user query.

This stage formalizes the response contract between backend and frontend.

The user should be able to:

1. Ask a question
2. Receive a grounded answer
3. See source citations and timestamps used for generation
4. Click a speaker icon to hear the answer
5. Hear the response in the same language as the query

---

# Scope

Stage 3 includes:

- Structured response schema
- Frontend renderability
- Source chunk citations
- Video timestamp citations
- Multilingual response handling
- On-demand TTS generation
- Audio playback support
- Minimal UI playback interactions

---

# Out of Scope (V1)

The following are intentionally excluded from V1:

- Streaming responses
- Streaming TTS
- Voice cloning
- Emotion/prosody controls
- Multiple selectable voices
- Personalized voices
- Audio downloads
- Sentence-level audio sync
- Waveform visualizations
- Real-time voice conversations
- Audio caching optimization
- Analytics infrastructure
- Avatar/video generation
- Lip sync

---

# Core Product Decisions

## 1. Backend returns structured response object

The backend will no longer return free-form LLM text.

Instead, all responses are returned in a normalized schema.

## 2. Citation timestamps are a core requirement

Every generated answer should expose the source chunks used for generation.

The user should be able to:

- Inspect supporting chunks
- See corresponding timestamps
- Navigate back to the referenced portion of the source video later

This is treated as a foundational RAG trust feature and included from V1.

---

## 3. Source language playback

The spoken response should match the detected query language.

No manual language selection in V1.

When `query_language = "hinglish"`, use the Hindi voice. No additional TTS provider is needed — OpenAI TTS handles mixed-language text acceptably for V1.

---

## 4. Audio generation is ON-DEMAND

TTS API calls are triggered only when the user explicitly clicks the speaker icon.

Audio generation should NOT occur:

- when the answer is generated
- when the answer is rendered
- during page load
- during history retrieval

---

## 5. Audio is ephemeral in V1

Generated audio does not need persistent storage.

---

## 5a. Audio format

V1 uses **mp3** — universally supported across browsers, good compression, and the OpenAI TTS default.

---

## 5b. TTS text length cap

Soft cap of **3,500 characters** on TTS input. If the response exceeds this, truncate gracefully (first N paragraphs) rather than failing. This avoids OpenAI's 4,096-character API limit without affecting normal usage — 3,500 characters is ~600 words, well beyond a typical tutoring answer.

---

## 6. Single default voice per language

V1 uses one predefined voice per language.

---

## 7. Playback is asynchronous

Text rendering must never wait for TTS generation.

---

## 8. Graceful degradation on TTS failure

If TTS generation fails:

- text response remains fully usable
- playback failure should not interrupt chat
- retry should remain possible

---

# Canonical Response Schema

```json
{
  "response_id": "string",
  "session_id": "string",
  "query": {
    "text": "string",
    "language": "string"
  },
  "response": {
    "text": "string",
    "language": "string"
  },
  "citations": [
    {
      "chunk_id": "string",
      "timestamp_start": 0,
      "timestamp_end": 0,
      "relevance_score": 0.0
    }
  ],
  "conversation_summary": "string or null",
  "tts": {
    "available": true
  },
  "metadata": {
    "created_at": "ISO timestamp",
    "model": "gpt-4o-mini"
  }
}
```

### Schema Notes

- `conversation_summary` is inherited from the Stage 2 chat continuity contract. It is included only on compaction turns (every 4th turn), `null` otherwise. The client stores and sends this with subsequent requests. See Stage 2 PRD/TRD for full context.
- `query.language` and `response.language` reflect the detected language of the user query. Valid values: `"english"`, `"hindi"`, `"hinglish"`.

---

# Success Criteria

The system should:

- Return structured renderable responses
- Show timestamp citations from day one
- Support multilingual playback
- Trigger TTS only on demand
- Keep chat responsive regardless of TTS state
- Maintain extensibility for future features
