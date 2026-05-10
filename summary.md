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
| `PATCH /job/{job_id}/archive` | 4 | Toggle `archived` flag on a session (sidebar "Archived" section) |
| `DELETE /job/{job_id}` | 4 | Hard-delete a session (Supabase row + Qdrant points, idempotent) |
| `GET /sessions` | 0 | List all sessions for sidebar + landing (includes `duration_seconds` + `detected_language` for the "Pick up where you left off" cards) |
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
- **Backend (`gaz-server/`)** — feature-complete per `plan/implementation/backend/be-plan.md` + amendments. 10 endpoints wired (8 original + `PATCH /job/{id}/archive` + `DELETE /job/{id}`). Full RAG pipeline operational end-to-end. CORS allow_methods extended to `[GET, POST, PATCH, DELETE, OPTIONS]`.
- **Frontend (`app/`)** — feature-complete + verified end-to-end. Vite + React 19, all 6 seams wired to BE, plus archive/delete UI, recent-activity sort, and document.body theming. All 12 happy/edge cases from FE plan §16 confirmed.

### Frontend — implementation summary
- **Tree:** `app/src/{api,components,hooks,lib}` per FE plan §3. 7 API helpers, 10 components, 2 hooks, 6 lib modules.
- **Real wiring landed in one refactor wave** (single visual-parity pass first, then mocks → real):
  - Seam 1 — `GET /sessions` on mount; sidebar groups by `relativeDate(created_at)`.
  - Seams 2+3 — `POST /ingest/{youtube|upload|text}` → `useJobPolling` (2s interval) drives `STATUS_TO_STAGE_INDEX` → auto-transition to chat on `ready`. Failed jobs render structured-`failure_reason` copy + "Try a different input".
  - Seam 4 — `POST /rag/query` with derived `turn_count`, `conversation_summary`, `recent_turns`. `insufficient_context` renders as a normal bubble.
  - Citation tokenizer (`[N]` regex) + `adaptCitation` (BE `timestamp_*`/`relevance_score` → UI `ts`/`relevance`).
  - Two-tier history protocol (summary + last 4 turns) per `lib/conversation.js`; backend owns compaction cadence via `(turn_count + 1) % 4 === 0`.
  - Seam 5 — `MediaRecorder` (webm/opus → mp4 fallback for Safari) + 8s auto-stop → `POST /stt` → fills draft (no auto-send).
  - Seam 6 — `POST /tts` → object URL → native `<Audio>` with progress + 3,500-char truncation note.
  - Errors: shared `humanizeError` for the toast layer; inline alerts for input validation; `failure_reason: "non_educational"` gets the bespoke copy.
  - A11y: aria-label/aria-pressed on mic, cite buttons; aria-live on the composer status; theme persisted to localStorage via `useTweaks`.

### Frontend — drift patches applied to `fe-plan.md` before implementation
1. §7 `api/job.js` JSDoc — added structured `failure_reason` enum to the `failed` response shape.
2. §8 Seam 4 — `asstMsg` now sets `responseText: res.response.text` (Seam 6 references it; was an inconsistency).
3. §11 — content-gate UI now branches on `job.failure_reason === "non_educational"` rather than pattern-matching `error_message`.

### Frontend — post-V1 UX amendments (full text in `fe-plan.md` §21)
1. **Theme on `document.body`** — replaced the wrapper `<div className={themeClass}>` pattern with `useEffect` that toggles theme class on `body`. Fixed the focus theme cascade bug where the main pane stayed cream while sidebar correctly turned dark. Plus `color-scheme: dark` on `.theme-focus` so native widgets match.
2. **Recent-activity sort in sidebar** — client-only `last_activity_at` field per session bumps on submit and on every send. Sidebar sorts desc + groups by `relativeDate(last_activity_at)`. In-memory only (V1 trade-off).
3. **Archive + delete sessions** — hover-revealed action buttons per row, status-aware: failed → Trash; ready → Archive (collapsible "Archived (N)" section at sidebar bottom); archived → Restore + Trash (delete forever). `<button>` rows refactored to `<div role="button">` to legally nest action buttons. New API helpers `archiveJob`, `deleteJob`. Three new icons: Archive, Restore, Trash.
4. **Landing-page hero redesign** (2026-05-10, branch `ui/hero-landing-page`) — replaced the tiny placeholder empty-state with an inviting hero: green "Ready when you are" pill → two-tone serif H1 ("What would you like / **to learn today?**") → green-ringed YouTube input bar with **Start →** → "Upload a file · Paste a transcript" link chips → 2×2 decorative suggestion cards ("Once it's indexed, try asking…") → 2 recent-ready session cards with `mm:ss · Language` ("Pick up where you left off"). Sidebar **New chat** also lands here (single canonical landing). Mode-switch chips drop into the existing `InputView` with `initialMode` preselected; eyebrow/title/sample-chips trimmed from `InputView` since the landing is the new hero. New files: `app/src/components/Landing.jsx`, `app/src/lib/validators.js` (shared `YOUTUBE_RE`). New icons: `Check`, `Target`. All `.landing-*` styles use existing CSS tokens so it themes cleanly under Scholar/Studio/Focus. Vertical paddings and title size use `clamp(min, vh, max)` and the container is `overflow: hidden` so the hero never scrolls — fits any viewport height by compressing typography and spacing. BE: `/sessions` SELECT extended to include `duration_seconds` + `detected_language`; `SessionRow` schema updated. No migration (columns already exist on the jobs table).

### Frontend — verification checklist (V1 demo-ready)

**Happy paths — verified ✅**
- App boot from cold: sidebar populates from `GET /sessions`; theme applies on body; archived collapsed by default
- New chat → YouTube URL → ProcessingView ring fills as `useJobPolling` advances stage labels → auto-transition to chat on `ready`
- Text query → assistant bubble with `[N]` citation markers → click `[1]` → CitationPopover with verbatim chunk text + mm:ss range + relevance %
- Multi-turn (4+ queries): verified `conversation_summary` non-null on the 4th request, `recent_turns` capped at 8 messages
- Voice input via MediaRecorder → `POST /stt` → text fills composer (no auto-send)
- TTS playback via native `<Audio>` with progress bar; pause works
- Theme switcher (Scholar / Studio / Focus) — persists across refresh; Focus now correctly dark across main panel + main panel text
- Recent-activity sort — sending a message in an old session bumps it to the top of "Today"
- Archive (ready session) → moves into "Archived (N)" section
- Restore (from archived) → moves back to active list
- Delete failed session → confirm → row gone (Supabase verified)
- Delete forever (from archived) → confirm → row gone (Supabase verified, Qdrant points cleaned)
- Submit non-educational content → ProcessingView flips to failure card with `failure_reason: "non_educational"` copy + "Try a different input"
- Off-topic query → backend `insufficient_context` rendered as a normal bubble (no special UI)
- Refresh → sidebar rehydrates; chat history clears (V1 deliberate)

**Manual QA — closed.** No blocking defects.

### Backend — verification checklist

**Happy paths — verified ✅**
- `POST /ingest/youtube` captions fast-path — multiple videos
- `POST /ingest/youtube` ASR fallback via Groq Whisper
- `POST /ingest/upload` (2026-05-10) — multipart video upload of a self-recorded clip about RAG → ffmpeg audio extraction → Groq Whisper transcription → chunk+embed → ready → grounded Q&A on the recorded content. End-to-end pipeline confirmed; closes the last unexercised ingest path.
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

**Session admin — verified ✅**
- `PATCH /job/{id}/archive {archived: true}` → row updates, returned `archived: true`; `GET /sessions` still includes the row with `archived: true` field
- `PATCH /job/{id}/archive {archived: false}` → restores, row returns to active list
- `DELETE /job/{id}` on failed session → 204; subsequent `GET /job/{id}` → 404 invalid_session; row gone from Supabase
- `DELETE /job/{id}` on ready session → 204; Qdrant points for that `session_id` are also gone (idempotent filter delete)
- CORS preflight: `OPTIONS /job/{id}/archive` and `OPTIONS /job/{id}` → 200 with proper Allow headers (after `allow_methods` extended to include PATCH + DELETE)

**Pending verification ⏳**
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

### Schema migrations applied
- **2026-05-10:** `alter table jobs add column archived boolean not null default false;` — supports the archive/delete UI per FE plan §21.3 + BE plan §27.3. Canonical CREATE TABLE in `plan/hosting/hosting.md` §6.2 also updated.

### Remaining work
- Re-tune `MIN_SIMILARITY_SCORE` against real retrieval-score distributions before locking the demo.
- Comprehensive UI/UX QA pass with a fresh eye now that the core demo is complete.

## Future Improvements

- **Whole-lecture summarization:** Top-k retrieval fails for "summarize the entire lecture" queries since chunks only cover fragments. Fix: generate a pre-computed summary at ingestion time and route summary-intent queries to it instead of the RAG path.

- Show and store chat history: create a separate table in supabase to store past conversations and reference them as and when needed. 
