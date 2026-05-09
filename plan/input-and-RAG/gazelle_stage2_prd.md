# Gazelle — Stage 2 PRD
## RAG Pipeline (Query → Retrieve → LLM Response)

## Objective

Enable users to ask questions against a session-specific video knowledge base and receive grounded, conversational answers in the same language as the query.

This stage converts:
- user query
- retrieved transcript knowledge
- LLM reasoning

into a coherent tutoring response.

The goal is not generic chatbot behavior. The goal is educational retrieval and explanation over uploaded video content.

---

# Scope

## Included

- Text query input
- Voice query input (Groq Whisper, reused from Stage 0)
- Hindi, English, and Hinglish support
- Cross-language retrieval (no translation layer — handled by multilingual embeddings)
- Session-scoped retrieval
- Query augmentation using GPT-4o-mini or similar
- Language detection (as part of the augmentation step, no separate call)
- Dense vector retrieval from Qdrant
- Grounded LLM answer generation (GPT-4o-mini)
- Multi-turn chat continuity with two-tier context (compacted summary + sliding window)
- Hallucination refusal behavior
- Similarity threshold gating (required)
- Timestamp-aware retrieval context

---

## Excluded (Extended Scope)

These are intentionally deferred:

- Streaming responses
- Hybrid retrieval (BM25 + dense)
- Cross-encoder reranking
- Agentic retrieval pipelines
- Multi-query retrieval orchestration
- Retrieval voting systems
- Citation UX rendering
- Adaptive chunk compression
- Memory summarization
- Long-term user memory
- Personalized tutoring behavior
- Semantic caching
- Tool use
- Web retrieval

---

# Product Philosophy

The objective is to:
- maximize retrieval correctness
- maintain conversational tutoring flow
- preserve simplicity in V1 architecture

The system should prefer:
- grounded refusal
over
- fabricated confidence

The system is intentionally optimized for:
- educational discussions
- conceptual clarification
- iterative follow-up questioning

rather than open-ended general chat.

---

# User Experience

## Input Modalities

### Supported
- Text
- Voice

### Voice Flow

Voice input is transcribed into a canonical variable:

```python
query_text
```

All downstream processing is shared between:
- text queries
- voice queries

No separate retrieval pipelines exist.

---

# Supported Languages

## Input
- English
- Hindi
- Hinglish

## Retrieval
Retrieval is language-independent.

Examples:
- Hindi query over English transcript
- English query over Hindi transcript
- Hinglish query over either

are all valid.

---

# Output Language Behavior

The response language should match:
- the language of the user query
NOT
- the language of the transcript

Examples:

| Transcript Language | Query Language | Response Language |
|---|---|---|
| English | Hindi | Hindi |
| Hindi | English | English |
| English | Hinglish | Hinglish |

---

# Chat Continuity

Chat continuity is mandatory and core to the product — not a separate stage.

The system must support:
- follow-up questions
- clarification loops
- iterative learning conversations

Examples:
- "Explain that again"
- "What does that formula mean?"
- "Can you simplify this?"
- "Why does that happen?"

The tutoring experience depends on continuity.

## Context Strategy

Two-tier, client-managed approach:

1. **Conversation summary** — LLM-generated compaction of all turns older than the sliding window, generated every 4 turns. Appended to the system prompt for long-term context preservation.
2. **Recent turns (sliding window)** — last 4 turns in full verbatim detail for immediate conversational coherence.

This ensures:
- bounded context window regardless of conversation length
- no loss of important earlier context (captured in summary)
- exact wording preserved for recent follow-ups
- stateless server — client manages and sends both summary and recent turns

Conversation is lost on page refresh (acceptable for V1).

---

# Retrieval Scope

All retrieval is isolated to a single session.

Queries must never retrieve content across sessions.

This ensures:
- contextual purity
- lower hallucination risk
- clean educational grounding

---

# Retrieval Strategy

## V1 Retrieval

The system uses:
- dense semantic retrieval only

The system does NOT use:
- hybrid retrieval
- keyword retrieval
- reranking

Reason:
- lower implementation complexity
- faster iteration
- sufficient quality for educational content

---

# Query Augmentation

Before retrieval, the user query is passed through an LLM augmentation layer.

Purpose:
- improve semantic coherence
- normalize shorthand questions
- improve retrieval quality
- better contextualization for embeddings

Examples:
- ambiguous follow-up questions
- fragmented spoken questions
- shorthand educational references

The augmentation layer should preserve:
- original intent
- original language
- educational context

---

# Retrieval Configuration

## Top-K
The system retrieves:
- top 5 chunks

Reason:
- sufficient contextual breadth
- controlled prompt size
- manageable latency

---

# Grounded Answering

The model should answer:
- primarily from retrieved context

If insufficient information exists:
- the model should explicitly say so

Preferred behavior:
- refusal
over
- hallucinated completion

A similarity threshold is required — if no retrieved chunk meets the minimum score, the system skips generation entirely and returns a refusal. The threshold value is a hyperparameter, tuned via experimentation.

Example refusal:
> “I could not find this information in the uploaded content.”

---

# Timestamp Preservation

Retrieved chunks retain timestamps.

This enables future capabilities:
- clickable citations
- transcript highlighting
- jump-to-video interactions

Timestamps are treated as core metadata.

---

# Stack Decisions

| Component | Choice | Reason |
|---|---|---|
| Generation LLM | OpenAI GPT-4o-mini | Same ecosystem as embeddings, multilingual, low cost, fast |
| Voice query STT | Groq Whisper | Reused from Stage 0, no new provider |
| Query augmentation | GPT-4o-mini | Lightweight, deterministic, low temperature |
| Conversation compaction | GPT-4o-mini | Same model, infrequent call (every 4 turns) |

All inference stays within the OpenAI ecosystem. Groq Whisper is the only external provider (STT only).

---

# Streaming

Streaming is intentionally deferred.

Reason:
- cosmetic improvement only
- increases implementation complexity
- not critical for V1 educational utility

---

# Success Criteria

The stage is successful if:
- users can ask questions conversationally
- answers remain grounded in transcript content
- multilingual retrieval works reliably
- follow-up educational questioning feels natural
- hallucinations remain low
- latency remains acceptable

---

# Non-Goals

The system is not intended to:
- be a general-purpose AI assistant
- browse the internet
- answer beyond retrieved knowledge
- provide authoritative answers outside uploaded content
