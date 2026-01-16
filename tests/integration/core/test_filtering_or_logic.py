"""Integration tests for OR logic filtering functionality.

Tests the end-to-end filtering functionality from HTTP GET through FastAPI router
to the service layer, covering the OR logic implementation for comma-separated values.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from nexus.tool_manager.models import ToolProvider


@pytest_asyncio.fixture
async def filtering_test_providers(test_db_session: AsyncSession, test_user: User) -> list[ToolProvider]:
    """Create test providers specifically for OR filtering tests."""
    providers = [
        ToolProvider(
            name="Alpha Service",
            description="Development service for testing",
            configuration={
                "provider_type": "mcp",
                "base_url": "https://alpha.dev.example.com",
                "api_key": "alpha-dev-key-123",
            },
            enabled=True,
            created_by=test_user.id,
        ),
        ToolProvider(
            name="Beta Service",
            description="Production service for testing",
            configuration={
                "provider_type": "mcp",
                "base_url": "https://beta.prod.example.com",
                "api_key": "beta-prod-key-456",
            },
            enabled=False,
            created_by=test_user.id,
        ),
        ToolProvider(
            name="Gamma Service",
            description="Staging service for testing",
            configuration={
                "provider_type": "mcp",
                "base_url": "https://gamma.staging.example.com",
                "api_key": "gamma-staging-key-789",
            },
            enabled=True,
            created_by=test_user.id,
        ),
        ToolProvider(
            name="Delta Provider",
            description="Development provider for testing",
            configuration={
                "provider_type": "mcp",
                "base_url": "https://delta.dev.example.com",
                "api_key": "delta-dev-key-abc",
            },
            enabled=True,
            created_by=test_user.id,
        ),
        ToolProvider(
            name="Echo Provider",
            description="Production provider for testing",
            configuration={
                "provider_type": "mcp",
                "base_url": "https://echo.prod.example.com",
                "api_key": "echo-prod-key-def",
            },
            enabled=False,
            created_by=test_user.id,
        ),
        ToolProvider(
            name="Foxtrot Provider",
            description="Staging provider for testing",
            configuration={
                "provider_type": "mcp",
                "base_url": "https://foxtrot.staging.example.com",
                "api_key": "foxtrot-staging-key-ghi",
            },
            enabled=True,
            created_by=test_user.id,
        ),
    ]

    for provider in providers:
        test_db_session.add(provider)

    await test_db_session.commit()

    for provider in providers:
        await test_db_session.refresh(provider)

    return providers


class TestFilteringORLogic:
    """Integration tests for OR logic filtering functionality."""

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("filtering_test_providers")
    async def test_single_field_filtering(
        self,
        base_client: AsyncClient,
    ) -> None:
        """Test filtering on a single field with single value."""
        response = await base_client.get("/api/v1/tool_manager/tool_providers", params={"enabled[eq]": "true"})

        assert response.status_code == 200
        data = response.json()
        assert "resources" in data

        # Should return 4 enabled providers (Alpha, Gamma, Delta, Foxtrot)
        assert len(data["resources"]) == 4

        enabled_names = {provider["name"] for provider in data["resources"]}
        expected_enabled = {"Alpha Service", "Gamma Service", "Delta Provider", "Foxtrot Provider"}
        assert enabled_names == expected_enabled

        # All returned providers should be enabled
        for provider in data["resources"]:
            assert provider["enabled"] is True

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("filtering_test_providers")
    async def test_multiple_fields_and_logic(
        self,
        base_client: AsyncClient,
    ) -> None:
        """Test filtering on multiple fields using AND logic."""
        response = await base_client.get(
            "/api/v1/tool_manager/tool_providers",
            params={"enabled[eq]": "true", "description[contains]": "Development"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "resources" in data

        # Should return 2 providers (Alpha and Delta) - enabled AND Development in description
        assert len(data["resources"]) == 2

        returned_names = {provider["name"] for provider in data["resources"]}
        expected_names = {"Alpha Service", "Delta Provider"}
        assert returned_names == expected_names

        # All returned providers should meet both criteria
        for provider in data["resources"]:
            assert provider["enabled"] is True
            assert "Development" in provider["description"]

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("filtering_test_providers")
    async def test_single_field_or_logic(
        self,
        base_client: AsyncClient,
    ) -> None:
        """Test filtering on a single field using OR logic (comma-separated values)."""
        response = await base_client.get(
            "/api/v1/tool_manager/tool_providers", params={"name[contains]": "Service,Provider"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "resources" in data

        # Should return all 6 providers - name contains "Service" OR "Provider"
        assert len(data["resources"]) == 6

        returned_names = {provider["name"] for provider in data["resources"]}
        expected_names = {
            "Alpha Service",
            "Beta Service",
            "Gamma Service",
            "Delta Provider",
            "Echo Provider",
            "Foxtrot Provider",
        }
        assert returned_names == expected_names

        # All returned providers should have either "Service" or "Provider" in name
        for provider in data["resources"]:
            assert "Service" in provider["name"] or "Provider" in provider["name"]

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("filtering_test_providers")
    async def test_multiple_fields_mixed_logic(
        self,
        base_client: AsyncClient,
    ) -> None:
        """Test filtering with one field using OR and another using AND."""
        response = await base_client.get(
            "/api/v1/tool_manager/tool_providers",
            params={
                "name[contains]": "Service,Delta",  # OR logic within this field
                "enabled[eq]": "true",  # AND logic between fields
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "resources" in data

        # Should return 3 providers: Alpha Service, Gamma Service, Delta Provider
        # (name contains "Service" OR "Delta") AND enabled=true
        assert len(data["resources"]) == 3

        returned_names = {provider["name"] for provider in data["resources"]}
        expected_names = {"Alpha Service", "Gamma Service", "Delta Provider"}
        assert returned_names == expected_names

        # All returned providers should be enabled AND have "Service" OR "Delta" in name
        for provider in data["resources"]:
            assert provider["enabled"] is True
            assert "Service" in provider["name"] or "Delta" in provider["name"]

    @pytest.mark.asyncio
    @pytest.mark.usefixtures("filtering_test_providers")
    async def test_multiple_fields_both_with_or_logic(
        self,
        base_client: AsyncClient,
    ) -> None:
        """Test filtering with multiple fields each using OR logic."""
        response = await base_client.get(
            "/api/v1/tool_manager/tool_providers",
            params={
                "name[contains]": "Alpha,Echo",  # OR within field
                "description[contains]": "Development,Production",  # OR within field, AND between fields
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "resources" in data

        # Should return providers that have (Alpha OR Echo in name) AND (Development OR Production in description)
        # Alpha Service: name has "Alpha" + description has "Development" ✓
        # Echo Provider: name has "Echo" + description has "Production" ✓
        # Beta Service: name doesn't have "Alpha" or "Echo" ✗
        assert len(data["resources"]) == 2

        returned_names = {provider["name"] for provider in data["resources"]}
        expected_names = {"Alpha Service", "Echo Provider"}
        assert returned_names == expected_names

        # All returned providers should meet the criteria
        valid_name_parts = {"Alpha", "Echo"}
        valid_desc_parts = {"Development", "Production"}
        for provider in data["resources"]:
            has_valid_name = any(part in provider["name"] for part in valid_name_parts)
            has_valid_desc = any(part in provider["description"] for part in valid_desc_parts)
            assert has_valid_name
            assert has_valid_desc
