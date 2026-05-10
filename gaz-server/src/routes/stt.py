"""POST /stt — voice query transcription."""

from fastapi import APIRouter, File, UploadFile

from ..schemas.rag import SttResponse
from ..services.stt_service import transcribe_voice

router = APIRouter()


@router.post("/stt", response_model=SttResponse)
async def stt(audio: UploadFile = File(...)) -> SttResponse:
    audio_bytes = await audio.read()
    text = await transcribe_voice(audio_bytes, audio.filename or "voice.webm")
    return SttResponse(text=text)
