import os

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from common.arguments import arguments


def _build_url(db_path: str, async_driver: bool = True) -> str:
    abs_path = os.path.abspath(db_path) if os.path.isabs(db_path) else os.path.abspath(db_path)
    driver = "sqlite+aiosqlite" if async_driver else "sqlite"
    return f"{driver}:///{abs_path}"


DATABASE_URL = _build_url(arguments.db)

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=5,
    max_overflow=10,
    pool_recycle=3600,
    connect_args={"check_same_thread": False, "timeout": 30},
)

AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)


def run_migrations():
    """Create all tables defined in models that do not already exist."""
    from db.models import Base

    sync_engine = create_engine(
        _build_url(arguments.db, async_driver=False),
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(sync_engine)
    sync_engine.dispose()
