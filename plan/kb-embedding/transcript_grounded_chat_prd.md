# Transcript-Grounded Chat System — PRD

## 1. Objective

Convert transcript output from Step 0 into an embedded knowledge base that can be used for transcript-grounded conversational retrieval.

Scope of this phase:

```text
Transcript JSON
    ↓
Chunking
    ↓
Embedding
    ↓
Vector Storage
    ↓
Retrieval-ready knowledge base
```

This phase does NOT include:
- query handling
- retrieval orchestration
- LLM response generation
- UI/UX
- authentication
- multi-user knowledge sharing

---

## 2. Product Principles

### Grounded Responses Only

Every chat instance is grounded ONLY in:

```text
Transcript associated with that session
```

No cross-session retrieval.

### Session Identity

Decision:

```text
job_id from Stage 0 = session_id for all downstream stages
One transcript = one session (1:1 mapping)
```

This is a conscious simplification for V1. A separate session concept is not needed at this stage and would add unnecessary abstraction. Can be revisited if multi-transcript sessions become a requirement.

---

### Transcript Fidelity

Decision:

```text
Store raw ASR transcript text
```

Rationale:
- minimize preprocessing complexity in V1
- preserve original conversational structure
- avoid introducing cleanup/summarization errors
- optimize for speed of iteration

Only minimal normalization allowed:
- whitespace cleanup
- encoding cleanup
- structural formatting

No rewriting or summarization.

---

### Retrieval Philosophy

Optimize for:
- conversational grounding
- semantic coherence
- timestamp traceability
- multilingual robustness

Not optimizing yet for:
- enterprise search
- internet-scale retrieval
- advanced ranking systems

---

## 3. Chunking Product Decisions

### Chunk Type

Use:

```text
Semantic transcript chunks
```

Not:
- fixed character chunks
- arbitrary token windows

---

### Chunk Size

Target:

```text
400–600 tokens
```

Reason:
- preserves conversational context
- improves downstream retrieval quality

---

### Context Continuity

Decision:

```text
10–20% overlap between chunks
```

Purpose:
- preserve conversational continuity
- reduce boundary information loss

---

### Timestamp Preservation

Every chunk must preserve:
- start timestamp
- end timestamp

Purpose:
- future citations
- jump-to-video capability
- playback alignment

---

### Speaker Preservation

Speaker labels must be retained where available.

Purpose:
- conversational clarity
- attribution
- better downstream grounding

---

## 4. Metadata Requirements

Each chunk must contain:

```text
session_id
chunk_id
chunk_index
start_time
end_time
language
speaker_set
```

---

## 5. System Boundaries

Current scope ends at:

```text
Embedded transcript chunks stored in vector DB
```

Downstream retrieval and chat orchestration are covered in later documents.
