from typing import Literal, Optional

from pydantic import BaseModel, Field

Language = Literal["english", "hindi", "hinglish"]


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class RagRequest(BaseModel):
    session_id: str
    query_text: str = Field(min_length=1)
    # Number of USER turns BEFORE the current one. 0 on first query.
    # Used by the server to decide compaction cadence reliably past turn 4.
    turn_count: int = Field(default=0, ge=0)
    conversation_summary: Optional[str] = None
    recent_turns: list[Turn] = []


class Citation(BaseModel):
    chunk_id: str
    text: str
    timestamp_start: float
    timestamp_end: float
    relevance_score: float
    speaker_set: list[str] = []


class ResponseBody(BaseModel):
    text: str
    language: Language


class RagResponse(BaseModel):
    response: ResponseBody
    # Non-null only on compaction turns (every 4th). Client retains its prior summary on null.
    conversation_summary: Optional[str] = None
    citations: list[Citation]


class SttResponse(BaseModel):
    text: str
