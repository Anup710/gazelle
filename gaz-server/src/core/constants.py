"""Tunable numeric constants. Mirrors values locked in plan/implementation/backend/be-plan.md §4.2."""

EMBED_DIM = 1536

CHUNK_TARGET_TOKENS = 500
CHUNK_OVERLAP_TOKENS = 75

COMPACTION_INTERVAL = 4
RECENT_TURNS_KEPT = 4

TTS_CHAR_LIMIT = 3500
VALIDATION_SAMPLE_CHARS = 1500
EMBED_BATCH_SIZE = 100

MAX_UPLOAD_MB = 500
ALLOWED_UPLOAD_EXTS = {".mp4", ".mov", ".avi", ".mkv"}
