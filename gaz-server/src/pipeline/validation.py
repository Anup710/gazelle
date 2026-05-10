"""Educational-content classifier. One GPT-4o-mini call against a sample of the transcript."""

import json
import logging
from typing import Final

from ..clients import openai_client
from ..core.config import settings
from ..core.constants import VALIDATION_SAMPLE_CHARS

log = logging.getLogger(__name__)


VALIDATION_SYSTEM_PROMPT: Final[str] = """\
Classify whether the following transcript sample is from EDUCATIONAL content
(lecture, tutorial, course, explainer, instructional video) or NOT (entertainment,
vlog, podcast chatter, music, ads, news commentary without instructional intent).

Respond with strict JSON:
{
  "is_educational": true | false,
  "reason": "<one short sentence>"
}

Be permissive: science, math, programming, history, literature, finance, art
tutorials, language lessons, and how-to content are all EDUCATIONAL. A talk-show
interview without teaching intent is NOT.\
"""


async def classify_educational(full_text: str) -> dict:
    sample = full_text[:VALIDATION_SAMPLE_CHARS]
    rsp = await openai_client.get().chat.completions.create(
        model=settings().GEN_MODEL,
        temperature=0,
        max_tokens=80,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": VALIDATION_SYSTEM_PROMPT},
            {"role": "user", "content": f"TRANSCRIPT SAMPLE:\n{sample}"},
        ],
    )
    raw = rsp.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        log.warning("validation.bad_json", extra={"raw": raw[:200]})
        # Be permissive on parse error — don't block on a flaky model output.
        return {"is_educational": True, "reason": "Validator returned invalid JSON; permitted by default."}
    return {
        "is_educational": bool(parsed.get("is_educational", True)),
        "reason": str(parsed.get("reason", "")),
    }
