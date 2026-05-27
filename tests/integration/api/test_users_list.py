"""Contract tests for GET /api/v1/users endpoint.

Tests user listing, pagination, filtering, and sorting.
"""

import pytest
from httpx import AsyncClient

USERS_URL = "/api/v1/users"


class TestUsersListContract:
    """Contract tests for user list endpoint."""

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_local_users")
    async def test_list_users_basic(self, admin_client: AsyncClient) -> None:
        """Test basic user listing returns 200 with users."""
        response = await admin_client.get(USERS_URL)

        assert response.status_code == 200

        data = response.json()
        assert "resources" in data
        # multiple_local_users creates 6 users + test_user = 7 total
        assert len(data["resources"]) >= 7

    @pytest.mark.asyncio
    async def test_list_users_empty(self, admin_client: AsyncClient) -> None:
        """Test listing when only the default test_user exists."""
        response = await admin_client.get(USERS_URL)

        assert response.status_code == 200

        data = response.json()
        assert "resources" in data
        # test_user exists from auth_client fixture
        assert len(data["resources"]) >= 1

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_local_users")
    async def test_list_users_response_schema(self, admin_client: AsyncClient) -> None:
        """Test each user in response includes required fields."""
        response = await admin_client.get(USERS_URL)

        assert response.status_code == 200

        data = response.json()
        required_fields = [
            "id",
            "username",
            "email",
            "full_name",
            "is_enabled",
            "created_at",
            "updated_at",
        ]
        for user in data["resources"]:
            for field in required_fields:
                assert field in user, f"Missing required field: {field}"

            # Sensitive fields should never appear
            assert "password" not in user
            assert "password_hash" not in user

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_local_users")
    async def test_list_users_pagination(self, admin_client: AsyncClient) -> None:
        """Test pagination with limit parameter."""
        response = await admin_client.get(USERS_URL, params={"limit": 2})

        assert response.status_code == 200

        data = response.json()
        assert len(data["resources"]) == 2
        assert data.get("next") is not None

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_local_users")
    async def test_list_users_cursor_pagination(self, admin_client: AsyncClient) -> None:
        """Test cursor-based pagination returns different pages."""
        # Get first page
        response1 = await admin_client.get(USERS_URL, params={"limit": 3})
        assert response1.status_code == 200

        data1 = response1.json()
        assert len(data1["resources"]) == 3
        cursor = data1.get("next")
        assert cursor is not None

        # Get second page
        response2 = await admin_client.get(USERS_URL, params={"limit": 3, "cursor": cursor})
        assert response2.status_code == 200

        data2 = response2.json()
        assert len(data2["resources"]) > 0

        # Pages should have different users
        page1_ids = {u["id"] for u in data1["resources"]}
        page2_ids = {u["id"] for u in data2["resources"]}
        assert page1_ids.isdisjoint(page2_ids)

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_local_users")
    async def test_list_users_sort_by_username(self, admin_client: AsyncClient) -> None:
        """Test sorting by username ascending."""
        response = await admin_client.get(USERS_URL, params={"sort": "username"})

        assert response.status_code == 200

        data = response.json()
        usernames = [u["username"] for u in data["resources"]]
        assert usernames == sorted(usernames)

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_local_users")
    async def test_list_users_sort_by_username_descending(self, admin_client: AsyncClient) -> None:
        """Test sorting by username descending."""
        response = await admin_client.get(USERS_URL, params={"sort": "-username"})

        assert response.status_code == 200

        data = response.json()
        usernames = [u["username"] for u in data["resources"]]
        assert usernames == sorted(usernames, reverse=True)

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_local_users")
    async def test_list_users_sort_by_created_at(self, admin_client: AsyncClient) -> None:
        """Test sorting by created_at ascending."""
        response = await admin_client.get(USERS_URL, params={"sort": "created_at"})

        assert response.status_code == 200

        data = response.json()
        timestamps = [u["created_at"] for u in data["resources"]]
        assert timestamps == sorted(timestamps)

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_local_users")
    async def test_list_users_filter_by_is_enabled(self, admin_client: AsyncClient) -> None:
        """Test filtering by is_enabled status."""
        response = await admin_client.get(USERS_URL, params={"is_enabled[eq]": "false"})

        assert response.status_code == 200

        data = response.json()
        assert len(data["resources"]) >= 1
        for user in data["resources"]:
            assert user["is_enabled"] is False

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_local_users")
    async def test_list_users_filter_by_username_contains(self, admin_client: AsyncClient) -> None:
        """Test filtering by username with contains."""
        response = await admin_client.get(USERS_URL, params={"username[contains]": "ali"})

        assert response.status_code == 200

        data = response.json()
        for user in data["resources"]:
            assert "ali" in user["username"].lower()

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("multiple_local_users")
    async def test_list_users_include_total(self, admin_client: AsyncClient) -> None:
        """Test include_total returns total count."""
        response = await admin_client.get(USERS_URL, params={"include_total": "true", "limit": 2})

        assert response.status_code == 200

        data = response.json()
        assert "total" in data
        assert data["total"] >= 7  # 6 from fixture + test_user

    @pytest.mark.asyncio
    async def test_list_users_filter_by_password_hash_starts_with_rejected(self, admin_client: AsyncClient) -> None:
        """Test that filtering by password_hash[starts_with] is rejected (AAP-71239)."""
        response = await admin_client.get(USERS_URL, params={"password_hash[starts_with]": "$argon2"})

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_list_users_filter_by_password_hash_eq_rejected(self, admin_client: AsyncClient) -> None:
        """Test that filtering by password_hash equality is rejected."""
        response = await admin_client.get(USERS_URL, params={"password_hash": "$argon2id$v=19"})

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_list_users_filter_by_password_hash_contains_rejected(self, admin_client: AsyncClient) -> None:
        """Test that filtering by password_hash[contains] is rejected."""
        response = await admin_client.get(USERS_URL, params={"password_hash[contains]": "argon"})

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_list_users_unauthenticated(self, base_client: AsyncClient) -> None:
        """Test listing users requires authentication."""
        response = await base_client.get(USERS_URL)

        assert response.status_code == 401
