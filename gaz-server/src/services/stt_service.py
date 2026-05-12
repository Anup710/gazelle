"""POST /stt — transcribe a voice query via Groq Whisper."""

from ..clients import groq_client
from ..core.config import settings
from ..core.errors import AppError

# The example sentence is the load-bearing part: it primes Whisper's tokenizer
# toward Latin-script Hindi for code-mixed (Hinglish) audio. Pure-English and
# fluent-Hindi audio are unaffected because the acoustic signal dominates the
# prompt bias in those cases.
_VOICE_QUERY_PROMPT = (
    "Educational tutoring conversation. The speaker may use English, "
    "Hindi, or Hinglish (Hindi-English code-mixing). When the speaker "
    "mixes Hindi with English, transcribe the Hindi portions in Latin "
    "script, not Devanagari. Example: 'iska matlab hai ki the model "
    "samjhta hai context. Yeh basically ek transformer hai jisme "
    "attention layers hain.'"
)


async def transcribe_voice(audio_bytes: bytes, filename: str) -> str:
    try:
        rsp = await groq_client.get().audio.transcriptions.create(
            file=(filename, audio_bytes),
            model=settings().GROQ_WHISPER_MODEL,
            response_format="text",
            prompt=_VOICE_QUERY_PROMPT,
        )
    except Exception as e:
        raise AppError("stt_failed", "Couldn't transcribe audio.", 500) from e

    # response_format="text" returns the raw transcript string
    text = (rsp if isinstance(rsp, str) else getattr(rsp, "text", "") or "").strip()
    if not text:
        raise AppError("stt_failed", "Couldn't transcribe audio.", 500)
    return text
