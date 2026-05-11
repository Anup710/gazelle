from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    # Required
    OPENAI_API_KEY: str
    GROQ_API_KEY: str
    SUPABASE_URL: str
    SUPABASE_KEY: str
    QDRANT_URL: str
    QDRANT_API_KEY: str

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    # Models / IDs
    QDRANT_COLLECTION: str = "transcript_chunks"
    EMBED_MODEL: str = "text-embedding-3-small"
    GEN_MODEL: str = "gpt-4o-mini"
    GROQ_WHISPER_MODEL: str = "whisper-large-v3-turbo"
    TTS_MODEL: str = "tts-1"
    TTS_VOICE: str = "alloy"

    # Retrieval tuning
    MIN_SIMILARITY_SCORE: float = 0.72
    TOP_K: int = 5

    # Logging
    LOG_LEVEL: str = "INFO"

    # Supadata: YouTube transcript extraction (replaces yt-dlp + youtube-transcript-api).
    # Required at job time only; missing key surfaces as `transcription_failed`, not boot failure.
    SUPADATA_API_KEY: str = ""
    SUPADATA_BASE_URL: str = "https://api.supadata.ai"


@lru_cache
def settings() -> Settings:
    return Settings()
