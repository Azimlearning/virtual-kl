"""Where does each hazard's "open the original source" link point?

Priority: (1) the exact URL the feed gave us (stored in hazard_links),
(2) a URL we can rebuild from the id alone (USGS event pages follow a fixed
pattern - which also makes links work for rows ingested before this feature
existed), (3) nothing.

There is deliberately NO homepage fallback. Earlier versions linked a
GDACS item with no per-event URL to "gdacs.org", which looks like a source
but proves nothing about that event. A link is shown only when it really
points at the thing it is attached to.
"""


def resolve_url(source: str, hazard_id: str, stored: str | None) -> str | None:
    if stored:
        return stored
    if source == "usgs" and hazard_id:
        return f"https://earthquake.usgs.gov/earthquakes/eventpage/{hazard_id}"
    return None
