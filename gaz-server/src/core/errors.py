"""Domain exceptions and the unified error envelope shape."""


class AppError(Exception):
    """Raised by routes/services to surface a structured error to the client.

    The exception handler in main.py converts these into the
    `{"error": {"code", "message"}}` envelope per stage 2 TRD §592.
    """

    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


class TranscriptionError(Exception):
    """Raised inside the ingest pipeline; orchestrator maps to failure_reason='transcription_failed'."""


class EmbeddingError(Exception):
    """Raised inside the ingest pipeline; orchestrator maps to failure_reason='embedding_failed'."""
