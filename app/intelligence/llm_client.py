"""The single place the backend talks to an LLM (decision D-06: Anthropic API only).

Kept as one small function (rather than scattering SDK calls around) so tests can
monkeypatch generate_completion directly, without a real API key or network.
The Anthropic SDK has a native async client, so no worker thread is needed.
"""

import anthropic

from ..config import settings


class LlmNotConfigured(RuntimeError):
    """Raised when ANTHROPIC_API_KEY is missing, naming the variable so the fix is obvious."""


async def generate_completion(prompt: str) -> str:
    if not settings.anthropic_api_key:
        raise LlmNotConfigured(
            "ANTHROPIC_API_KEY is not set. Add it to .env (see refdocs/guides/env_setup.md)."
        )
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=60.0, max_retries=1)
    response = await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=1500,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(block.text for block in response.content if getattr(block, "type", None) == "text")
