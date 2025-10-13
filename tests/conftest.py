"""Shared pytest fixtures for all tests."""

import asyncio
import os
from collections.abc import AsyncGenerator, Generator

import pytest
import pytest_asyncio
import sqlalchemy
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from nexus_api.db import get_db
from nexus_api.main import app
from nexus_api.models import user, workflow, workflow_version
from nexus_api.models.base import Base

# Ensure models are registered with SQLAlchemy metadata
_ = (user, workflow, workflow_version)

# Test database URL (PostgreSQL)
# Override with TEST_DATABASE_URL environment variable if needed
# Uses same credentials as development database (NEXUS_DB_USER/NEXUS_DB_PASSWORD)
# but connects to separate test database
TEST_DB_USER = os.getenv("NEXUS_DB_USER", "admin")
TEST_DB_PASSWORD = os.getenv("NEXUS_DB_PASSWORD", "admin")
TEST_DB_HOST = os.getenv("NEXUS_DB_HOST", "localhost")
TEST_DB_PORT = os.getenv("NEXUS_DB_PORT", "5432")
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    f"postgresql+asyncpg://{TEST_DB_USER}:{TEST_DB_PASSWORD}@{TEST_DB_HOST}:{TEST_DB_PORT}/nexus_test",
)


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Create an event loop for the test session.

    Yields:
        Event loop for async tests

    """
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_db_engine() -> AsyncGenerator[AsyncEngine, None]:
    """Create a test database engine.

    Yields:
        Async engine for test database

    """
    # First, connect to the default database to create test database if needed
    default_db_url = f"postgresql+asyncpg://{TEST_DB_USER}:{TEST_DB_PASSWORD}@{TEST_DB_HOST}:{TEST_DB_PORT}/postgres"
    temp_engine = create_async_engine(default_db_url, isolation_level="AUTOCOMMIT", poolclass=NullPool)

    try:
        async with temp_engine.connect() as conn:
            # Check if test database exists
            result = await conn.execute(sqlalchemy.text("SELECT 1 FROM pg_database WHERE datname = 'nexus_test'"))
            exists = result.scalar() is not None

            if not exists:
                # Create test database
                await conn.execute(sqlalchemy.text("CREATE DATABASE nexus_test"))
    finally:
        await temp_engine.dispose()

    # Now connect to the test database
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        poolclass=NullPool,
    )

    # Import models and create tables once for the session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Drop tables and dispose engine after session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def test_db_session(test_db_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session.

    Args:
        test_db_engine: Test database engine

    Yields:
        AsyncSession for tests

    """
    # Clear all data before each test for isolation
    async with test_db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(
        test_db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    session = async_session()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


@pytest_asyncio.fixture
async def test_client(test_db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create a test client with database session override.

    Args:
        test_db_session: Test database session

    Yields:
        AsyncClient for API testing

    """

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield test_db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
def sync_test_client() -> Generator[TestClient, None, None]:
    """Create a synchronous test client.

    Yields:
        TestClient for synchronous API testing

    """
    with TestClient(app) as client:
        yield client
