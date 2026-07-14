"""Contract tests for GET /api/v1/integrations."""

from uuid import uuid4

from httpx import AsyncClient
from nexus_test_sdk.helpers.integration import IntegrationFactory
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.integrations.models.integration import IntegrationType

BASE_URL = "/api/v1/integrations"


class TestIntegrationsList:
    """Contract tests for GET /api/v1/integrations."""

    async def test_list_returns_200_with_resources_and_count(
        self,
        auth_client: AsyncClient,
    ) -> None:
        """List endpoint returns 200 with resources list and pagination fields."""
        response = await auth_client.get(BASE_URL)
        assert response.status_code == 200
        data = response.json()
        assert "resources" in data
        assert isinstance(data["resources"], list)
        assert "next" in data
        assert "prev" in data

    async def test_list_returns_created_integrations(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """Integrations created in the DB appear in list results."""
        names = [f"list-{uuid4().hex[:8]}" for _ in range(3)]
        for name in names:
            await integration_factory.create(name=name)
        await test_db_session.commit()

        response = await auth_client.get(BASE_URL)
        assert response.status_code == 200
        data = response.json()
        returned_names = {r["name"] for r in data["resources"]}
        for name in names:
            assert name in returned_names

    async def test_list_filter_by_integration_type(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """Filter by integration_type returns only matching integrations."""
        await integration_factory.create(integration_type=IntegrationType.MCP_SERVER)
        await integration_factory.create(integration_type=IntegrationType.LLM_PROVIDER)
        await test_db_session.commit()

        response = await auth_client.get(BASE_URL, params={"integration_type[eq]": "llm_provider"})
        assert response.status_code == 200
        data = response.json()
        assert len(data["resources"]) >= 1
        for resource in data["resources"]:
            assert resource["integration_type"] == "llm_provider"

    async def test_list_filter_by_enabled(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """Filter by enabled=false returns only disabled integrations."""
        enabled_name = f"enabled-{uuid4().hex[:8]}"
        disabled_name = f"disabled-{uuid4().hex[:8]}"
        await integration_factory.create(name=enabled_name, enabled=True)
        await integration_factory.create(name=disabled_name, enabled=False)
        await test_db_session.commit()

        response = await auth_client.get(BASE_URL, params={"enabled[eq]": "false"})
        assert response.status_code == 200
        data = response.json()
        returned_names = {r["name"] for r in data["resources"]}
        assert len(data["resources"]) >= 1
        assert disabled_name in returned_names
        assert enabled_name not in returned_names
        for resource in data["resources"]:
            assert resource["enabled"] is False

    async def test_list_pagination_limit(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """Limit parameter restricts number of returned resources."""
        await integration_factory.create_many(5)
        await test_db_session.commit()

        response = await auth_client.get(BASE_URL, params={"limit": "2"})
        assert response.status_code == 200
        data = response.json()
        assert len(data["resources"]) == 2

    async def test_list_pagination_cursor(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """Cursor pagination returns non-overlapping pages."""
        await integration_factory.create_many(4)
        await test_db_session.commit()

        first = await auth_client.get(BASE_URL, params={"limit": "2"})
        assert first.status_code == 200
        first_data = first.json()
        assert len(first_data["resources"]) == 2

        cursor = first_data.get("next")
        assert cursor is not None, "Expected a next cursor with 4 records and limit=2"

        second = await auth_client.get(BASE_URL, params={"limit": "2", "cursor": cursor})
        assert second.status_code == 200
        second_data = second.json()

        first_ids = {r["id"] for r in first_data["resources"]}
        second_ids = {r["id"] for r in second_data["resources"]}
        assert first_ids.isdisjoint(second_ids)

    async def test_list_excludes_soft_deleted_integrations(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """Soft-deleted integrations do not appear in list results."""
        name = f"gone-{uuid4().hex[:8]}"
        integration = await integration_factory.create(name=name)
        await test_db_session.commit()

        await auth_client.delete(f"{BASE_URL}/{integration.id}")

        response = await auth_client.get(BASE_URL)
        assert response.status_code == 200
        returned_names = {r["name"] for r in response.json()["resources"]}
        assert name not in returned_names

    async def test_list_invalid_limit_returns_422(self, auth_client: AsyncClient) -> None:
        """Invalid limit value returns 422."""
        response = await auth_client.get(BASE_URL, params={"limit": "not-a-number"})
        assert response.status_code == 422

    async def test_list_requires_authentication(self, base_client: AsyncClient) -> None:
        """GET list requires authentication."""
        response = await base_client.get(BASE_URL)
        assert response.status_code == 401

    async def test_list_include_total(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """include_total=true includes a total count in the response."""
        await integration_factory.create_many(3)
        await test_db_session.commit()

        response = await auth_client.get(BASE_URL, params={"include_total": "true"})
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert isinstance(data["total"], int)
        assert data["total"] >= 3
