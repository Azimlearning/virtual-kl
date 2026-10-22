"""generate_completion talks to the Anthropic API (D-06). These tests never touch the network:
the SDK client is replaced with a fake that records what it was asked."""

from types import SimpleNamespace

import pytest

from app.config import settings
from app.intelligence import llm_client


class _FakeMessages:
    def __init__(self, calls):
        self._calls = calls

    async def create(self, **kwargs):
        self._calls.append(kwargs)
        return SimpleNamespace(
            content=[
                SimpleNamespace(type="text", text='{"executive_summary": "ok"}'),
                SimpleNamespace(type="tool_use", text=None),
            ]
        )


def _fake_client_factory(calls):
    def factory(**kwargs):
        calls.append({"client_kwargs": kwargs})
        return SimpleNamespace(messages=_FakeMessages(calls))

    return factory


@pytest.mark.asyncio
async def test_sends_configured_model_and_prompt_and_joins_text_blocks(monkeypatch):
    calls = []
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(settings, "anthropic_model", "claude-test-model")
    monkeypatch.setattr(llm_client.anthropic, "AsyncAnthropic", _fake_client_factory(calls))

    out = await llm_client.generate_completion("write a brief")

    assert out == '{"executive_summary": "ok"}'
    assert calls[0]["client_kwargs"]["api_key"] == "test-key"
    request = calls[1]
    assert request["model"] == "claude-test-model"
    assert request["messages"] == [{"role": "user", "content": "write a brief"}]
    assert request["max_tokens"] > 0


@pytest.mark.asyncio
async def test_missing_key_raises_a_clear_error_naming_the_variable(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    with pytest.raises(llm_client.LlmNotConfigured, match="ANTHROPIC_API_KEY"):
        await llm_client.generate_completion("anything")
