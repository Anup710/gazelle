"""POST /tts — stream mp3 audio from OpenAI gpt-4o-mini-tts.

Per-language `instructions` steer accent, pace, and code-switching. The
`instructions` field is honored only by gpt-4o-mini-tts; the OpenAI SDK
silently drops it on tts-1 / tts-1-hd.

Truncates input to the last complete paragraph within the 3,500-character cap
(silent — FE infers from input length per FE plan §8 Seam 6).
"""

from typing import AsyncIterator

from ..clients import openai_client
from ..core.config import settings
from ..core.constants import TTS_CHAR_LIMIT
from ..core.errors import AppError
from ..schemas.rag import Language

# Tuned for voice="sage". If the voice is swapped via env, retune wording.
_TTS_INSTRUCTIONS: dict[Language, str] = {
    "english": (
        "Voice: a warm, patient educational tutor. Pace: unhurried, "
        "around 165 words per minute. Tone: friendly, curious, lightly "
        "encouraging — like a one-on-one teacher who genuinely wants "
        "the student to understand. Diction: clean neutral English, no "
        "regional exaggeration. Pause briefly at sentence ends and "
        "after commas. Emphasize key technical terms slightly so they "
        "land. Never sound rushed, sales-y, or robotic."
    ),
    "hindi": (
        "Voice: a warm, patient Indian tutor speaking natural Hindi. "
        "Accent: authentic North-Indian Hindi — not anglicized, not "
        "Sanskritized. Use everyday spoken pronunciation. English "
        "words embedded in the text (technical terms, proper nouns) "
        "should be pronounced the way an educated Hindi speaker "
        "naturally pronounces them — do NOT switch to a hard American "
        "or British accent for those words. Pace: unhurried, around "
        "150 words per minute. Tone: friendly, encouraging, like a "
        "senior explaining to a junior. Pause naturally at sentence "
        "ends. Never sound formal, news-anchor-stiff, or robotic."
    ),
    "hinglish": (
        "Voice: a warm, patient Indian tutor speaking natural "
        "Hinglish — fluid code-switching between Hindi and English "
        "the way urban Indians actually speak. The Hindi parts "
        "(written in Latin script here, e.g. 'matlab', 'samjho', "
        "'iska use') should be pronounced as Hindi, NOT read out as "
        "English words. The English parts (technical terms, common "
        "English words) stay in English but with a relaxed "
        "Indian-English accent — not American, not British. Move "
        "smoothly between the two within a single sentence; never "
        "force a hard switch. Pace: conversational, around 155 words "
        "per minute. Tone: friendly, peer-like, encouraging. Pause at "
        "sentence ends. Never sound robotic or like you are reading."
    ),
}


def truncate_to_paragraph(text: str, limit: int = TTS_CHAR_LIMIT) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit]
    # Prefer paragraph boundary, then sentence boundary, then hard cut.
    p = cut.rfind("\n\n")
    if p > 0:
        return cut[:p].rstrip()
    p = cut.rfind(". ")
    if p > 0:
        return cut[: p + 1].rstrip()
    return cut.rstrip()


async def stream_speech(text: str, language: Language) -> AsyncIterator[bytes]:
    """Yields mp3 chunks. Per-language `instructions` steer accent and
    code-switching on gpt-4o-mini-tts."""
    s = settings()
    payload = truncate_to_paragraph(text)
    instructions = _TTS_INSTRUCTIONS.get(language, _TTS_INSTRUCTIONS["english"])
    try:
        async with openai_client.get().audio.speech.with_streaming_response.create(
            model=s.TTS_MODEL,
            voice=s.TTS_VOICE,
            input=payload,
            instructions=instructions,
            response_format="mp3",
        ) as rsp:
            async for chunk in rsp.iter_bytes(chunk_size=8192):
                yield chunk
    except AppError:
        raise
    except Exception as e:
        raise AppError("generation_failed", "Unable to generate audio.", 500) from e
