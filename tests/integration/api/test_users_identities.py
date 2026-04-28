"""Contract tests for user identity endpoints.

Tests GET/POST/DELETE /api/v1/users/{user_id}/identities.
"""

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User, UserIdentity
from nexus.identity_providers.models.identity_provider import IdentityProvider
from nexus.identity_providers.models.identity_provider_configuration import OIDCConfiguration

USERS_URL = "/api/v1/users"


@pytest.fixture
def _oidc_config() -> OIDCConfiguration:
    """Create a minimal OIDC configuration for testing."""
    return OIDCConfiguration(
        issuer_url="https://idp.example.com",
        client_id="test-client-id",
        client_secret="test-client-secret",  # noqa: S106
        redirect_uri="http://localhost:8000/api/v1/auth/oidc/callback",
    )


@pytest.fixture
async def identity_provider(
    test_db_session: AsyncSession, _oidc_config: OIDCConfiguration, test_user: User
) -> IdentityProvider:
    """Create a test identity provider."""
    provider = IdentityProvider(
        id=uuid4(),
        name="Test OIDC Provider",
        configuration=_oidc_config,
        enabled=True,
        created_by=test_user.id,
        updated_by=test_user.id,
    )
    test_db_session.add(provider)
    await test_db_session.commit()
    return provider


@pytest.fixture
async def user_identity(
    test_db_session: AsyncSession,
    test_user: User,
    identity_provider: IdentityProvider,
) -> UserIdentity:
    """Create a test user identity."""
    identity = UserIdentity(
        id=uuid4(),
        user_id=test_user.id,
        identity_provider_id=identity_provider.id,
        issuer="https://idp.example.com",
        subject="test-subject-123",
    )
    test_db_session.add(identity)
    await test_db_session.commit()
    return identity


class TestListUserIdentities:
    """Tests for GET /users/{user_id}/identities."""

    @pytest.mark.asyncio
    async def test_list_identities_empty(self, auth_client: AsyncClient, test_user: User) -> None:
        """Test listing identities for a user with none."""
        response = await auth_client.get(f"{USERS_URL}/{test_user.id}/identities")

        assert response.status_code == 200
        body = response.json()
        assert body["resources"] == []

    @pytest.mark.asyncio
    async def test_list_identities_with_identity(
        self,
        auth_client: AsyncClient,
        test_user: User,
        user_identity: UserIdentity,
        identity_provider: IdentityProvider,
    ) -> None:
        """Test listing identities returns linked identities."""
        response = await auth_client.get(f"{USERS_URL}/{test_user.id}/identities")

        assert response.status_code == 200
        data = response.json()["resources"]
        assert len(data) == 1
        assert data[0]["id"] == str(user_identity.id)
        assert data[0]["user_id"] == str(test_user.id)
        assert data[0]["issuer"] == "https://idp.example.com"
        assert data[0]["subject"] == "test-subject-123"
        assert data[0]["provider_name"] == identity_provider.name

    @pytest.mark.asyncio
    async def test_list_identities_user_not_found(self, admin_client: AsyncClient) -> None:
        """Test 404 when user does not exist."""
        response = await admin_client.get(f"{USERS_URL}/{uuid4()}/identities")

        assert response.status_code == 404


class TestAttachUserIdentity:
    """Tests for POST /users/{user_id}/identities."""

    @pytest.mark.asyncio
    async def test_attach_identity_success(
        self,
        admin_client: AsyncClient,
        test_db_session: AsyncSession,
        identity_provider: IdentityProvider,
    ) -> None:
        """Test moving an identity from one user to another."""
        from nexus.auth.passwords import hash_password

        # Create source and target users
        source = User(
            username="source-user",
            email="source@example.com",
            full_name="Source User",
            password_hash=hash_password("password123"),
        )
        target = User(
            username="target-user",
            email="target@example.com",
            full_name="Target User",
            password_hash=hash_password("password123"),
        )
        test_db_session.add(source)
        test_db_session.add(target)
        await test_db_session.commit()

        # Create identity on source user
        identity = UserIdentity(
            id=uuid4(),
            user_id=source.id,
            identity_provider_id=identity_provider.id,
            issuer="https://idp.example.com",
            subject="attach-test-sub",
        )
        test_db_session.add(identity)
        await test_db_session.commit()

        # Attach to target user
        response = await admin_client.post(
            f"{USERS_URL}/{target.id}/identities",
            json={"identity_id": str(identity.id)},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["user_id"] == str(target.id)
        assert data["subject"] == "attach-test-sub"

    @pytest.mark.asyncio
    async def test_attach_identity_not_found(self, admin_client: AsyncClient, test_user: User) -> None:
        """Test 404 when identity does not exist."""
        response = await admin_client.post(
            f"{USERS_URL}/{test_user.id}/identities",
            json={"identity_id": str(uuid4())},
        )

        assert response.status_code == 404


class TestDetachUserIdentity:
    """Tests for DELETE /users/{user_id}/identities/{identity_id}."""

    @pytest.mark.asyncio
    async def test_detach_identity_success(
        self,
        auth_client: AsyncClient,
        test_user: User,
        user_identity: UserIdentity,
    ) -> None:
        """Test successfully detaching an identity from a user with a password."""
        response = await auth_client.delete(
            f"{USERS_URL}/{test_user.id}/identities/{user_identity.id}",
        )

        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_detach_identity_not_found(self, auth_client: AsyncClient, test_user: User) -> None:
        """Test 404 when identity does not exist."""
        response = await auth_client.delete(
            f"{USERS_URL}/{test_user.id}/identities/{uuid4()}",
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_detach_identity_wrong_user(
        self,
        admin_client: AsyncClient,
        user_identity: UserIdentity,
    ) -> None:
        """Test 404 when identity belongs to a different user."""
        response = await admin_client.delete(
            f"{USERS_URL}/{uuid4()}/identities/{user_identity.id}",
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_detach_last_identity_blocked_for_passwordless_user(
        self,
        admin_client: AsyncClient,
        test_db_session: AsyncSession,
        identity_provider: IdentityProvider,
    ) -> None:
        """Test 409 when detaching the last identity from a user with no password."""
        # Create a federated-only user (no password)
        fed_user = User(
            id=uuid4(),
            username="fed-only-user",
            email="fed-only@example.com",
            full_name="Federated Only",
            password_hash=None,
            is_enabled=True,
        )
        test_db_session.add(fed_user)
        await test_db_session.commit()

        # Give them a single identity
        identity = UserIdentity(
            id=uuid4(),
            user_id=fed_user.id,
            identity_provider_id=identity_provider.id,
            issuer="https://idp.example.com",
            subject="last-identity-sub",
        )
        test_db_session.add(identity)
        await test_db_session.commit()

        # Attempt to detach — should be blocked
        response = await admin_client.delete(
            f"{USERS_URL}/{fed_user.id}/identities/{identity.id}",
        )

        assert response.status_code == 409
