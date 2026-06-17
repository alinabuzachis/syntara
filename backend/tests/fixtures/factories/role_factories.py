"""Reusable factory helpers and pytest fixtures for E2E resource creation."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

import pytest
from nexus_api_client.models.role_create import RoleCreate

from tests.e2e.conftest import unique_name

if TYPE_CHECKING:
    from collections.abc import Generator

    from nexus_api_client.api import NexusApiRegistry


class RoleFactory(Protocol):
    """Protocol ensuring type safety for optional and keyword arguments on the factory."""

    def __call__(self, api: NexusApiRegistry, prefix: str, policies: list[str]) -> str: ...


@pytest.fixture(scope="module")
def create_role() -> Generator[RoleFactory, None, None]:
    """Create a system-scoped role. Returns the generated role name."""
    role_id = None
    test_api = None

    def _create_role(api: NexusApiRegistry, prefix: str, policies: list[str]) -> str:
        name = unique_name(f"e2e-{prefix}")
        resp = api.roles.create(body=RoleCreate(name=name, policies=policies))
        role = resp.assert_and_get()
        nonlocal role_id, test_api
        test_api = api
        role_id = role.id
        return name

    yield _create_role

    # clean up
    if role_id is not None and test_api is not None:
        try:
            test_api.roles.delete(role_id=role_id)
        except Exception:
            pass  # Best effort cleanup
