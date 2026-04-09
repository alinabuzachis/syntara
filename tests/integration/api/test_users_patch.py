"""Contract tests for PATCH /api/v1/users/{user_id} endpoint.

Tests partial update functionality, validation, admin restrictions, and conflict handling.
"""

import pytest
from httpx import AsyncClient

from nexus.auth import get_current_user
from nexus.core.models import User
from tests.helpers.error_data import assert_error_data

USERS_URL = "/api/v1/users"


class TestUsersPatchContract:
    """Contract tests for user patch endpoint."""

    @pytest.mark.asyncio
    async def test_update_user_full_name(self, auth_client: AsyncClient, test_user: User) -> None:
        """Test successful full_name update returns 200."""
        patch_data = {"full_name": "Updated Name"}

        response = await auth_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["full_name"] == "Updated Name"
        assert data["username"] == test_user.username

    @pytest.mark.asyncio
    async def test_update_user_email(self, auth_client: AsyncClient, test_user: User) -> None:
        """Test successful email update."""
        patch_data = {"email": "newemail@example.com"}

        response = await auth_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["email"] == "newemail@example.com"

    @pytest.mark.asyncio
    async def test_update_user_role(self, auth_client: AsyncClient, test_user: User) -> None:
        """Test successful role update."""
        patch_data = {"role": "administrator"}

        response = await auth_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["role"] == "administrator"

    @pytest.mark.asyncio
    async def test_update_user_is_active(self, auth_client: AsyncClient, test_user: User) -> None:
        """Test successful is_active update (disable user)."""
        patch_data = {"is_active": False}

        response = await auth_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["is_active"] is False

    @pytest.mark.asyncio
    async def test_update_user_multiple_fields(self, auth_client: AsyncClient, test_user: User) -> None:
        """Test updating multiple fields at once."""
        patch_data = {"full_name": "New Full Name", "email": "multi@example.com", "role": "approver"}

        response = await auth_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["full_name"] == "New Full Name"
        assert data["email"] == "multi@example.com"
        assert data["role"] == "approver"

    @pytest.mark.asyncio
    async def test_update_user_empty_patch(self, auth_client: AsyncClient, test_user: User) -> None:
        """Test PATCH with empty body returns 200 unchanged."""
        patch_data: dict[str, str] = {}

        response = await auth_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["username"] == test_user.username
        assert data["email"] == test_user.email

    @pytest.mark.asyncio
    async def test_update_user_preserves_unchanged_fields(self, auth_client: AsyncClient, test_user: User) -> None:
        """Test partial update preserves fields not included in patch."""
        patch_data = {"full_name": "Only Name Changed"}

        response = await auth_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["full_name"] == "Only Name Changed"
        assert data["email"] == test_user.email
        assert data["role"] == test_user.role.value
        assert data["is_active"] == test_user.is_active

    @pytest.mark.asyncio
    async def test_update_user_updates_timestamp(self, auth_client: AsyncClient, test_user: User) -> None:
        """Test that updated_at timestamp changes after update."""
        original_updated_at = test_user.updated_at

        patch_data = {"full_name": "Timestamp Test"}

        response = await auth_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["updated_at"] != str(original_updated_at)

    @pytest.mark.asyncio
    async def test_update_user_email_conflict(self, auth_client: AsyncClient, test_user: User) -> None:
        """Test 409 conflict when updating to an existing email."""
        # Create another user
        create_response = await auth_client.post(
            USERS_URL,
            json={
                "username": "otheruser",
                "email": "existing@example.com",
                "full_name": "Other User",
                "password": "securepassword123",
            },
        )
        assert create_response.status_code == 201

        # Try to update test_user to the same email
        patch_data = {"email": "existing@example.com"}
        response = await auth_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 409
        assert_error_data(
            response,
            error_type="https://api.nexus.com/errors/resource-conflict",
            title="Email Conflict",
            detail="A user with this email already exists",
            code="USER_EMAIL_CONFLICT",
            retryable=False,
        )

    @pytest.mark.asyncio
    async def test_update_user_not_found(self, auth_client: AsyncClient) -> None:
        """Test 404 error for non-existent user."""
        user_id = "99999999-9999-9999-9999-999999999999"
        patch_data = {"full_name": "New Name"}

        response = await auth_client.patch(f"{USERS_URL}/{user_id}", json=patch_data)

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_user_invalid_role(self, auth_client: AsyncClient, test_user: User) -> None:
        """Test 422 when updating to invalid role."""
        patch_data = {"role": "invalid_role"}

        response = await auth_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_user_full_name_too_long(self, auth_client: AsyncClient, test_user: User) -> None:
        """Test 422 when full_name exceeds max length."""
        patch_data = {"full_name": "x" * 256}

        response = await auth_client.patch(f"{USERS_URL}/{test_user.id}", json=patch_data)

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
        patch_data = {"is_active": False}

        response = await auth_client_as_admin.patch(f"{USERS_URL}/{admin_user.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["is_active"] is False

    @pytest.mark.asyncio
    async def test_non_admin_cannot_disable_admin(self, auth_client: AsyncClient, admin_user: User) -> None:
        """Test non-admin user cannot disable the built-in admin account."""
        patch_data = {"is_active": False}

        response = await auth_client.patch(f"{USERS_URL}/{admin_user.id}", json=patch_data)

        assert response.status_code == 403
        assert_error_data(
            response,
            error_type="https://api.nexus.com/errors/forbidden",
            title="Forbidden",
            detail="The built-in admin account can only be disabled by itself",
            code="ADMIN_SELF_DISABLE_REQUIRED",
            retryable=False,
        )

    @pytest.mark.asyncio
    async def test_non_admin_can_update_admin_other_fields(self, auth_client: AsyncClient, admin_user: User) -> None:
        """Test non-admin can update admin's non-is_active fields."""
        patch_data = {"full_name": "Updated Admin Name"}

        response = await auth_client.patch(f"{USERS_URL}/{admin_user.id}", json=patch_data)

        assert response.status_code == 200

        data = response.json()
        assert data["full_name"] == "Updated Admin Name"

    @pytest.mark.asyncio
    async def test_non_admin_can_enable_admin(
        self, base_client: AsyncClient, admin_user: User, test_user: User
    ) -> None:
        """Test non-admin can re-enable the admin account (only disabling is restricted)."""
        from nexus.api.main import app

        original_overrides = app.dependency_overrides.copy()
        try:
            # Step 1: Admin disables itself
            async def override_as_admin() -> User:
                return admin_user

            app.dependency_overrides[get_current_user] = override_as_admin
            disable_response = await base_client.patch(f"{USERS_URL}/{admin_user.id}", json={"is_active": False})
            assert disable_response.status_code == 200

            # Step 2: Switch to non-admin user and re-enable admin
            async def override_as_user() -> User:
                return test_user

            app.dependency_overrides[get_current_user] = override_as_user
            enable_response = await base_client.patch(f"{USERS_URL}/{admin_user.id}", json={"is_active": True})
            assert enable_response.status_code == 200

            data = enable_response.json()
            assert data["is_active"] is True
        finally:
            app.dependency_overrides = original_overrides
