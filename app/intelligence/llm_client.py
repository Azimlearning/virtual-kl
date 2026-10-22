"""Kept as one small function (rather than scattering ollama calls around)
so tests can monkeypatch generate_completion directly, without needing a
real Ollama instance or a downloaded model.

Ollama's Python client is synchronous under the hood, so - same pattern as
the Chroma client - we run the actual call in a background thread via
asyncio.to_thread rather than blocking the FastAPI event loop.
"""

import asyncio

import ollama

from ..config import settings


async def generate_completion(prompt: str) -> str:
    def _call() -> str:
        client = ollama.Client(host=settings.ollama_host)
        response = client.chat(
            model=settings.ollama_model,
            messages=[{"role": "user", "content": prompt}],
            options={"temperature": 0.2},
        )
        return response["message"]["content"]

    return await asyncio.to_thread(_call)
