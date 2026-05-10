from pydantic import BaseModel, Field, HttpUrl


class IngestYouTubeRequest(BaseModel):
    url: HttpUrl


class IngestTextRequest(BaseModel):
    text: str = Field(min_length=80)


class IngestAcceptedResponse(BaseModel):
    job_id: str
    status: str = "pending"
