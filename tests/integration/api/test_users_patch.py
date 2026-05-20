"""Contract tests for PATCH /api/v1/users/{user_id} endpoint.

Tests partial update functionality, validation, admin restrictions, and conflict handling.
"""

from collections.abc import Awaitable, Callable

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth import get_current_user
from nexus.core.models import User
from tests.integration.api.conftest import make_admin, make_user_role

USERS_URL = "/api/v1/users"


class TestUsersPatchContract:
    """Contract tests for user patch endpoint."""

    @pytest.mark.asyncio
    async def test_update_user_full_name(self, admin_client: AsyncClient, test_user: User) -> None:
        """Test successful full_name update returns 200."""
        patch_data = {"full_name": "Updated Name"}

        response = await admin_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["full_name"] == "Updated Name"
        assert data["username"] == test_user.username

    @pytest.mark.asyncio
    async def test_update_user_email(self, admin_client: AsyncClient, test_user: User) -> None:
        """Test successful email update."""
        patch_data = {"email": "newemail@example.com"}

        response = await admin_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["email"] == "newemail@example.com"

    @pytest.mark.asyncio
    async def test_update_user_is_enabled(self, admin_client: AsyncClient, test_user: User) -> None:
        """Test successful is_enabled update (disable user)."""
        patch_data = {"is_enabled": False}

        response = await admin_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["is_enabled"] is False

    @pytest.mark.asyncio
    async def test_update_user_multiple_fields(self, admin_client: AsyncClient, test_user: User) -> None:
        """Test updating multiple fields at once."""
        patch_data = {"full_name": "New Full Name", "email": "multi@example.com"}

        response = await admin_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["full_name"] == "New Full Name"
        assert data["email"] == "multi@example.com"

    @pytest.mark.asyncio
    async def test_update_user_empty_patch(self, admin_client: AsyncClient, test_user: User) -> None:
        """Test PATCH with empty body returns 200 unchanged."""
        patch_data: dict[str, str] = {}

        response = await admin_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["username"] == test_user.username
        assert data["email"] == test_user.email

    @pytest.mark.asyncio
    async def test_update_user_preserves_unchanged_fields(self, admin_client: AsyncClient, test_user: User) -> None:
        """Test partial update preserves fields not included in patch."""
        patch_data = {"full_name": "Only Name Changed"}

        response = await admin_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["full_name"] == "Only Name Changed"
        assert data["email"] == test_user.email
        assert data["is_enabled"] == test_user.is_enabled

    @pytest.mark.asyncio
    async def test_update_user_updates_timestamp(self, admin_client: AsyncClient, test_user: User) -> None:
        """Test that updated_at timestamp changes after update."""
        original_updated_at = test_user.updated_at

        patch_data = {"full_name": "Timestamp Test"}

        response = await admin_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["updated_at"] != str(original_updated_at)

    @pytest.mark.asyncio
    async def test_update_user_duplicate_email_rejected(self, admin_client: AsyncClient, test_user: User) -> None:
        """Test that updating to a duplicate email is rejected (email must be unique)."""
        # Create another user
        create_response = await admin_client.post(
            USERS_URL,
            json={
                "username": "otheruser",
                "email": "existing@example.com",
                "full_name": "Other User",
                "password": "SecurePassword123!",
            },
        )
        assert create_response.status_code == 201

        # Update test_user to the same email — should fail
        patch_data = {"email": "existing@example.com"}
        response = await admin_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 409

    @pytest.mark.asyncio
    async def test_update_user_not_found(self, admin_client: AsyncClient) -> None:
        """Test 404 error for non-existent user."""
        user_id = "99999999-9999-9999-9999-999999999999"
        patch_data = {"full_name": "New Name"}

        response = await admin_client.patch(f"{USERS_URL}/{user_id}", json=patch_data)

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_user_full_name_too_long(self, admin_client: AsyncClient, test_user: User) -> None:
        """Test 422 when full_name exceeds max length."""
        patch_data = {"full_name": "x" * 256}

        response = await admin_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_user_unauthenticated(self, base_client: AsyncClient, test_user: User) -> None:
        """Test updating a user requires authentication."""
        patch_data = {"full_name": "Unauth Update"}

        response = await base_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 401


class TestUsersPatchAdminRestrictions:
    """Tests for admin self-disable restriction."""

    @pytest.mark.asyncio
    async def test_admin_can_disable_self(self, auth_client_as_admin: AsyncClient, admin_user: User) -> None:
        """Test admin can disable their own account."""
        patch_data = {"is_enabled": False}

        response = await auth_client_as_admin.patch(f"{USERS_URL}/{admin_user.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["is_enabled"] is False

    @pytest.mark.asyncio
    async def test_non_admin_cannot_disable_admin(
        self,
        base_client: AsyncClient,
        admin_user: User,
        test_db_session: AsyncSession,
        user_factory: Callable[..., Awaitable[User]],
    ) -> None:
        """Test non-admin user cannot disable the built-in admin account.

        Creates a dedicated limited-role user (with only 'user' role) and
        verifies they get 403 from PermissionChecker (no user:update permission).
        """
        from nexus.api.main import app

        limited_user = await user_factory(username="limited-patch", email="limited-patch@test.com")
        await make_user_role(test_db_session, limited_user)

        async def override_as_user() -> User:
            return limited_user

        app.dependency_overrides[get_current_user] = override_as_user
        patch_data = {"is_enabled": False}

        response = await base_client.patch(f"{USERS_URL}/{admin_user.id}", json=patch_data)

        # Non-admin user lacks user:update permission → 403
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_can_update_own_non_builtin_fields(
        self,
        base_client: AsyncClient,
        user_factory: Callable[..., Awaitable[User]],
        test_db_session: AsyncSession,
    ) -> None:
        """Test non-builtin admin can update their own non-is_enabled fields."""
        from nexus.api.main import app

        # Create a non-builtin admin user (is_builtin=False allows field updates)
        non_builtin_admin = await user_factory(
            username="non-builtin-admin", email="non-builtin-admin@test.com", is_builtin=False
        )
        await make_admin(test_db_session, non_builtin_admin)

        async def override_as_admin() -> User:
            return non_builtin_admin

        app.dependency_overrides[get_current_user] = override_as_admin

        patch_data = {"full_name": "Updated Admin Name"}
        response = await base_client.patch(f"{USERS_URL}/{non_builtin_admin.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["full_name"] == "Updated Admin Name"

    @pytest.mark.asyncio
    async def test_admin_can_disable_and_reenable_self(self, admin_client: AsyncClient, admin_user: User) -> None:
        """Test admin can disable and re-enable their own account."""
        # Step 1: Admin disables itself
        disable_response = await admin_client.patch(f"{USERS_URL}/{admin_user.id}", json={"is_enabled": False})
        assert disable_response.status_code == 200

        # Step 2: Admin re-enables itself
        enable_response = await admin_client.patch(f"{USERS_URL}/{admin_user.id}", json={"is_enabled": True})
        assert enable_response.status_code == 200

        data = enable_response.json()
        assert data["is_enabled"] is True
