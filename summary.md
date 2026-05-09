# Gazelle — Summary

AI video tutor: submit a video, build a knowledge base, chat with it.

## Pipeline

Stages are planning categories, not sequential implementation phases — they form a single unified pipeline.

| # | Stage | Status |
|---|-------|--------|
| 0 | Transcription (video/YT/paste → structured transcript JSON) | PRD + TRD done |
| 1 | KB Embedding (transcript → chunks → embeddings → Qdrant) | PRD + TRD done |
| 2 | Query & RAG (input, augmentation, retrieval, generation, chat continuity) | PRD + TRD done |
| 3 | Response Rendering + TTS | Not started |
| 4 | UI/UX | Not started |

## Key Decisions

- **Stack:** FastAPI, Supabase Postgres, Groq Whisper, OpenAI embeddings, Qdrant
- **Transcript schema:** `transcript[]` is the canonical array key; `speaker` is optional
- **Session model:** `job_id` = `session_id` (1:1, deliberate V1 simplification)
- **Chunking:** Semantic, 400–600 tokens, 10–20% overlap, timestamps preserved
- **Retrieval isolation:** All queries scoped to a single session — no cross-session mixing
- **Content gate:** LLM classifier rejects non-educational content before processing
- **Languages:** English + Hindi, auto-detection
- **Generation LLM:** OpenAI GPT-4o-mini (same ecosystem as embeddings)
- **Voice query STT:** Groq Whisper (reused from Stage 0)
- **Chat history:** Client-managed, stateless server — two-tier context (compacted summary + last 4 turns)
- **Similarity threshold:** Required, value tuned via experimentation (starting at 0.72)
- **Philosophy:** Get the happy path working with good quality first, production-harden later

## User Journey

1. User opens the platform, starts a new chat, pastes a link / uploads a file / pastes text directly
2. Content is processed, indexed, chunked, and embedded in the background
3. Once complete, the user is notified and can start querying
4. User asks a question → RAG pipeline triggers → grounded answer returned → follow-up questions supported
5. User can create a new chat (new session) with a different video at any time
