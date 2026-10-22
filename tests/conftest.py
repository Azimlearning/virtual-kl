import httpx
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app import database
from app.main import app
from app.models import Base


@pytest_asyncio.fixture
async def session_factory():
    """An in-memory SQLite engine, shared across connections via StaticPool
    so the same in-memory DB persists across multiple `async with
    session_factory() as session:` blocks within one test (plain :memory:
    without StaticPool gives each connection its own empty DB).
    """
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


@pytest_asyncio.fixture
async def client(session_factory, monkeypatch):
    """HTTP client wired straight to the FastAPI app and the in-memory DB.
    Shared by every endpoint test. ASGITransport doesn't run the app's
    lifespan, so no real network fetches or scheduler start-up happen."""
    monkeypatch.setattr(database, "SessionLocal", session_factory)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
