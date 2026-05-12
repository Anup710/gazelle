"""POST /tts — stream mp3 audio from OpenAI TTS.

Per-language model routing: English uses the lightweight tts-1 voice (fast,
cheap, native English prosody). Hindi and Hinglish use gpt-4o-mini-tts with
per-language `instructions` to steer accent and code-switching. The
`instructions` field is honored only by gpt-4o-mini-tts; the OpenAI SDK
silently drops it on tts-1 / tts-1-hd, so we only pass it on the expensive
path.

Truncates input to the last complete paragraph within the 3,500-character cap
(silent — FE infers from input length per FE plan §8 Seam 6).
"""

from typing import AsyncIterator

from ..clients import openai_client
from ..core.constants import TTS_CHAR_LIMIT
from ..core.errors import AppError
from ..schemas.rag import Language

# Per-language routing. English stays on tts-1 — there's no accent problem to
# solve and the multilingual model is wasted spend + latency. Hindi/Hinglish
# need gpt-4o-mini-tts because the instructions are doing real work there.
_TTS_CONFIG: dict[Language, dict] = {
    "english":  {"model": "tts-1",           "voice": "nova"},
    "hindi":    {"model": "gpt-4o-mini-tts", "voice": "sage"},
    "hinglish": {"model": "gpt-4o-mini-tts", "voice": "sage"},
}

# Instructions are tuned for voice="sage" on gpt-4o-mini-tts. Only the Hindi
# and Hinglish entries are actually sent — English routes to tts-1 which
# silently drops the kwarg, so we skip it for clarity.
_TTS_INSTRUCTIONS: dict[Language, str] = {
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
    """Yields mp3 chunks. Per-language model + voice routing."""
    cfg = _TTS_CONFIG.get(language, _TTS_CONFIG["english"])
    kwargs: dict = {
        "model": cfg["model"],
        "voice": cfg["voice"],
        "input": truncate_to_paragraph(text),
        "response_format": "mp3",
    }
    if cfg["model"].startswith("gpt-4o"):
        kwargs["instructions"] = _TTS_INSTRUCTIONS.get(language, _TTS_INSTRUCTIONS["hindi"])
    try:
        async with openai_client.get().audio.speech.with_streaming_response.create(**kwargs) as rsp:
            async for chunk in rsp.iter_bytes(chunk_size=8192):
                yield chunk
    except AppError:
        raise
    except Exception as e:
        raise AppError("generation_failed", "Unable to generate audio.", 500) from e
