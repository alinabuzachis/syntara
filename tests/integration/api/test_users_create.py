"""Contract tests for POST /api/v1/users endpoint.

Tests user creation, validation, and conflict handling.
"""

import pytest
from httpx import AsyncClient

from tests.helpers.error_data import assert_error_data

USERS_URL = "/api/v1/users"


class TestUsersCreateContract:
    """Contract tests for user creation endpoint."""

    @pytest.mark.asyncio
    async def test_create_user_success(self, auth_client: AsyncClient) -> None:
        """Test successful user creation returns 201."""
        user_data = {
            "username": "newuser",
            "email": "newuser@example.com",
            "full_name": "New User",
            "password": "securepassword123",
        }

        response = await auth_client.post(USERS_URL, json=user_data)

        assert response.status_code == 201

        data = response.json()
        assert data["username"] == "newuser"
        assert data["email"] == "newuser@example.com"
        assert data["full_name"] == "New User"
        assert data["role"] == "viewer"  # default role
        assert data["is_active"] is True  # default

    @pytest.mark.asyncio
    async def test_create_user_with_all_fields(self, auth_client: AsyncClient) -> None:
        """Test creating user with all explicit fields."""
        user_data = {
            "username": "fulluser",
            "email": "fulluser@example.com",
            "full_name": "Full User",
            "password": "securepassword123",
            "role": "administrator",
            "is_active": False,
        }

        response = await auth_client.post(USERS_URL, json=user_data)

        assert response.status_code == 201

        data = response.json()
        assert data["username"] == "fulluser"
        assert data["role"] == "administrator"
        assert data["is_active"] is False

    @pytest.mark.asyncio
    async def test_create_user_response_schema(self, auth_client: AsyncClient) -> None:
        """Test response contains all required UserRead fields."""
        user_data = {
            "username": "schemauser",
            "email": "schemauser@example.com",
            "full_name": "Schema User",
            "password": "securepassword123",
        }

        response = await auth_client.post(USERS_URL, json=user_data)

        assert response.status_code == 201

        data = response.json()
        required_fields = [
            "id",
            "username",
            "email",
            "full_name",
            "role",
            "is_active",
            "last_login",
            "created_at",
            "updated_at",
        ]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"

        # Password should never be in response
        assert "password" not in data
        assert "password_hash" not in data

    @pytest.mark.asyncio
    async def test_create_user_no_password_in_response(self, auth_client: AsyncClient) -> None:
        """Test password is never returned in API response."""
        user_data = {
            "username": "nopwduser",
            "email": "nopwduser@example.com",
            "full_name": "No Password User",
            "password": "securepassword123",
        }

        response = await auth_client.post(USERS_URL, json=user_data)

        assert response.status_code == 201

        data = response.json()
        assert "password" not in data
        assert "password_hash" not in data

    @pytest.mark.asyncio
    async def test_create_user_duplicate_username(self, auth_client: AsyncClient) -> None:
        """Test 409 conflict when username already exists."""
        user_data = {
            "username": "dupuser",
            "email": "dupuser@example.com",
            "full_name": "Dup User",
            "password": "securepassword123",
        }

        # Create first user
        response1 = await auth_client.post(USERS_URL, json=user_data)
        assert response1.status_code == 201

        # Try to create second user with same username
        user_data["email"] = "different@example.com"
        response2 = await auth_client.post(USERS_URL, json=user_data)

        assert response2.status_code == 409
        assert_error_data(
            response2,
            error_type="https://api.nexus.com/errors/name-conflict",
            title="Username Conflict",
            detail="A user with this username already exists",
            code="USER_USERNAME_CONFLICT",
            retryable=False,
        )

    @pytest.mark.asyncio
    async def test_create_user_duplicate_email(self, auth_client: AsyncClient) -> None:
        """Test 409 conflict when email already exists."""
        user_data = {
            "username": "emailuser1",
            "email": "same@example.com",
            "full_name": "Email User 1",
            "password": "securepassword123",
        }

        # Create first user
        response1 = await auth_client.post(USERS_URL, json=user_data)
        assert response1.status_code == 201

        # Try to create second user with same email
        user_data["username"] = "emailuser2"
        user_data["full_name"] = "Email User 2"
        response2 = await auth_client.post(USERS_URL, json=user_data)

        assert response2.status_code == 409
        assert_error_data(
            response2,
            error_type="https://api.nexus.com/errors/resource-conflict",
            title="Email Conflict",
            detail="A user with this email already exists",
            code="USER_EMAIL_CONFLICT",
            retryable=False,
        )

    @pytest.mark.asyncio
    async def test_create_user_missing_username(self, auth_client: AsyncClient) -> None:
        """Test 422 when username is missing."""
        user_data = {
            "email": "nouser@example.com",
            "full_name": "No Username",
            "password": "securepassword123",
        }

        response = await auth_client.post(USERS_URL, json=user_data)

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_user_missing_email(self, auth_client: AsyncClient) -> None:
        """Test 422 when email is missing."""
        user_data = {
            "username": "noemail",
            "full_name": "No Email",
            "password": "securepassword123",
        }

        response = await auth_client.post(USERS_URL, json=user_data)

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_user_missing_password(self, auth_client: AsyncClient) -> None:
        """Test 422 when password is missing."""
        user_data = {
            "username": "nopwd",
            "email": "nopwd@example.com",
            "full_name": "No Password",
        }

        response = await auth_client.post(USERS_URL, json=user_data)

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_user_empty_username(self, auth_client: AsyncClient) -> None:
        """Test 422 when username is empty string."""
        user_data = {
            "username": "",
            "email": "empty@example.com",
            "full_name": "Empty Username",
            "password": "securepassword123",
        }

        response = await auth_client.post(USERS_URL, json=user_data)

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_user_username_too_long(self, auth_client: AsyncClient) -> None:
        """Test 422 when username exceeds max length."""
        user_data = {
            "username": "x" * 256,
            "email": "long@example.com",
            "full_name": "Long Username",
            "password": "securepassword123",
        }

        response = await auth_client.post(USERS_URL, json=user_data)

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_user_invalid_role(self, auth_client: AsyncClient) -> None:
        """Test 422 when role is invalid."""
        user_data = {
            "username": "badrole",
            "email": "badrole@example.com",
            "full_name": "Bad Role",
            "password": "securepassword123",
            "role": "superadmin",
        }

        response = await auth_client.post(USERS_URL, json=user_data)

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_user_unauthenticated(self, base_client: AsyncClient) -> None:
        """Test creating a user requires authentication."""
        user_data = {
            "username": "unauth",
            "email": "unauth@example.com",
            "full_name": "Unauth User",
            "password": "securepassword123",
        }

        response = await base_client.post(USERS_URL, json=user_data)

        assert response.status_code == 401
