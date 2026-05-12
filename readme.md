# Gazelle

AI video tutor. Submit a video (upload, YouTube link, or pasted transcript), Gazelle builds a knowledge base from it, and you chat with it via a grounded RAG pipeline — answers come back with `[N]` citations linked to verbatim chunks and `mm:ss` timestamps.

> **Status:** demo-ready monorepo. Backend + frontend wired end-to-end and manually verified.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vite + React 19 (`app/`) |
| Backend | FastAPI (`gaz-server/`) |
| DB | Supabase Postgres (sessions + chat history) |
| Vectors | Qdrant Cloud |
| Transcription | Groq Whisper (`whisper-large-v3-turbo`) |
| YouTube transcripts | Supadata HTTP API |
| Embeddings | OpenAI `text-embedding-3-small` |
| Generation | OpenAI `gpt-4o-mini` |
| TTS | OpenAI `tts-1` (on-demand) |
| Hosting | Render (BE), Vercel (FE), Supabase, Qdrant Cloud — all free tier |

## Repo layout

```
gazelle/
├── app/          # Vite + React frontend (shipping)
├── gaz-server/   # FastAPI backend (shipping)
├── web-ui/       # FROZEN — original CDN-prototype design artifact, read-only
├── plan/         # PRDs, TRDs, implementation plans (5 pipeline stages)
└── summary.md    # Living source-of-truth for decisions + status
```

`app/` and `gaz-server/` are independent — separate deps, separate envs, separate deploys. No cross-imports.

## Pipeline

One unified pipeline, planned in 5 stages:

0. **Transcription** — video / YouTube / pasted text → structured transcript JSON
1. **KB embedding** — semantic chunks (400–600 tokens, 10–20% overlap) → OpenAI embeddings → Qdrant
2. **Query & RAG** — text or voice query → retrieval (session-scoped) → grounded answer with citations
3. **Response rendering + TTS** — structured response schema, on-demand mp3
4. **UI/UX** — landing hero, processing view, chat, session sidebar (archive / delete / restore)

Stages 0+1 run as a single chained background job. Status enum: `pending → transcribing → validating → embedding → ready → failed`.

## Quickstart

### Backend

```bash
cd gaz-server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in keys — see comments in .env.example
uvicorn src.main:app --port 8000 --reload
```

Boot-time required: `SUPABASE_URL`, `SUPABASE_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`.
Job-time required: `OPENAI_API_KEY`, `GROQ_API_KEY`, `SUPADATA_API_KEY` (YouTube ingest only).

### Frontend

```bash
cd app
npm install
cp .env.example .env   # VITE_API_BASE_URL defaults to http://localhost:8000
npm run dev
```

## API

| Endpoint | Purpose |
|---|---|
| `POST /ingest/{youtube,upload,text}` | Submit content → returns `job_id`, kicks off pipeline |
| `GET /job/{job_id}` | Poll job status |
| `GET /sessions` | List all sessions (sidebar + landing) |
| `POST /rag/query` | Text query → grounded answer with citations |
| `POST /stt` | Voice query → text (Groq Whisper) |
| `POST /tts` | Response → mp3 |
| `PATCH /job/{id}/archive` | Toggle archived flag |
| `DELETE /job/{id}` | Hard-delete session (Supabase + Qdrant) |
| `GET /health` | Healthcheck |

## Key design decisions

- **`job_id == session_id`** — 1:1 simplification for V1.
- **Session-scoped retrieval** — no cross-session mixing.
- **Two-tier chat context** — compacted summary + last 4 turns. Backend owns compaction cadence (`(turn_count + 1) % 4 == 0`).
- **Chat history is server-persisted** (Supabase `chat_messages`), hydrated on session-select.
- **Content gate** — LLM classifier rejects non-educational uploads before chunking.
- **Citations carry verbatim chunk text** — popover shows source content without an extra retrieval round trip.

Full decision log: [`summary.md`](./summary.md).

## Limitations

- **No auth** — single-tenant prototype.


## License

See [LICENSE](./LICENSE).
