"""Role-based authorization tests for the integrations endpoints.

Tests the permission matrix for the integrations resource:
  - read  (list, get): admin, auditor
  - create:            admin only
  - update:            admin only
  - delete:            admin only

Regular users are denied all integrations endpoints.
Auditors have read-only access.
"""

from collections.abc import Awaitable, Callable
from uuid import uuid4

from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from tests.integration.api.conftest import (
    make_admin,
    make_auditor,
    make_user_role,
)

BASE_URL = "/api/v1/integrations"


def _mcp_payload(name: str | None = None) -> dict[str, object]:
    return {
        "name": name or f"authz-intg-{uuid4().hex[:8]}",
        "integration_type": "mcp_server",
        "configuration": {
            "integration_type": "mcp_server",
            "base_url": "https://mcp.example.com",
        },
    }


# ============================================================================
# User role — no access to any integrations endpoint
# ============================================================================


class TestUserPermissions:
    """Regular users (user role) are denied all integrations endpoints."""

    async def test_user_can_list_global_integrations(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        user_factory: Callable[..., Awaitable[User]],
        auth_as: Callable[[User], None],
    ) -> None:
        """User role can list integrations (sees global-scoped ones via visibility filter)."""
        # Create a global integration as admin first
        admin = await user_factory(username=f"ai-lst-{uuid4().hex[:6]}", email=f"ai-lst-{uuid4().hex[:6]}@test.com")
        await make_admin(test_db_session, admin)
        auth_as(admin)
        resp = await auth_client.post(BASE_URL, json=_mcp_payload())
        assert resp.status_code == 201

        # Switch to user role
        user = await user_factory(username=f"ui-list-{uuid4().hex[:6]}", email=f"ui-list-{uuid4().hex[:6]}@test.com")
        await make_user_role(test_db_session, user)
        auth_as(user)

        resp = await auth_client.get(BASE_URL)
        assert resp.status_code == 200
        resources = resp.json()["resources"]
        assert len(resources) >= 1

    async def test_user_cannot_create(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        user_factory: Callable[..., Awaitable[User]],
        auth_as: Callable[[User], None],
    ) -> None:
        """User role cannot create an integration."""
        user = await user_factory(username=f"ui-crt-{uuid4().hex[:6]}", email=f"ui-crt-{uuid4().hex[:6]}@test.com")
        await make_user_role(test_db_session, user)
        auth_as(user)

        resp = await auth_client.post(BASE_URL, json=_mcp_payload())
        assert resp.status_code == 403

    async def test_user_can_get_global_integration(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        user_factory: Callable[..., Awaitable[User]],
        auth_as: Callable[[User], None],
    ) -> None:
        """User role can retrieve a global integration by ID."""
        admin = await user_factory(username=f"ai-get-{uuid4().hex[:6]}", email=f"ai-get-{uuid4().hex[:6]}@test.com")
        await make_admin(test_db_session, admin)
        auth_as(admin)
        resp = await auth_client.post(BASE_URL, json=_mcp_payload())
        assert resp.status_code == 201
        integration_id = resp.json()["id"]

        user = await user_factory(username=f"ui-get-{uuid4().hex[:6]}", email=f"ui-get-{uuid4().hex[:6]}@test.com")
        await make_user_role(test_db_session, user)
        auth_as(user)
        resp = await auth_client.get(f"{BASE_URL}/{integration_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == integration_id

    async def test_user_cannot_patch(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        user_factory: Callable[..., Awaitable[User]],
        auth_as: Callable[[User], None],
    ) -> None:
        """User role cannot update an integration."""
        admin = await user_factory(username=f"ai-ptch-{uuid4().hex[:6]}", email=f"ai-ptch-{uuid4().hex[:6]}@test.com")
        await make_admin(test_db_session, admin)
        auth_as(admin)
        resp = await auth_client.post(BASE_URL, json=_mcp_payload())
        assert resp.status_code == 201
        integration_id = resp.json()["id"]

        user = await user_factory(username=f"ui-ptch-{uuid4().hex[:6]}", email=f"ui-ptch-{uuid4().hex[:6]}@test.com")
        await make_user_role(test_db_session, user)
        auth_as(user)
        resp = await auth_client.patch(f"{BASE_URL}/{integration_id}", json={"enabled": False})
        assert resp.status_code == 403

    async def test_user_cannot_delete(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        user_factory: Callable[..., Awaitable[User]],
        auth_as: Callable[[User], None],
    ) -> None:
        """User role cannot delete an integration."""
        admin = await user_factory(username=f"ai-del-{uuid4().hex[:6]}", email=f"ai-del-{uuid4().hex[:6]}@test.com")
        await make_admin(test_db_session, admin)
        auth_as(admin)
        resp = await auth_client.post(BASE_URL, json=_mcp_payload())
        assert resp.status_code == 201
        integration_id = resp.json()["id"]

        user = await user_factory(username=f"ui-del-{uuid4().hex[:6]}", email=f"ui-del-{uuid4().hex[:6]}@test.com")
        await make_user_role(test_db_session, user)
        auth_as(user)
        resp = await auth_client.delete(f"{BASE_URL}/{integration_id}")
        assert resp.status_code == 403


# ============================================================================
# Auditor role — read-only access
# ============================================================================


class TestAuditorPermissions:
    """Auditor role can read integrations but cannot mutate them."""

    async def test_auditor_can_list(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        user_factory: Callable[..., Awaitable[User]],
        auth_as: Callable[[User], None],
    ) -> None:
        """Auditor can list integrations."""
        auditor = await user_factory(username=f"aud-lst-{uuid4().hex[:6]}", email=f"aud-lst-{uuid4().hex[:6]}@test.com")
        await make_auditor(test_db_session, auditor)
        auth_as(auditor)

        resp = await auth_client.get(BASE_URL)
        assert resp.status_code == 200

    async def test_auditor_can_get(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        user_factory: Callable[..., Awaitable[User]],
        auth_as: Callable[[User], None],
    ) -> None:
        """Auditor can retrieve an integration by ID."""
        admin = await user_factory(username=f"ai-aget-{uuid4().hex[:6]}", email=f"ai-aget-{uuid4().hex[:6]}@test.com")
        await make_admin(test_db_session, admin)
        auth_as(admin)
        resp = await auth_client.post(BASE_URL, json=_mcp_payload())
        assert resp.status_code == 201
        integration_id = resp.json()["id"]

        auditor = await user_factory(username=f"aud-get-{uuid4().hex[:6]}", email=f"aud-get-{uuid4().hex[:6]}@test.com")
        await make_auditor(test_db_session, auditor)
        auth_as(auditor)
        resp = await auth_client.get(f"{BASE_URL}/{integration_id}")
        assert resp.status_code == 200

    async def test_auditor_cannot_create(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        user_factory: Callable[..., Awaitable[User]],
        auth_as: Callable[[User], None],
    ) -> None:
        """Auditor cannot create an integration."""
        auditor = await user_factory(username=f"aud-crt-{uuid4().hex[:6]}", email=f"aud-crt-{uuid4().hex[:6]}@test.com")
        await make_auditor(test_db_session, auditor)
        auth_as(auditor)

        resp = await auth_client.post(BASE_URL, json=_mcp_payload())
        assert resp.status_code == 403

    async def test_auditor_cannot_patch(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        user_factory: Callable[..., Awaitable[User]],
        auth_as: Callable[[User], None],
    ) -> None:
        """Auditor cannot update an integration."""
        admin = await user_factory(username=f"ai-aptch-{uuid4().hex[:6]}", email=f"ai-aptch-{uuid4().hex[:6]}@test.com")
        await make_admin(test_db_session, admin)
        auth_as(admin)
        resp = await auth_client.post(BASE_URL, json=_mcp_payload())
        assert resp.status_code == 201
        integration_id = resp.json()["id"]

        auditor = await user_factory(
            username=f"aud-ptch-{uuid4().hex[:6]}", email=f"aud-ptch-{uuid4().hex[:6]}@test.com"
        )
        await make_auditor(test_db_session, auditor)
        auth_as(auditor)
        resp = await auth_client.patch(f"{BASE_URL}/{integration_id}", json={"enabled": False})
        assert resp.status_code == 403

    async def test_auditor_cannot_delete(
        self,
        auth_client: AsyncClient,
        test_db_session: AsyncSession,
        user_factory: Callable[..., Awaitable[User]],
        auth_as: Callable[[User], None],
    ) -> None:
        """Auditor cannot delete an integration."""
        admin = await user_factory(username=f"ai-adel-{uuid4().hex[:6]}", email=f"ai-adel-{uuid4().hex[:6]}@test.com")
        await make_admin(test_db_session, admin)
        auth_as(admin)
        resp = await auth_client.post(BASE_URL, json=_mcp_payload())
        assert resp.status_code == 201
        integration_id = resp.json()["id"]

        auditor = await user_factory(username=f"aud-del-{uuid4().hex[:6]}", email=f"aud-del-{uuid4().hex[:6]}@test.com")
        await make_auditor(test_db_session, auditor)
        auth_as(auditor)
        resp = await auth_client.delete(f"{BASE_URL}/{integration_id}")
        assert resp.status_code == 403
