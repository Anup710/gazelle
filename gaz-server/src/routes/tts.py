"""POST /tts — stream mp3 audio for an answer."""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from ..schemas.tts import TTSRequest
from ..services.tts_service import stream_speech

router = APIRouter()


@router.post("/tts")
async def tts(req: TTSRequest) -> StreamingResponse:
    return StreamingResponse(
        stream_speech(req.text, req.language),
        media_type="audio/mpeg",
    )
