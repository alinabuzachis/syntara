"""Integration tests for POST /api/v1/workflows endpoint.

Tests workflow creation validation at the API level.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import uuid4

import pytest

if TYPE_CHECKING:
    from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_workflow_invalid_definition(jwt_client: AsyncClient) -> None:
    """Test creating a workflow with invalid definition structure.

    Expected: 422 Unprocessable Entity (validator rejects missing V2 fields)
    """
    invalid_workflow_def = {
        "schema_version": "2.0.0",
        # Missing required 'triggers', 'nodes', and 'edges' fields
    }

    response = await jwt_client.post(
        "/api/v1/workflows",
        json={
            "name": f"invalid-workflow-{uuid4().hex[:8]}",
            "workflow_definition": invalid_workflow_def,
        },
    )

    assert response.status_code == 422
