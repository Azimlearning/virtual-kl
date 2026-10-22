"""Neo4j's official driver ships both a sync and async API in the same
package. We use the async one (AsyncGraphDatabase) so graph queries don't
block the FastAPI event loop, matching how the rest of this app is
structured. One driver instance is reused for the app's lifetime — it
manages its own connection pool internally, so there's no need (and no
benefit) to open a new one per request.
"""

from neo4j import AsyncDriver, AsyncGraphDatabase

from ..config import settings

_driver: AsyncDriver | None = None


def get_neo4j_driver() -> AsyncDriver:
    global _driver
    if _driver is None:
        _driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password)
        )
    return _driver


async def close_neo4j_driver() -> None:
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None
