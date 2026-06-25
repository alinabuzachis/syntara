"""Contract tests for GET /api/v1/integrations/{id}."""

from uuid import uuid4

from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from tests.helpers.integration import IntegrationFactory

BASE_URL = "/api/v1/integrations"


class TestIntegrationsGet:
    """Contract tests for GET /api/v1/integrations/{id}."""

    async def test_get_returns_200_with_correct_integration(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """GET by ID returns 200 with the correct integration data."""
        integration = await integration_factory.create(name=f"get-test-{uuid4().hex[:8]}")
        await test_db_session.commit()

        response = await auth_client.get(f"{BASE_URL}/{integration.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(integration.id)
        assert data["name"] == integration.name
        assert data["integration_type"] == "mcp_server"

    async def test_get_response_includes_required_fields(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """GET response includes all required fields."""
        integration = await integration_factory.create()
        await test_db_session.commit()

        response = await auth_client.get(f"{BASE_URL}/{integration.id}")
        assert response.status_code == 200
        data = response.json()
        for field in (
            "id",
            "name",
            "integration_type",
            "configuration",
            "validation_status",
            "enabled",
            "created_at",
            "updated_at",
        ):
            assert field in data, f"Missing field: {field}"

    async def test_get_unknown_id_returns_404(self, auth_client: AsyncClient) -> None:
        """GET with a valid UUID that does not exist returns 404."""
        response = await auth_client.get(f"{BASE_URL}/{uuid4()}")
        assert response.status_code == 404

    async def test_get_invalid_uuid_returns_422(self, auth_client: AsyncClient) -> None:
        """GET with a non-UUID path parameter returns 422."""
        response = await auth_client.get(f"{BASE_URL}/not-a-uuid")
        assert response.status_code == 422

    async def ***REMOVED***(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """GET on a soft-deleted integration returns 404."""
        integration = await integration_factory.create(name=f"deleted-{uuid4().hex[:8]}")
        await test_db_session.commit()

        await auth_client.delete(f"{BASE_URL}/{integration.id}")

        response = await auth_client.get(f"{BASE_URL}/{integration.id}")
        assert response.status_code == 404

    async def test_get_requires_authentication(self, base_client: AsyncClient) -> None:
        """GET by ID requires authentication."""
        response = await base_client.get(f"{BASE_URL}/{uuid4()}")
        assert response.status_code == 401
