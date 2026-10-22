from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import settings
from .models import Base

engine = create_async_engine(settings.database_url, pool_pre_ping=True)

# Workers import this module (not `from .database import SessionLocal`) and
# call `database.SessionLocal(...)` at use-time, so tests can monkeypatch
# this attribute to point at an in-memory SQLite session factory without
# needing a real Postgres instance running.
SessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(engine, expire_on_commit=False)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
