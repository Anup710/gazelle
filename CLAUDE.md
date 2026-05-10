# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is Gazelle

Gazelle is an AI video tutor: users submit a video (upload, YouTube link, or pasted transcript), a knowledge base is built from it, and they can chat with it via a RAG pipeline. This repo is a monorepo containing both the planning/specification documents and the shipping app code.

## Repository Structure

```
plan/                      # PRDs, TRDs, hosting plan, implementation plans
  pipeline.md              # Master pipeline overview (5 stages)
  transcription/           # Stage 0: PRD + TRD for transcript extraction
  kb-embedding/            # Stage 1: PRD + TRD for chunking & embedding
  input-and-RAG/           # Stage 2: PRD + TRD for query, retrieval, generation
  rendering-and-tts/       # Stage 3: PRD + TRD for response rendering + TTS
  ui/                      # Stage 4: UI/UX requirements
  hosting/                 # Hosting/infra planning
  implementation/          # FE + BE implementation plans
web-ui/                    # FROZEN — original CDN-prototype design artifact
app/                       # shipping frontend (Vite + React)
gaz-server/                # shipping backend (FastAPI)
summary.md                 # Living summary of decisions and status
```

## Pipeline Stages

Stages are **planning categories, not sequential phases** — they form one unified pipeline:

0. Transcription → 1. KB Embedding → 2. Query & RAG → 3. Response Rendering + TTS → 4. UI/UX

Stages 0–2 have finalized PRDs and TRDs. Stages 3–4 are not started.

## Key Technical Decisions

- **Stack:** FastAPI, Supabase Postgres, Groq Whisper, OpenAI embeddings, Qdrant, GPT-4o-mini
- **Session model:** `job_id` = `session_id` (1:1 simplification for V1)
- **Retrieval isolation:** All queries scoped to a single session
- **Chat history:** Client-managed, stateless server (compacted summary + last 4 turns)
- **Languages:** English + Hindi with auto-detection
- **Philosophy:** Happy path first, production-harden later

## Working Conventions

- `summary.md` is the source of truth for current status and key decisions — update it when decisions change.
- Each stage subdirectory contains a PRD and a TRD. Read both before proposing changes to a stage.
- All currencies in USD ($).

---

# Implementation

Monorepo layout (single `gazelle/` repo, three top-level peers):

```
gazelle/
  web-ui/       # FROZEN — design artifact / prototype reference. Do not modify.
  app/          # shipping frontend (Vite + React). src/ evolves from submodules per the FE plan.
  gaz-server/   # backend
```

`web-ui/` holds the original CDN-prototype handoff and is treated as read-only documentation of the intended visual + interaction design. The live frontend is `app/`, which is scaffolded fresh and ports relevant pieces from `web-ui/` per `plan/implementation/frontend/plan.md`.

Each shipping subproject (`app/`, `gaz-server/`) is self-contained — its own `package.json` / dependencies, its own `src/`, its own `.env`. No shared root `package.json` unless we deliberately adopt a workspace later.

**Rules to keep the FE/BE distinction clean:**

- **Independent deploys.** FE deploys from `app/` (Vercel/Netlify), BE deploys from `gaz-server/` (Render/Fly/Railway). Configure each platform's "root directory" per service.
- **No cross-imports.** `app/` never imports from `gaz-server/`, and vice versa. If something is genuinely shared (types, schemas), introduce a `shared/` package deliberately — don't reach across.
- **Env vars stay separated.** `app/.env` only holds public/browser-safe vars (`VITE_*` / `NEXT_PUBLIC_*`). `gaz-server/.env` holds all secrets (Supabase service key, Groq, OpenAI, Qdrant). Never import server env into FE code.
- **CORS.** BE must allow the FE's deployed origin — easy to forget until the first deploy fails.
- **CI path filters.** Once tests exist, `app/` changes shouldn't trigger `gaz-server/` builds and vice versa.
- **`web-ui/` is frozen.** Treat it as a reference artifact — read freely, never edit. All new FE work goes in `app/`.
