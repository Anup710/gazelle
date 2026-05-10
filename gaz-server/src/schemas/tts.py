from typing import Literal

from pydantic import BaseModel, Field


class TTSRequest(BaseModel):
    text: str = Field(min_length=1)
    language: Literal["en", "hi"]
