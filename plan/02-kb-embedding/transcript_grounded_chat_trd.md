# Transcript-Grounded Chat System — TRD

## 1. Trigger & Relationship to Stage 0

Stage 1 is **automatically triggered** when Stage 0 transcription completes successfully. There is no separate API call — the backend chains Stage 1 immediately after Stage 0 within the same background job. The client polls a single `job_id` and sees the status progress through `transcribing → validating → embedding → ready` (see Stage 0 TRD for the full status enum).

---

## 2. High-Level Architecture

```text
                INGESTION PIPELINE

┌────────────────────┐
│ Transcript JSON    │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Normalization      │
│ - whitespace       │
│ - encoding cleanup │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Semantic Chunking  │
│ 400–600 tokens     │
│ 10–20% overlap     │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Metadata Enrich    │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ OpenAI Embeddings  │
│ text-embedding-3   │
│ small              │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Qdrant Vector DB   │
└────────────────────┘
```

---

## 3. Input Format

Expected transcript structure (matches Stage 0 output):

```json
{
  "job_id": "uuid",
  "detected_language": "en",
  "transcript": [
    {
      "start": 12.4,
      "end": 18.9,
      "speaker": "Host",
      "text": "Today we'll discuss..."
    }
  ]
}
```

Notes:
- `transcript` is the canonical array key (aligned with Stage 0 output)
- `speaker` is optional — Groq Whisper does not provide diarization in V1
- `job_id` from Stage 0 is reused as `session_id` for all downstream stages (1:1 mapping)
```

---

## 4. Normalization Layer

Allowed preprocessing:
- whitespace cleanup
- UTF cleanup
- punctuation normalization
- formatting cleanup

Disallowed:
- summarization
- paraphrasing
- transcript rewriting
- translation

---

## 5. Chunking Strategy

### Strategy

Use:

```text
Semantic chunking with sliding overlap
```

Implementation candidates:
- LangChain RecursiveCharacterTextSplitter
- LlamaIndex SemanticSplitter
- custom tokenizer-based chunker

---

### Chunk Constraints

```text
Target Size: 400–600 tokens
Overlap: 10–20%
```

---

### Chunk Preservation Rules

Must preserve:
- speaker boundaries
- timestamps
- transcript ordering

---

## 6. Chunk Object Shape

```json
{
  "chunk_id": "...",
  "session_id": "...",
  "chunk_index": 12,

  "text": "...",

  "start_time": 420.1,
  "end_time": 489.2,

  "speaker_set": ["Host", "Guest"],

  "language": "en",

  "prev_chunk_id": "...",
  "next_chunk_id": "..."
}
```

---

## 7. Embedding Layer

### Embedding Model

Use:

```text
OpenAI text-embedding-3-small
```

Reason:
- multilingual support
- low cost
- strong retrieval quality
- fast inference

---

## 8. Vector Database

### Selected DB

Use:

```text
Qdrant
```

Deployment:
- Docker container

---

### Collection Design

Single collection:

```text
transcript_chunks
```

---

## 9. Retrieval Compatibility Decisions

### Session Isolation

All retrieval queries must filter by:

```python
session_id == current_session
```

---

### Neighbor Expansion Support

Chunks store:

```text
prev_chunk_id
next_chunk_id
```

Purpose:
- future context expansion
- conversational continuity

---

## 10. Deferred Features (Not in V1)

Explicitly excluded:
- reranking
- hybrid search
- BM25
- knowledge graphs
- memory summarization
- query rewriting
- agentic retrieval
- multi-document retrieval
- hierarchical retrieval

---

## 11. Recommended Backend Structure

```text
backend/
│
├── ingestion/
│   ├── normalize.py
│   ├── chunker.py
│   ├── embedder.py
│   └── uploader.py
│
├── retrieval/
│   └── search.py
│
├── db/
│   └── qdrant.py
```
