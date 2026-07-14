"""JWT authentication fixtures for integration tests."""

from __future__ import annotations

from collections.abc import AsyncGenerator, Callable
from typing import TYPE_CHECKING

import pytest
import pytest_asyncio
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth.services.token_service import TokenService
from nexus.core.models import User

if TYPE_CHECKING:
    from fastapi import FastAPI
    from httpx import AsyncClient
    from nexus.tool_manager.lib.providers.factory import ProviderFactory


@pytest.fixture
def token_service() -> TokenService:
    """Create a TokenService instance for generating test tokens."""
    return TokenService()


@pytest_asyncio.fixture
async def jwt_access_token(test_user: User, token_service: TokenService) -> str:
    """Generate a valid JWT access token for the test user."""
    return token_service.create_access_token(
        subject_id=test_user.id,
        username=test_user.username,
        email=test_user.email or "",
    )


@pytest_asyncio.fixture
async def jwt_auth_headers(jwt_access_token: str) -> dict[str, str]:
    """Create authorization headers with JWT Bearer token."""
    return {"Authorization": f"Bearer {jwt_access_token}"}


@pytest_asyncio.fixture
async def jwt_client(
    test_db_session: AsyncSession,
    session_app: "FastAPI",
    test_user: User,
    token_service: TokenService,
) -> AsyncGenerator["AsyncClient", None]:
    """Create a test client with real JWT authentication."""
    from contextlib import asynccontextmanager

    from httpx import ASGITransport, AsyncClient

    from nexus.core.database.session import get_db

    access_token = token_service.create_access_token(
        subject_id=test_user.id,
        username=test_user.username,
        email=test_user.email or "",
    )

    @asynccontextmanager
    async def _scoped_overrides(app: "FastAPI") -> AsyncGenerator[None, None]:
        saved = dict(app.dependency_overrides)
        try:
            yield
        finally:
            app.dependency_overrides.clear()
            app.dependency_overrides.update(saved)

    async with _scoped_overrides(session_app):

        async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
            yield test_db_session

        session_app.dependency_overrides[get_db] = override_get_db

        async with AsyncClient(
            transport=ASGITransport(app=session_app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {access_token}"},
        ) as client:
            yield client


@pytest.fixture
def create_jwt_for_user(token_service: TokenService) -> Callable[[User], str]:
    """Factory fixture to create JWT tokens for any user."""

    def _create_token(user: User) -> str:
        return token_service.create_access_token(
            subject_id=user.id,
            username=user.username,
            email=user.email or "",
        )

    return _create_token


@pytest_asyncio.fixture
async def jwt_client_with_mocked_llm(
    jwt_client: "AsyncClient", mock_openrouter_llm: object, _override_temporal: None
) -> "AsyncClient":
    """JWT-authenticated test client with mocked LLM and Temporal support."""
    return jwt_client


@pytest_asyncio.fixture
async def jwt_client_with_provider_factory(
    jwt_client: "AsyncClient",
    test_provider_factory: "ProviderFactory",
) -> "AsyncClient":
    """Create a JWT-authenticated test client with provider factory."""
    from nexus.api.main import app
    from nexus.tool_manager.lib.providers.factory import get_provider_factory

    async def override_get_provider_factory() -> "ProviderFactory":
        return test_provider_factory

    app.dependency_overrides[get_provider_factory] = override_get_provider_factory
    return jwt_client
