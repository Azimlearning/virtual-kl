from pydantic import BaseModel, Field


class StructuredBrief(BaseModel):
    """The schema the LLM is instructed to follow (see prompts.py). If the
    model's output doesn't parse into this shape, that's itself a useful
    guardrail signal - a model producing malformed output on a
    fact-constrained task is a warning sign worth surfacing, not silently
    working around.
    """

    executive_summary: str
    key_impacts: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    confidence: float = 0.0
