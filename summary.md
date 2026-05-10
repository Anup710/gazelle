# Gazelle — Summary

AI video tutor: submit a video, build a knowledge base, chat with it.

## Pipeline

Stages are planning categories, not sequential implementation phases — they form a single unified pipeline. Stage 0 and Stage 1 execute as a single continuous background job (auto-chained).

| # | Stage | Status |
|---|-------|--------|
| 0 | Transcription (video/YT/paste → structured transcript JSON) | PRD + TRD done |
| 1 | KB Embedding (transcript → chunks → embeddings → Qdrant) | PRD + TRD done |
| 2 | Query & RAG (input, augmentation, retrieval, generation, chat continuity) | PRD + TRD done |
| 3 | Response Rendering + TTS (structured schema, citations, on-demand audio) | PRD + TRD done |
| 4 | UI/UX (input, processing, chat, session sidebar) | Requirements done |

## Key Decisions

- **Stack:** FastAPI, Supabase Postgres, Groq Whisper, OpenAI embeddings, Qdrant, GPT-4o-mini
- **Frontend:** React prototype in `web-ui/project/` (CDN-based, design handoff for backend integration)
- **Hosting:** Render (backend), Supabase (DB), Qdrant Cloud (vectors), Vercel (frontend) — all free tier
- **Transcript schema:** `transcript[]` is the canonical array key; `speaker` is optional
- **Session model:** `job_id` = `session_id` (1:1, deliberate V1 simplification)
- **Job status enum:** `pending → transcribing → validating → embedding → ready → failed`
- **Chunking:** Semantic, 400–600 tokens, 10–20% overlap, timestamps preserved
- **Speaker metadata:** `speaker_set` (array) throughout the pipeline
- **Citation payload:** Each citation includes verbatim chunk `text` (alongside timestamps, relevance, speaker_set) so the frontend popover can show exact source content — zero extra retrieval cost since chunks are already in memory at response time
- **Retrieval isolation:** All queries scoped to a single session — no cross-session mixing
- **Content gate:** LLM classifier rejects non-educational content before processing
- **Languages:** English + Hindi, auto-detection
- **Generation LLM:** OpenAI GPT-4o-mini (same ecosystem as embeddings)
- **Voice query STT:** Groq Whisper (reused from Stage 0), exposed via `POST /stt`
- **Chat history:** Client-managed, stateless server — two-tier context (compacted summary + last 4 turns)
- **Session history:** Client-side only in V1 (no server persistence); variables retained as null for future use
- **Similarity threshold:** Required, value tuned via experimentation (starting at 0.72)
- **TTS:** OpenAI `tts-1`, on-demand only, mp3, 3,500 char soft cap
- **Philosophy:** Get the happy path working with good quality first, production-harden later

## API Endpoints

| Endpoint | Stage | Purpose |
|---|---|---|
| `POST /ingest/youtube` | 0+1 | Submit YouTube URL → returns `job_id`, triggers full pipeline |
| `POST /ingest/upload` | 0+1 | Upload video file (multipart) → returns `job_id`, triggers full pipeline |
| `POST /ingest/text` | 0+1 | Submit pasted transcript → returns `job_id`, triggers full pipeline |
| `GET /job/{job_id}` | 0+1 | Poll job status (`pending → transcribing → validating → embedding → ready`) |
| `GET /sessions` | 0 | List all sessions for sidebar (metadata only, no chat history) |
| `POST /stt` | 2 | Transcribe voice query to text (Groq Whisper) |
| `POST /rag/query` | 2+3 | Text query → RAG pipeline → structured response with citations |
| `POST /tts` | 3 | On-demand text-to-speech for a response |

## User Journey

1. User opens the platform, starts a new chat, pastes a link / uploads a file / pastes text directly
2. Content is processed, indexed, chunked, and embedded in the background (single job, status visible in UI)
3. Once complete (status = `ready`), the user can start querying
4. User asks a question (text or voice) → RAG pipeline triggers → grounded answer with citations returned → follow-up questions supported
5. User can create a new chat (new session) with a different video at any time

## Future Improvements

- **Whole-lecture summarization:** Top-k retrieval fails for "summarize the entire lecture" queries since chunks only cover fragments. Fix: generate a pre-computed summary at ingestion time and route summary-intent queries to it instead of the RAG path.

- Show and store chat history: create a separate table in supabase to store past conversations and reference them as and when needed. 
