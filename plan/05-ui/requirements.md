# Gazelle UI Requirements — Complete Checklist for Design

> Extracted from Stages 0–3 PRDs and TRDs. Covers every user-facing requirement so nothing is missed during design.

---

## 1. Content Input Screen

### Three Input Modes (tab/toggle to switch)
- **YouTube URL** — text field + "Go" button; validate URL format client-side
- **File Upload** — dropzone or file picker; accept MP4, MOV, AVI, MKV; max 500 MB
- **Paste Transcript** — textarea for raw plain text + "Submit" button

### Validation & Error States
| Trigger | Message |
|---|---|
| Invalid YouTube URL | "Please enter a valid YouTube link" |
| Unsupported file format | "File format not supported. Use MP4, MOV, AVI, or MKV" |
| File > 500 MB | "File exceeds 500 MB limit" |
| Non-educational content | "This content doesn't appear to be educational. Please try a lecture, tutorial, or explainer." |

---

## 2. Processing / Loading State

Job is async — user submits, gets a `job_id`, and polls for status.

### Status Indicators Needed
- Spinner or progress bar
- Status text that updates through stages:
  - "Extracting transcript..."
  - "Building knowledge base..."
  - "Creating search index..."
  - "Ready for questions!"
- Handle failure: "Could not process this video. Please try another."

### Transition
Once status = `completed`, auto-transition (or prompt user) into the chat view.

---

## 3. Chat Interface

### Message Input Area
- **Text input** field with send button
- **Microphone button** for voice queries (states: idle, recording, processing)
  - Voice is transcribed server-side; text appears in input field; sent as normal query
- Send on Enter (desktop), send button (mobile)

### Conversation Display
- Alternating user/assistant message bubbles
- Scrollable thread, auto-scroll to latest message
- Clear visual distinction between user and assistant turns
- Readable typography for long-form educational text

### Conversation History (Client-Managed)
- **No server-side persistence** — chat is lost on page refresh (V1 accepted trade-off)
- Frontend maintains and sends with each request:
  - `conversation_summary` (null initially; LLM-generated every 4 turns)
  - `recent_turns[]` (last 4 turns, verbatim)
- Users can ask follow-ups: "Explain that again", "What does that formula mean?", "Simplify this"

---

## 4. Response Card

Each assistant response displays:

### Main Content
- **Response text** — the RAG-generated answer
- **Detected language badge** — show "English" / "Hindi" / "Hinglish" for transparency (auto-detected, no manual picker)

### Citations
- Inline citation badges/links (e.g., `[1]`, `[2]`)
- Each citation shows on click/hover:
  - Source chunk text
  - Timestamp range (start–end) from original video
  - Relevance score (optional for V1)
- Timestamps are display-only in V1 (no video embed to jump to)

### TTS Playback Button
- **Speaker icon** on each response card
- On-demand only — audio is NOT auto-generated
- Button states: idle -> loading (spinner) -> playing (pause + progress bar) -> error (retry)
- Audio format: MP3, played via browser `<audio>` element
- If response > 3,500 chars, TTS truncates to last complete paragraph (show notice)
- If TTS fails: "Unable to generate audio. Please try again." — text remains usable

---

## 5. Session / Sidebar Navigation

### Session List
- Sidebar (or equivalent) showing all sessions
- Each session = one transcript/video
- Display: session title (video title or "Pasted Transcript") + creation date
- Active session visually highlighted
- "New Chat" button prominently placed

### Session Behavior
- `session_id` = `job_id` (1:1)
- Sessions are independent — no cross-session retrieval
- Session list is fetched from `GET /sessions` (queries jobs table — title, status, date)
- Conversation history is client-managed in V1 — switching sessions loads whatever the client has stored locally; if the page was refreshed, chat history is empty but the session still appears in the sidebar
- Delete/archive sessions: **not required for V1**

---

## 6. Language Handling (No UI Controls Needed)

- Language is auto-detected from the user's query
- Response language always matches query language, not transcript language
- TTS voice auto-selected: English voice for English, Hindi voice for Hindi/Hinglish
- **No language picker, no voice selector** — fully automatic

---

## 7. Error & Empty States

### Empty States
- No sessions yet: "Upload a video or paste a transcript to get started"
- Session ready, no messages yet: "Ask a question about this video"

### Error States
- Insufficient retrieval: "I couldn't find this in the uploaded content."
- Below similarity threshold: "I don't have enough relevant information to answer this."
- Generic API failure: "Something went wrong. Please try again."
- TTS failure: "Unable to generate audio. Try again or continue reading."
- ASR failure (voice input): "Couldn't capture audio. Please type your question."

---

## 8. Screens Summary

| Screen | Purpose |
|---|---|
| **Input/Upload** | Choose input mode, submit content |
| **Processing** | Show async job progress |
| **Chat** | Main conversation interface with response cards |
| **Session Sidebar** | Navigate between sessions, create new |

---

## 9. Explicitly Out of Scope for V1

Do NOT design for:
- Authentication / login / user accounts
- Video playback or embedding
- Transcript editing
- Streaming response rendering (responses appear complete)
- Voice selection / cloning / emotion controls
- Audio download
- Waveform visualization
- Analytics dashboard
- Cross-session memory
- Mobile app (web-responsive is sufficient)

---

## 10. Interactive Components Inventory

1. **Tab group** — switch between YouTube / Upload / Paste
2. **Text input** — YouTube URL, chat query
3. **File dropzone** — drag-and-drop + click-to-browse
4. **Textarea** — transcript paste
5. **Buttons** — Submit, Send, New Chat, Retry
6. **Microphone toggle** — voice input (idle/recording/processing)
7. **Speaker button** — TTS playback (idle/loading/playing/error)
8. **Audio player** — play/pause, progress bar, time display
9. **Citation badges** — clickable inline references
10. **Citation detail** — popover/modal showing chunk text + timestamps
11. **Progress indicator** — processing status (spinner + text)
12. **Session list** — sidebar with session cards
13. **Message bubbles** — user and assistant conversation display
14. **Status badges** — language detected, processing state
15. **Error banners/toasts** — contextual error messages
