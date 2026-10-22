"""Impact analytics (Layer 5 gap): trends over time and top affected
regions, named explicitly in the architecture's Presentation Layer
description but not yet built.

Aggregation happens in plain Python rather than SQL date-grouping,
deliberately - it keeps this portable across SQLite (tests) and Postgres
(prod) without dialect-specific date-truncation functions, consistent
with how the rest of this app avoids dialect-specific SQL.
"""

import re
from collections import Counter, defaultdict
from datetime import datetime, timezone

from .models import HazardRecord

# No source provides a clean, separate "country"/"region" field - only a
# free-text location_name, and its format varies by source:
#   USGS:        "93 km SE of Kirakira, Solomon Islands"
#   GDACS:       "Orange flood alert in India"
#   Open-Meteo:  "Atmospheric anomaly in Miami, USA (2.2 standard deviations ...)"
#   GDELT:       "<headline> (Malaysia)"
# This is a documented heuristic, not a guaranteed-correct parser - some
# GDACS formats (e.g. certain cyclone notifications) don't cleanly name a
# country at all and fall back to returning the full string unchanged,
# which is honest rather than silently wrong.
_TRAILING_PARENS = re.compile(r"\s*\([^()]*\)\s*$")
_COMMA_SUFFIX = re.compile(r",\s*([^,()]+)$")
_IN_SUFFIX = re.compile(r"\bin\s+([A-Z][\w\s]+?)$")
_PAREN_SUFFIX = re.compile(r"\(([^()]+)\)\s*$")


def extract_region(location_name: str) -> str:
    text = location_name.strip()

    # Strip any trailing parenthetical remark first (e.g. Open-Meteo's
    # "(X standard deviations ...)" note) before looking for a comma/"in"
    # pattern - otherwise a weather hazard's region gets misidentified as
    # that remark instead of the actual country.
    without_trailing_parens = _TRAILING_PARENS.sub("", text)

    comma_match = _COMMA_SUFFIX.search(without_trailing_parens)
    if comma_match:
        return comma_match.group(1).strip()

    in_match = _IN_SUFFIX.search(without_trailing_parens)
    if in_match:
        return in_match.group(1).strip()

    # Nothing found even after stripping parens - try the original
    # trailing parenthetical itself (GDELT style: "<headline> (Country)",
    # where the country IS the parenthetical, not a remark to discard).
    paren_match = _PAREN_SUFFIX.search(text)
    if paren_match:
        return paren_match.group(1).strip()

    return text


def trends_by_day(hazards: list[HazardRecord]) -> list[dict]:
    """Daily hazard count broken down by hazard_type - the data a
    trend-over-time chart needs. Returns one row per day, with a key per
    hazard_type present that day (sparse - days/types with zero count
    just don't have that key, which the dashboard fills as 0).
    """
    buckets: dict[str, Counter] = defaultdict(Counter)
    for h in hazards:
        day = h.timestamp.astimezone(timezone.utc).date().isoformat()
        buckets[day][h.hazard_type] += 1

    return [{"date": day, **dict(counts)} for day, counts in sorted(buckets.items())]


def top_regions(hazards: list[HazardRecord], limit: int = 10) -> list[dict]:
    counts = Counter(extract_region(h.location_name) for h in hazards)
    return [{"region": region, "count": count} for region, count in counts.most_common(limit)]
