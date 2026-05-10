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

## Implementation

### Status (as of 2026-05-10)
- **Backend (`gaz-server/`)** — feature-complete per `plan/implementation/backend/be-plan.md`. All 8 endpoints wired; full RAG pipeline (augment → embed → search → generate → maybe-compact) operational end-to-end.
- **Frontend (`app/`)** — not started.

### Backend — verification checklist

**Happy paths — verified ✅**
- `POST /ingest/youtube` captions fast-path — multiple videos
- `POST /ingest/youtube` ASR fallback via Groq Whisper
- Chunking → OpenAI embedding → Qdrant upsert
- `POST /rag/query` single-turn grounded answer with citations
- `POST /rag/query` multi-turn (turn 2 with `recent_turns`)
- `POST /rag/query` 4th-turn compaction (`conversation_summary` flips non-null) — verified at turn 4 and again at turn 8 to confirm cumulative cadence (`(turn_count + 1) % 4 == 0`); summary correctly threads prior summary + recent turns
- `POST /rag/query` refusal path on off-topic question
- `POST /ingest/text` paste-text path — skips transcription, chunking + embedding + Supabase row confirmed
- `POST /tts` — short English, Hindi-script input, and >3,500-char input. Long-text run audibly truncated at the expected paragraph boundary (`...stays useful over time.`), confirming `truncate_to_paragraph` at `tts_service.py:15` fires correctly.
- `POST /stt` — English and Hindi voice clips transcribed correctly via Groq Whisper, language auto-detected (Devanagari for Hindi, Latin for English) without us passing a hint. Mainstream language paths verified.
- `GET /health`, `GET /sessions`, `GET /job/{id}` happy paths

**Failure modes — verified ✅**
- `POST /ingest/youtube` content-gate refusal — non-educational video (post-match speech) → `status: failed`, `failure_reason: "non_educational"`
- `POST /ingest/youtube` invalid URL → `400 invalid_input` with "Enter a valid YouTube link"
- `POST /ingest/text` content-gate refusal — non-educational pasted text (sports biography) → `status: failed`, `failure_reason: "non_educational"`. Confirms the validation step in the shared orchestrator runs symmetrically across all three ingest paths.

**Pending verification ⏳**
- `POST /ingest/upload` (multipart + ffmpeg + Groq Whisper end-to-end)
- `POST /rag/query` against still-`pending` session → `404 invalid_session` *(shares the `get_job` status check with the verified happy path; expected to work)*

**Known minor issues — deferred until after FE wiring**
- `POST /stt` empty-transcript guard at `stt_service.py:21` did not trigger on a 2-second silent clip — Groq Whisper returned a hallucinated single-word transcript (`"miniature"`) instead of an empty string, so the guard's `if not text` branch was never entered. The guard logic itself is correct; the issue is that Whisper occasionally hallucinates content from silence rather than returning empty. Mainstream paths (real English/Hindi speech) are fine, so deferring fix until after frontend integration. Future fix options: tighten the guard with a min-length or confidence threshold, or filter known Whisper hallucination tokens.

### Dependency-drift fixes applied during smoke-testing
The skeleton was written against older snippets in `be-plan.md`; pip pulled newer libraries. Three surgical fixes — code + spec updated together:
1. **`youtube-transcript-api` v1.x rename** — `list_transcripts()` → `().list()`; `fetch()` now returns a dataclass needing `.to_raw_data()`. (`captions.py`)
2. **Groq Whisper language name → ISO map** — `verbose_json` returns names like `"english"`, not ISO codes. Slicing to 2 chars happened to work for en/hi but produced wrong codes for other languages. (`asr.py`)
3. **`qdrant-client` ≥ 1.12 API change** — `.search()` removed → `.query_points()`; `query_vector=` → `query=`; response unwrapped via `.points`. (`retrieve.py`)

### Prototype-only overrides
- `MIN_SIMILARITY_SCORE=0.2` in `gaz-server/.env` (spec default 0.72). Lowered while short test videos produce only 2–3 chunks. Revisit once realistic content distribution is in the index.

### Remaining work
- Burn through the 6 unexercised endpoints as a verification checklist.
- Frontend implementation per `plan/implementation/frontend/plan.md`.
- Re-tune `MIN_SIMILARITY_SCORE` against real retrieval-score distributions before locking the demo.

## Future Improvements

- **Whole-lecture summarization:** Top-k retrieval fails for "summarize the entire lecture" queries since chunks only cover fragments. Fix: generate a pre-computed summary at ingestion time and route summary-intent queries to it instead of the RAG path.

- Show and store chat history: create a separate table in supabase to store past conversations and reference them as and when needed. 
