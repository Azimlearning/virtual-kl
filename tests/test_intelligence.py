import json

import pytest

from app.intelligence import rag
from app.intelligence.guardrails import domain_constraints_ok, grounding_score, numeric_grounding_ok
from app.intelligence.prompts import build_prompt
from app.intelligence.rag import _strip_code_fences


def test_build_prompt_includes_retrieved_context():
    hazards = [{"summary": "earthquake hazard in Testville, alert level Red"}]
    prompt = build_prompt("what happened in Testville", hazards)
    assert "Testville" in prompt
    assert "what happened in Testville" in prompt


def test_build_prompt_handles_no_results_honestly():
    """When nothing was retrieved, the prompt should tell the model that
    explicitly - this is what stops it from just making something up.
    """
    prompt = build_prompt("anything", [])
    assert "No matching hazard data" in prompt


def test_grounding_score_high_when_text_matches_context():
    hazards = [
        {
            "summary": "flood hazard in Bangkok, alert level Orange",
            "metadata": {"hazard_type": "flood", "source": "gdacs"},
        }
    ]
    text = "There is a flood hazard reported in Bangkok with an orange alert level."
    assert grounding_score(text, hazards) > 0.5


def test_grounding_score_low_when_text_is_unrelated():
    hazards = [
        {
            "summary": "flood hazard in Bangkok, alert level Orange",
            "metadata": {"hazard_type": "flood", "source": "gdacs"},
        }
    ]
    text = "This briefing is about spaceships and unrelated cosmic events entirely."
    assert grounding_score(text, hazards) < 0.3


def test_numeric_grounding_passes_when_numbers_match_source():
    hazards = [{"summary": "earthquake hazard in Testville, severity score 6.8"}]
    text = "A magnitude 6.8 earthquake was reported in Testville."
    assert numeric_grounding_ok(text, hazards) is True


def test_numeric_grounding_fails_on_fabricated_number():
    """The stricter check catches a specific fabricated statistic even
    when the surrounding words are all plausible and grounded - exactly
    the failure mode word-overlap grounding_score alone would miss.
    """
    hazards = [{"summary": "earthquake hazard in Testville, severity score 6.8"}]
    text = "Reports indicate 500 casualties from the earthquake in Testville."
    assert numeric_grounding_ok(text, hazards) is False


def test_strip_code_fences_removes_markdown_wrapper():
    wrapped = '```json\n{"executive_summary": "test"}\n```'
    assert _strip_code_fences(wrapped) == '{"executive_summary": "test"}'


def test_domain_constraints_pass_when_alert_level_matches_source():
    hazards = [{"metadata": {"alert_level": "Red"}}]
    text = "This is a confirmed Red alert situation."
    assert domain_constraints_ok(text, hazards) is True


def test_domain_constraints_fail_on_overstated_alert_level():
    """Catches a brief claiming a higher alert level than anything actually
    retrieved - a specific failure mode generic word-overlap would miss,
    since "red" and "alert" are both plausible vocabulary either way.
    """
    hazards = [{"metadata": {"alert_level": "Green"}}]
    text = "This is a confirmed Red alert situation requiring immediate evacuation."
    assert domain_constraints_ok(text, hazards) is False


def test_build_prompt_includes_role_framing():
    hazards = [{"summary": "earthquake hazard in Testville"}]
    operator_prompt = build_prompt("status update", hazards, role="operator")
    executive_prompt = build_prompt("status update", hazards, role="executive")
    assert "field operator" in operator_prompt
    assert "senior decision-maker" in executive_prompt


@pytest.mark.asyncio
async def test_generate_brief_parses_valid_structured_output(monkeypatch):
    async def fake_hybrid_search(query, n_results=5):
        return [
            {
                "id": "h1",
                "summary": "earthquake hazard in Testville, severity score 6.8",
                "metadata": {"hazard_type": "earthquake", "source": "usgs", "alert_level": "Orange"},
                "distance": 0.1,
            }
        ]

    async def fake_generate_completion(prompt):
        return json.dumps(
            {
                "executive_summary": "A magnitude 6.8 earthquake was reported in Testville.",
                "key_impacts": ["Local infrastructure at risk"],
                "recommendations": ["Monitor aftershocks"],
                "confidence": 0.8,
            }
        )

    monkeypatch.setattr(rag, "hybrid_search", fake_hybrid_search)
    monkeypatch.setattr(rag, "generate_completion", fake_generate_completion)

    result = await rag.generate_brief("what happened in Testville")

    assert result["schema_valid"] is True
    assert result["structured_brief"]["executive_summary"].startswith("A magnitude 6.8")
    assert result["sources"][0]["id"] == "h1"
    assert result["grounding_score"] > 0
    assert result["numbers_grounded"] is True
    assert result["domain_constraints_ok"] is True
    assert result["role"] == "analyst"  # default role
    # Orange source + all guardrails passing -> should be flagged alert-worthy
    assert result["alert_triggered"] is True


@pytest.mark.asyncio
async def test_generate_brief_handles_malformed_json_gracefully(monkeypatch):
    """If the LLM doesn't return valid JSON, the pipeline should degrade
    gracefully - flag schema_valid=False and keep the raw text - rather
    than crashing the endpoint.
    """

    async def fake_hybrid_search(query, n_results=5):
        return []

    async def fake_generate_completion(prompt):
        return "This is not JSON at all."

    monkeypatch.setattr(rag, "hybrid_search", fake_hybrid_search)
    monkeypatch.setattr(rag, "generate_completion", fake_generate_completion)

    result = await rag.generate_brief("anything")

    assert result["schema_valid"] is False
    assert result["structured_brief"] is None
    assert result["raw_output"] == "This is not JSON at all."
