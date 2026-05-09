Full Pipeline

These stages are planning categories for scoping and documentation purposes. They are NOT sequential implementation phases — they come together to form a single unified pipeline.

0. **Transcription** — input video or YT link or direct transcript → transcript extraction with correct metadata and format
1. **KB Embedding** — creation of the knowledge base (transcript → chunks → embeddings → Qdrant)
2. **Query & RAG** — user query input (text or voice), validation, intent capture, conversation context, query augmentation, chunk retrieval, grounded LLM response, and multi-turn chat continuity
3. **Response Rendering + TTS** — show response correctly (rendering) + option to "listen" to the response in input language
4. **UI/UX** — interface design and user experience

Note: Chat continuity (follow-up questions, clarifications, conversational flow) is part of Stage 2, not a separate stage. It is core to the product — the user must be able to hold a conversation with the AI over their uploaded content.