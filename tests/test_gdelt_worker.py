import httpx
import pytest
import respx

from app import database as db_module
from app.repository import list_hazards
from app.workers import gdelt


@pytest.mark.asyncio
@respx.mock
async def test_gdelt_events_get_stable_ids_and_geocoded_coordinates(session_factory, monkeypatch):
    monkeypatch.setattr(db_module, "SessionLocal", session_factory)

    feed = {
        "articles": [
            {
                "title": "Protests erupt in capital",
                "sourcecountry": "Malaysia",
                "url": "https://example.com/article-1",
            },
            {
                "title": "Riot police deployed downtown",
                "sourcecountry": "Unknown Nowhereland",
                "url": "https://example.com/article-2",
            },
        ]
    }
    respx.get(url__regex=r".*gdeltproject\.org.*").mock(return_value=httpx.Response(200, json=feed))

    count = await gdelt.fetch_gdelt_unrest_events()
    assert count == 2

    async with session_factory() as session:
        records = await list_hazards(session)

    malaysia_event = next(r for r in records if "capital" in r.location_name)
    assert (malaysia_event.latitude, malaysia_event.longitude) == (4.2105, 101.9758)
    assert malaysia_event.hazard_type == "public_unrest"

    unknown_event = next(r for r in records if "downtown" in r.location_name)
    assert (unknown_event.latitude, unknown_event.longitude) == (0.0, 0.0)  # unmapped country falls back


@pytest.mark.asyncio
@respx.mock
async def test_gdelt_same_article_across_polls_updates_not_duplicates(session_factory, monkeypatch):
    """Reproduces the prototype's bug: unrest ids were derived from
    date+index and got silently overwritten/collided. With hashed URL-based
    ids, polling the same article twice should update one row, not create two.
    """
    monkeypatch.setattr(db_module, "SessionLocal", session_factory)

    feed = {"articles": [{"title": "Ongoing unrest", "sourcecountry": "Thailand", "url": "https://example.com/x"}]}
    respx.get(url__regex=r".*gdeltproject\.org.*").mock(return_value=httpx.Response(200, json=feed))

    await gdelt.fetch_gdelt_unrest_events()
    await gdelt.fetch_gdelt_unrest_events()

    async with session_factory() as session:
        records = await list_hazards(session)
    assert len(records) == 1


def test_score_sentiment_detects_negative_and_positive_lexicon():
    assert gdelt.score_sentiment("Violence and riots leave dozens killed") < 0
    assert gdelt.score_sentiment("Peace talks lead to successful ceasefire and relief") > 0
    assert gdelt.score_sentiment("Council meeting scheduled for Tuesday") == 0.0  # no lexicon words


@pytest.mark.asyncio
@respx.mock
async def test_gdelt_events_carry_sentiment_and_impact_fields(session_factory, monkeypatch):
    monkeypatch.setattr(db_module, "SessionLocal", session_factory)

    feed = {
        "articles": [
            {"title": "Deadly clashes reported after riots", "sourcecountry": "Malaysia", "url": "https://example.com/a"}
        ]
    }
    respx.get(url__regex=r".*gdeltproject\.org.*").mock(return_value=httpx.Response(200, json=feed))

    await gdelt.fetch_gdelt_unrest_events()

    async with session_factory() as session:
        records = await list_hazards(session)

    assert records[0].sentiment_score is not None
    assert records[0].sentiment_score < 0  # "deadly"/"clashes"/"riots" are negative-lexicon words
    assert records[0].estimated_impact == "Moderate"  # Orange alert level -> Moderate impact tier
