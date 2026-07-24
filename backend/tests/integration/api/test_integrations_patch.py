"""Contract tests for PATCH /api/v1/integrations/{id}."""

from uuid import uuid4

from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from tests.integration.helpers.integration import IntegrationFactory

BASE_URL = "/api/v1/integrations"


class TestIntegrationsPatch:
    """Contract tests for PATCH /api/v1/integrations/{id}."""

    async def test_patch_name_returns_200(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """Patching the name field returns 200 with updated value."""
        integration = await integration_factory.create(name=f"before-{uuid4().hex[:8]}")
        await test_db_session.commit()

        new_name = f"after-{uuid4().hex[:8]}"
        response = await auth_client.patch(f"{BASE_URL}/{integration.id}", json={"name": new_name})
        assert response.status_code == 200
        assert response.json()["name"] == new_name

    async def test_patch_enabled_field(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """Patching only the enabled field updates it correctly."""
        integration = await integration_factory.create(enabled=True)
        await test_db_session.commit()

        response = await auth_client.patch(f"{BASE_URL}/{integration.id}", json={"enabled": False})
        assert response.status_code == 200
        assert response.json()["enabled"] is False

    async def test_patch_partial_update_does_not_change_other_fields(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """Patching one field does not alter unrelated fields."""
        original_name = f"partial-{uuid4().hex[:8]}"
        integration = await integration_factory.create(name=original_name, enabled=True)
        await test_db_session.commit()

        response = await auth_client.patch(f"{BASE_URL}/{integration.id}", json={"enabled": False})
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == original_name
        assert data["enabled"] is False

    async def test_patch_unknown_id_returns_404(self, auth_client: AsyncClient) -> None:
        """PATCH on a non-existent ID returns 404."""
        response = await auth_client.patch(f"{BASE_URL}/{uuid4()}", json={"enabled": False})
        assert response.status_code == 404

    async def test_patch_name_conflict_returns_409(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """Patching to an existing name returns 409."""
        existing_name = f"existing-{uuid4().hex[:8]}"
        await integration_factory.create(name=existing_name)
        target = await integration_factory.create(name=f"target-{uuid4().hex[:8]}")
        await test_db_session.commit()

        response = await auth_client.patch(f"{BASE_URL}/{target.id}", json={"name": existing_name})
        assert response.status_code == 409

    async def test_patch_name_too_long_returns_422(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        integration_factory: IntegrationFactory,
    ) -> None:
        """Patching with a name longer than 255 characters returns 422."""
        integration = await integration_factory.create()
        await test_db_session.commit()

        response = await auth_client.patch(f"{BASE_URL}/{integration.id}", json={"name": "x" * 256})
        assert response.status_code == 422

    async def test_patch_invalid_uuid_returns_422(self, auth_client: AsyncClient) -> None:
        """PATCH with a non-UUID path parameter returns 422."""
        response = await auth_client.patch(f"{BASE_URL}/not-a-uuid", json={"enabled": False})
        assert response.status_code == 422

    async def test_patch_requires_authentication(self, base_client: AsyncClient) -> None:
        """PATCH requires authentication."""
        response = await base_client.patch(f"{BASE_URL}/{uuid4()}", json={"enabled": False})
        assert response.status_code == 401
