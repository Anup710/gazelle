# Transcript-Grounded Chat System — TRD

## 1. High-Level Architecture

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

## 2. Input Format

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

## 3. Normalization Layer

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

## 4. Chunking Strategy

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

## 5. Chunk Object Shape

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

## 6. Embedding Layer

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

## 7. Vector Database

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

## 8. Retrieval Compatibility Decisions

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

## 9. Deferred Features (Not in V1)

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

## 10. Recommended Backend Structure

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
