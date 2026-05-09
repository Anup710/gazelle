# Product Requirements Document (PRD)
# AI Tutor – Transcript Ingestion Service (V1)

## 1. Overview

This service is the ingestion and transcript-generation layer for an AI-powered tutor application.

The responsibility of this service ends at:
- accepting supported inputs,
- extracting or generating transcripts,
- validating whether the content is educational,
- and returning a structured transcript JSON object.

This service does NOT handle:
- embeddings,
- chunking,
- vector databases,
- retrieval,
- tutoring/chat,
- authentication,
- payments,
- or analytics.

---

# 2. Product Goal

Enable users to quickly ingest educational content and convert it into structured transcripts that can later be consumed by downstream AI tutoring systems.

The service should prioritize:
- simplicity,
- low latency,
- robustness,
- multilingual support (including at least one Indic language),
- and clean system boundaries.

---

# 3. Supported Inputs (V1)

## 3.1 YouTube Links

Users may submit valid YouTube video URLs.

### Expected Behavior
- Validate that the URL is a valid YouTube link.
- Reject non-YouTube links with a clear error message.
- Attempt to fetch native captions first.
- Only fall back to speech-to-text transcription if captions are unavailable.

---

## 3.2 Local Video Uploads

Users may upload local video files.

### Supported Formats
- MP4
- MOV
- AVI
- MKV (optional)

### Constraints
- Maximum upload size: 500MB
- Intended for asynchronous processing

---

## 3.3 Raw Transcript Upload

Users may directly paste transcript text.

### Constraints
- Plain text only (copy pasted)
- No PDF parsing
- No document extraction
- No OCR support

---

# 4. Educational Content Validation

The system should validate whether the submitted content is educational before allowing downstream processing.

---

## 4.1 Allowed Content Examples

- Lectures
- Tutorials
- Educational explainers
- Academic discussions
- Technical walkthroughs
- Skill-based instruction

---

## 4.2 Rejected Content Examples

- Music videos
- Entertainment clips
- Memes
- Casual vlogs
- Gaming streams
- Non-instructional conversational content

---

## 4.3 Validation Behavior

- A lightweight LLM classifier should evaluate transcript samples.
- If content is classified as non-educational:
  - processing should terminate,
  - downstream systems should be blocked,
  - and the user should receive a clear rejection message.

---

# 5. Language Support

The service must support:
- English
- At least one Indic language (Hindi in V1)

The system should support:
- automatic language detection,
- multilingual transcripts,
- and code-mixed speech where possible.

---

# 6. Processing Model

All processing should be asynchronous.

---

## User Flow

1. User submits input.
2. Job is created.
3. Processing begins asynchronously.
4. User polls for job status.
5. Structured transcript JSON is returned on completion.

---

# 7. Output Requirements

The output should be a clean, structured JSON response containing:
- transcript,
- timestamps,
- metadata,
- educational validation result,
- and language information.

---

## Example Output Fields

- job_id
- status
- source_type
- source
- title
- duration_seconds
- detected_language
- used_native_captions
- educational_validation
- transcript[]
- full_text

---

# 8. Storage Requirements

The system should:
- temporarily store uploaded media during processing,
- delete uploaded media after transcription,
- and persist only transcript data and metadata.

The system should NOT permanently store uploaded videos.

---

# 9. Non-Goals (V1)

The following are intentionally excluded from scope:

- User authentication
- User accounts
- Vector databases
- Embeddings
- Transcript chunking
- Semantic search
- RAG pipelines
- PDF ingestion
- OCR
- Arbitrary website scraping
- Realtime streaming transcription
- Browser automation
- Mobile applications

---

# 10. Success Criteria

The V1 system is successful if users can reliably:
- submit educational content,
- receive high-quality transcripts,
- and use those transcripts downstream for tutoring workflows.

Key indicators:
- successful transcript generation,
- low failure rates,
- acceptable latency,
- multilingual support,
- and clean transcript structure.
