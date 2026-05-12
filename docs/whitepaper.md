# Gazelle — Technical Whitepaper

## 1. What it is

Gazelle is an AI video tutor. A learner submits a video — a YouTube link, a file upload, or a pasted transcript — and Gazelle builds a per-session knowledge base from it. They then hold a grounded conversation with that knowledge base: questions in text or voice, answers in their language of choice, every claim tagged with a `[N]` citation that opens the verbatim source line and its `mm:ss` timestamp.

The product targets a specific learning failure mode: a lecture you watched once, half-absorbed, and now want to interrogate. Rewatching the full hour is wasteful; skimming a transcript is unstructured; asking a general-purpose chatbot is ungrounded. Gazelle gives you a search-and-converse surface over the exact content you just watched, with the source always one click away.

## 2. Architecture at a glance

```
INDEXING  (one-time per video, runs as a single chained background job)

  ┌────────────┐   ┌────────────────┐   ┌──────────────┐   ┌────────────┐   ┌─────────┐
  │  Input     │ → │ Transcription  │ → │  Validation  │ → │  Chunk +   │ → │ Qdrant  │
  │  YT  /     │   │  Groq Whisper  │   │  LLM         │   │  Embed     │   │ vector  │
  │  Upload /  │   │  or Supadata   │   │  content     │   │  OpenAI    │   │ store   │
  │  Paste     │   │                │   │  classifier  │   │            │   │         │
  └────────────┘   └────────────────┘   └──────────────┘   └────────────┘   └─────────┘
                          │                    │                  │
                          ▼                    ▼                  ▼
                   pending → transcribing → validating → embedding → ready / failed


QUERYING  (per turn)

  ┌──────────┐   ┌────────────────────────┐   ┌────────────────────────────────┐
  │ Text or  │ → │ Augment + detect       │ → │   Route on detected intent     │
  │ voice    │   │ language + classify    │   │                                │
  │ query    │   │ intent (one LLM call)  │   │  summary  → document summary   │
  └──────────┘   └────────────────────────┘   │  thematic → summary + top-k    │
                                              │  detail   → top-k retrieval    │
                                              └────────────────────────────────┘
                                                              │
                                                              ▼
                                              ┌────────────────┐   ┌──────────────┐
                                              │ Generate       │ → │ Response +   │
                                              │ GPT-4o-mini    │   │ [N] citations│
                                              │ grounded only  │   │ + verbatim   │
                                              └────────────────┘   └──────────────┘
                                                       ▲
                                                       │
                                                Two-tier history
                                                (rolling summary + last 4 turns,
                                                 compacted every 4th turn)

  All retrieval is session-scoped — no cross-session reads.
```

Indexing runs once per video. Querying runs per turn. Retrieval is strictly scoped to the active session, so citations always refer to the exact content the learner uploaded.

## 3. Tech stack and why

| Layer | Choice | Why this over alternatives |
|---|---|---|
| Frontend | Vite + React 19 | Sub-second HMR, zero-config builds, and React 19's compiler reduces ceremony around async state. Next.js was overkill — there is no SEO surface and no server-rendered route in this product. The visual handoff was first prototyped against a CDN-React artifact (frozen in `web-ui/`), then ported to Vite for the shipping path. |
| Backend | FastAPI | Async-first, automatic OpenAPI schema, and Pydantic validation the React side mirrors verbatim. Flask was rejected for lacking native async; Node was rejected because the rest of the AI tooling (OpenAI, Groq, Qdrant) has first-class Python SDKs and I did not want to maintain two languages. |
| Transcription (ASR) | Groq Whisper — `whisper-large-v3-turbo` | Same Whisper architecture as OpenAI's, served on Groq's LPU stack: comparable quality at ~10× the throughput and a generous free tier. OpenAI Whisper would have worked but at higher per-minute cost and slower turnaround; self-hosting Whisper would have meant standing up a GPU box on a free-tier-only budget. |
| YouTube transcripts | Supadata HTTP API | `yt-dlp` + `youtube-transcript-api` from a datacenter IP gets bot-walled by YouTube within hours; the cookies workaround is operationally fragile. Supadata is a managed wrapper that handles the bot detection, and as a hosted HTTP call it also sidesteps the legal/ToS surface of scraping. |
| Embeddings | OpenAI `text-embedding-3-small` | 1536-dim, multilingual, priced at ~$0.02 per 1M tokens — effectively free at this product's scale. The multilingual property is load-bearing: a Hinglish query (Latin-script Hindi mixed with English) can retrieve a Devanagari-script Hindi chunk without a second index. `text-embedding-3-large` would double cost with no measurable recall lift on lecture-length corpora. |
| Vector store | Qdrant Cloud | Free tier covers the prototype, filter-on-payload is first-class (essential for session-scoped retrieval), and the `query_points` API is clean. Pinecone is comparable but more expensive at the free-tier boundary; `pgvector` inside Supabase was tempting for stack consolidation, but its filter performance on the free tier did not justify the consolidation. |
| Generation | OpenAI `gpt-4o-mini` | The cost/quality knee for grounded RAG: $0.15/1M input, $0.60/1M output, with strong instruction-following on the "answer only from these chunks" pattern. GPT-4o was overkill at ~10× the cost; Claude Haiku is comparable but adds a second SDK and key surface for no real lift on this workload. |
| TTS | OpenAI `tts-1` | Single provider keeps the auth surface and SDK footprint small. English + Hindi voice coverage is acceptable for the product's language scope. ElevenLabs would have given studio-quality output at ~30× the cost — not justified for a tutor that prioritizes clarity over performance. |
| Database | Supabase Postgres | Hosted Postgres with a generous free tier, row-level-security-ready (for the day auth becomes in-scope), and the same vendor offers storage + auth + edge functions if I ever fold them in. |
| Hosting | Render (BE), Vercel (FE), Qdrant Cloud, Supabase | Four free-tier managed services, each handling one concern. Frontend and backend are independent deploys with no cross-imports, so the next migration (e.g., to AWS) does not have to be all-or-nothing. |

## 4. Product features

Each feature below: a one-line title, why it exists, how it works, and the value it delivers.

**Multi-channel ingestion — YouTube, upload, paste**
*Why:* Learners arrive at content from three places — a link they saw, a file they have, or a transcript they already extracted. *How:* `POST /ingest/{youtube,upload,text}` — three endpoints sharing a single downstream orchestrator and status enum. *Value:* No friction at the door. The product never asks the user to convert their file first.

**English, Hindi, and Hinglish — first-class, auto-detected**
*Why:* The intended learner base reads and writes all three, often code-switching mid-sentence. *How:* Language is detected per-query by GPT-4o-mini in the augmentation step; the generation prompt is locked to match. Hinglish is a distinct enum value, not a degenerate case of Hindi. *Value:* No language picker, no "please type in English," no mismatched answers — the learner writes the way they think.

**Inline YouTube viewer**
*Why:* Citations point to `mm:ss` ranges — the natural follow-up is "let me hear it for myself." Forcing the user to leave the tab for YouTube breaks the conversation flow. *How:* A modal `<iframe>` with the YouTube embed player, opened from any YouTube-sourced session. *Value:* The source-of-truth is one click and zero context-switches away.

**Three themes — Scholar, Studio, Focus (dark)**
*Why:* Different study contexts demand different visual densities. Naming themes by *activity* rather than just *color* frames the tool as adapting to the learner, with Focus serving as the full dark-mode reading experience. *How:* Theme class applied to `document.body`, persisted to `localStorage`, with `color-scheme: dark` on Focus so native widgets match. *Value:* The reading experience matches the moment — a daytime skim feels different from a late-night deep-read.

**Voice-based queries**
*Why:* Whisper occasionally hallucinates content from silence and very short clips. Auto-sending would amplify those errors; letting the user see and edit the transcript before sending makes voice a low-stakes input. *How:* `MediaRecorder` (webm/opus, mp4 fallback on Safari) → 8s auto-stop → `POST /stt` → text drops into the composer. The user presses send. *Value:* Voice becomes a typing-assist, not a separate mode the user must trust blindly.

**Status-aware archive, restore, delete**
*Why:* A failed job is a mistake the learner wants to clear; a ready session is something they may want to set aside; an archived session may want to come back. *How:* Hover-revealed row actions branch on status — failed → Trash; ready → Archive; archived → Restore + Delete-forever. Delete is idempotent across Supabase and Qdrant. *Value:* The sidebar stays clean and destructive clicks are gated behind intent.

**Single-tenant by design — no OAuth, no multi-tenancy**
*Why:* Gazelle is a personal tutor over the learner's own library. Adding OAuth and per-row authorization would expand the surface area without adding a single user-visible capability inside the core loop. *How:* The model layer treats the deployment as one learner's workspace; sessions are identified by `job_id` and listed on `GET /sessions` without any user scoping. *Value:* No sign-up wall; the data model stays simple; auth can later be added as a clean perimeter rather than retrofitted into every query.

## 5. Design decisions worth pointing out

These are calls that are not visible in the UI but shape how the product behaves under pressure.

**TTS is on-demand, not auto-played.** Speech is the largest variable cost in the pipeline — a typical answer's TTS run is roughly 30× the cost of the text generation that produced it. Beyond cost, auto-playing audio in a learner's environment is presumptuous (open-plan office, shared room, headphones not connected). Gating TTS behind an explicit click bundles three concerns — cost discipline, user agency, and accessibility — into one decision.

**Citations carry the verbatim chunk text in the response payload.** When the model retrieves a chunk for grounding, that chunk's text is already in memory. Embedding it directly into the citation object — alongside the `mm:ss` range, relevance score, and speaker set — means the popover renders instantly without a second round trip, and the learner sees the exact source string the model used, not a paraphrase. It also raises the cost of hallucination: a fabricated citation would be visibly inconsistent with its own source text.

**Two-tier chat memory: rolling summary + last four turns.** Sending the entire history every turn would balloon input tokens linearly; sending only recent turns loses context after the fifth exchange. Instead, every fourth turn the backend compacts older context into a rolling summary while keeping the last four turns verbatim. The cadence is deterministic (`(turn_count + 1) % 4 == 0`), so per-turn cost stays predictable instead of drifting with conversation length.

**Verification of educational content** Classifying a video as educational vs. non-educational requires the transcript, so the gate cannot run earlier. But it must run before chunking + embedding, because that is the step that is effectively irreversible (vectors in Qdrant, rows in Postgres). Placing validation at exactly that boundary protects the vector store from junk content while paying only for transcription on the rejection path.

**Retrieval is strictly session-scoped.** Every Qdrant query carries a `session_id` filter. This is not primarily a security feature — it is a correctness feature. A citation only means something if it refers to the exact source the learner uploaded. Mixing chunks across sessions would let one lecture's content leak into another's answer, breaking the entire grounding contract.

**One LLM call augments the query, detects language, and classifies intent.** The augmentation step asks GPT-4o-mini to return three things at once: a rewritten query, the detected language, and an intent label (`summary`, `thematic`, or `detail`). The route then branches on intent: *summary* queries ("what is this lecture about?") read a pre-computed document summary instead of running top-k retrieval, because chunks only cover fragments and would systematically fail the question; *thematic* queries get both the summary and retrieved chunks for breadth + specifics; *detail* queries take the standard top-k path. Bundling all three classifications into one call keeps latency and cost flat, and the routing fix solves a real RAG failure mode — pure retrieval cannot answer "summarize the whole thing."

**Status polling instead of WebSockets.** A WebSocket gateway is one more piece of infra to keep alive on a free-tier deploy, and during indexing the user is in a "wait for it to finish" mental state — not a real-time interaction state. Polling `GET /job/{id}` every two seconds is dead-simple, retry-friendly under transient network failure, and good enough. The status enum (`pending → transcribing → validating → embedding → ready`) gives the UI enough granularity to render a meaningful progress ring without any push channel — and tells the learner *where* a failure happened, not just *that* one did.

## 6. Cost shape

At the per-operation level, the numbers are:

| Operation | Approximate cost |
|---|---|
| Indexing a 30-minute lecture (~4,500 words of continuous speech) | ~$0.02–0.03 (Groq Whisper dominates; embeddings are <$0.001) |
| One grounded text query + answer | ~$0.001 (≈ one tenth of a cent) |
| One TTS playback of a typical answer | ~$0.03 |
| Voice query (STT only) | <$0.001 |

The interesting line is the TTS one: it is roughly 30× a text query. That cost asymmetry is exactly what drives the "explicit click" design above — auto-playing audio would invisibly multiply per-session cost while delivering value the learner may not have wanted in the first place.

## 7. Closing

Gazelle is compact, and it just works. It does the one thing it was built to do — let a learner interact with a piece of information, in whatever format that information arrives — and it does it fast, cheaply, accurately, and with the source always one click away. 
