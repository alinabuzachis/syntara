"""Contract tests for DELETE /api/v1/integrations/{id}."""

from uuid import uuid4

from httpx import AsyncClient
from nexus_test_sdk.helpers.integration import IntegrationFactory
from sqlmodel.ext.asyncio.session import AsyncSession

BASE_URL = "/api/v1/integrations"


class TestIntegrationsDelete:
    """Contract tests for DELETE /api/v1/integrations/{id}."""

    async def test_delete_returns_204(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """Deleting an existing integration returns 204 No Content."""
        integration = await integration_factory.create(name=f"del-{uuid4().hex[:8]}")
        await test_db_session.commit()

        response = await auth_client.delete(f"{BASE_URL}/{integration.id}")
        assert response.status_code == 204

    async def test_delete_unknown_id_returns_404(self, auth_client: AsyncClient) -> None:
        """DELETE on a non-existent ID returns 404."""
        response = await auth_client.delete(f"{BASE_URL}/{uuid4()}")
        assert response.status_code == 404

    async def test_delete_invalid_uuid_returns_422(self, auth_client: AsyncClient) -> None:
        """DELETE with a non-UUID path parameter returns 422."""
        response = await auth_client.delete(f"{BASE_URL}/not-a-uuid")
        assert response.status_code == 422

    async def test_deleted_integration_not_in_list(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """After deletion, the integration no longer appears in the list."""
        name = f"gone-{uuid4().hex[:8]}"
        integration = await integration_factory.create(name=name)
        await test_db_session.commit()

        delete_resp = await auth_client.delete(f"{BASE_URL}/{integration.id}")
        assert delete_resp.status_code == 204

        list_resp = await auth_client.get(BASE_URL)
        assert list_resp.status_code == 200
        names = {r["name"] for r in list_resp.json()["resources"]}
        assert name not in names

    async def test_deleted_integration_returns_404_on_get(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """After deletion, GET by ID returns 404."""
        integration = await integration_factory.create(name=f"bye-{uuid4().hex[:8]}")
        await test_db_session.commit()

        delete_resp = await auth_client.delete(f"{BASE_URL}/{integration.id}")
        assert delete_resp.status_code == 204

        get_resp = await auth_client.get(f"{BASE_URL}/{integration.id}")
        assert get_resp.status_code == 404

    async def test_delete_twice_returns_404(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """Deleting the same integration twice returns 204 then 404."""
        integration = await integration_factory.create(name=f"twice-{uuid4().hex[:8]}")
        await test_db_session.commit()

        first = await auth_client.delete(f"{BASE_URL}/{integration.id}")
        assert first.status_code == 204

        second = await auth_client.delete(f"{BASE_URL}/{integration.id}")
        assert second.status_code == 404

    async def test_delete_requires_authentication(self, base_client: AsyncClient) -> None:
        """DELETE requires authentication."""
        response = await base_client.delete(f"{BASE_URL}/{uuid4()}")
        assert response.status_code == 401
