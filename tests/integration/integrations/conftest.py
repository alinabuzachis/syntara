"""Shared fixtures for integration visibility tests."""

from typing import Any
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models.project import Project
from nexus.integrations.models.integration import IntegrationProjectAssignment

BASE_URL = "/api/v1/integrations"


def _mcp_payload(name: str) -> dict[str, object]:
    return {
        "name": name,
        "integration_type": "mcp_server",
        "configuration": {
            "integration_type": "mcp_server",
            "base_url": "https://mcp.example.com",
        },
    }


@pytest_asyncio.fixture
async def project_scoped_setup(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> dict[str, Any]:
    """Set up project-scoped and global integrations, then restrict OPA to one project."""
    project = Project(name=f"test-project-{uuid4().hex[:8]}")
    test_db_session.add(project)
    await test_db_session.flush()

    project_payload = _mcp_payload(f"project-int-{uuid4().hex[:8]}")
    project_payload["scope"] = "project"
    create_resp = await auth_client.post(BASE_URL, json=project_payload)
    assert create_resp.status_code == 201
    project_integration_id = create_resp.json()["id"]

    assignment = IntegrationProjectAssignment(
        integration_id=project_integration_id,
        project_id=project.id,
    )
    test_db_session.add(assignment)

    global_payload = _mcp_payload(f"global-int-{uuid4().hex[:8]}")
    create_resp2 = await auth_client.post(BASE_URL, json=global_payload)
    assert create_resp2.status_code == 201
    global_integration_id = create_resp2.json()["id"]

    unassigned_payload = _mcp_payload(f"unassigned-int-{uuid4().hex[:8]}")
    unassigned_payload["scope"] = "project"
    create_resp3 = await auth_client.post(BASE_URL, json=unassigned_payload)
    assert create_resp3.status_code == 201
    unassigned_integration_id = create_resp3.json()["id"]

    await test_db_session.flush()

    mock_opa = AsyncMock()
    mock_opa.evaluate = AsyncMock(
        return_value={
            "allow": True,
            "deny": False,
            "matched_policy": "test-project-scoped",
            "allowed_projects": [project.name],
        }
    )

    def _mock_getter(request: Any = None) -> AsyncMock:  # noqa: ANN401
        return mock_opa

    monkeypatch.setattr("nexus.authz.dependencies.get_opa_client", _mock_getter)

    return {
        "project_id": project.id,
        "project_integration_id": project_integration_id,
        "global_integration_id": global_integration_id,
        "unassigned_integration_id": unassigned_integration_id,
    }
