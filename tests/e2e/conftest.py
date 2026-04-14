"""Shared fixtures for Nexus E2E tests."""

import os

import httpx
import pytest
from nexus_api_client import AuthenticatedClient
from nexus_api_client.api import NexusApiRegistry


def _generate_e2e_token() -> str:
    """Generate a JWT access token for e2e tests using the local signing key.

    This avoids the need for Redis (required by the /auth/login endpoint)
    by signing the token directly with the private key from .secrets/.
    The token uses the seeded admin user's actual database ID to satisfy
    foreign key constraints on created_by/updated_by fields.
    """
    # Ensure the JWT private key path is configured for TokenService
    if not os.environ.get("APP_JWT_PRIVATE_KEY_PATH"):
        os.environ["APP_JWT_PRIVATE_KEY_PATH"] = ".secrets/jwt-primary.pem"

    # Match the server scheme so the JWT issuer claim matches the API's expectation
    if not os.environ.get("APP_SERVER_SCHEME"):
        os.environ["APP_SERVER_SCHEME"] = "https"

    # Import lazily so env vars are set before settings are read
    from nexus.auth.services.token_service import TokenService
    from nexus.core.config.base import get_settings

    get_settings.cache_clear()
    settings = get_settings()

    # Look up the seeded admin user's ID from the database
    import asyncio

    import asyncpg

    async def _get_admin_id() -> str:
        db_url = str(settings.database_url).replace("postgresql+asyncpg://", "postgresql://")
        conn = await asyncpg.connect(db_url)
        try:
            row = await conn.fetchrow("SELECT id FROM users WHERE username = 'admin' LIMIT 1")
        finally:
            await conn.close()
        if not row:
            msg = "Admin user not found in database. Run migrations first: make dev"
            raise RuntimeError(msg)
        return str(row["id"])

    admin_id = asyncio.run(_get_admin_id())

    token_service = TokenService()
    return token_service.create_access_token(
        user_id=admin_id,
        username="admin",
        email="admin@nexus.local",
    )


@pytest.fixture(scope="session")
def nexus_client() -> AuthenticatedClient:
    """Return an authenticated Nexus API client connected to the test environment."""
    base_url = os.environ.get("APP_BASE_URL", "http://localhost:8000")

    try:
        response = httpx.get(f"{base_url}/health", timeout=5, verify=False)  # noqa: S501
        response.raise_for_status()
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        pytest.exit(
            f"Environment not available at {base_url}: {exc}\n"
            "Start the services first with: make services-run && make dev",
            returncode=1,
        )

    access_token = _generate_e2e_token()

    return AuthenticatedClient(base_url=base_url, token=access_token, verify_ssl=False)


@pytest.fixture(scope="session")
def nexus_api(nexus_client: AuthenticatedClient) -> NexusApiRegistry:
    """Return a NexusApiRegistry bound to the authenticated test client."""
    return NexusApiRegistry(nexus_client)
