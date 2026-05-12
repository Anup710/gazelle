from pydantic import BaseModel, Field

from .rag import Language


class TTSRequest(BaseModel):
    text: str = Field(min_length=1)
    language: Language
