"""Shared helpers for service account E2E tests."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING, Any

from nexus_api_client.models.service_account_create import ServiceAccountCreate

from tests.e2e.conftest import unique_name

if TYPE_CHECKING:
    from uuid import UUID

    from nexus_api_client.api import NexusApiRegistry


def create_sa(api: NexusApiRegistry, project_id: UUID, prefix: str = "e2e-sa", **overrides: Any) -> Any:  # noqa: ANN401
    """Create a service account and return the parsed response."""
    name = overrides.pop("name", unique_name(prefix))
    resp = api.service_accounts.create(
        body=ServiceAccountCreate(name=name, project_id=project_id, **overrides),
    )
    assert resp.status_code == HTTPStatus.CREATED, f"Expected 201, got {resp.status_code}: {resp.content!r}"
    return resp.assert_and_get()
