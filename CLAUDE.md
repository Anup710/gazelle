# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is Gazelle

Gazelle is an AI video tutor: users submit a video (upload, YouTube link, or pasted transcript), a knowledge base is built from it, and they can chat with it via a RAG pipeline. This repository is the **planning and specification repo** — it contains PRDs, TRDs, and architectural decisions. There is no application code here yet.

## Repository Structure

```
plan/
  pipeline.md              # Master pipeline overview (5 stages)
  transcription/           # Stage 0: PRD + TRD for transcript extraction
  kb-embedding/            # Stage 1: PRD + TRD for chunking & embedding
  input-and-RAG/           # Stage 2: PRD + TRD for query, retrieval, generation
  hosting/                 # Hosting/infra planning
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
