"""Integration tests for project-scoped visibility on integration endpoints.

These tests require direct database interaction (creating Project and
IntegrationProjectAssignment rows) and OPA mock swapping. CRUD happy-path
and error-case tests live in tests/e2e/test_integration_endpoints.py.
"""

from typing import Any

import pytest
from httpx import AsyncClient

BASE_URL = "/api/v1/integrations"


class TestProjectScopedVisibility:
    """Verify project-scoped integrations respect VisibilityFilter."""

    @pytest.mark.asyncio
    async def test_list_returns_global_and_assigned_integrations(
        self,
        auth_client: AsyncClient,
        project_scoped_setup: dict[str, Any],
    ) -> None:
        resp = await auth_client.get(BASE_URL)
        assert resp.status_code == 200
        ids = [r["id"] for r in resp.json()["resources"]]
        assert project_scoped_setup["project_integration_id"] in ids
        assert project_scoped_setup["global_integration_id"] in ids
        assert project_scoped_setup["unassigned_integration_id"] not in ids

    @pytest.mark.asyncio
    async def test_get_assigned_integration_returns_200(
        self,
        auth_client: AsyncClient,
        project_scoped_setup: dict[str, Any],
    ) -> None:
        resp = await auth_client.get(f"{BASE_URL}/{project_scoped_setup['project_integration_id']}")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_get_unassigned_integration_returns_404(
        self,
        auth_client: AsyncClient,
        project_scoped_setup: dict[str, Any],
    ) -> None:
        resp = await auth_client.get(f"{BASE_URL}/{project_scoped_setup['unassigned_integration_id']}")
        assert resp.status_code == 404
