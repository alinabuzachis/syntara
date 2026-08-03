"""Reusable factory helpers and pytest fixtures for E2E resource creation."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

import pytest
from syntara_api_client.models.role_create import RoleCreate

from orchestrator_test_sdk.e2e import unique_name

if TYPE_CHECKING:
    from collections.abc import Generator

    from syntara_api_client.api import SyntaraApiRegistry


class RoleFactory(Protocol):
    """Protocol ensuring type safety for optional and keyword arguments on the factory."""

    def __call__(self, api: SyntaraApiRegistry, prefix: str, policies: list[str]) -> str: ...


@pytest.fixture(scope="module")
def create_role() -> Generator[RoleFactory, None, None]:
    """Create a system-scoped role. Returns the generated role name."""
    created: list[tuple[SyntaraApiRegistry, object]] = []

    def _create_role(api: SyntaraApiRegistry, prefix: str, policies: list[str]) -> str:
        name = unique_name(f"e2e-{prefix}")
        resp = api.roles.create(body=RoleCreate(name=name, policies=policies))
        role = resp.assert_and_get()
        created.append((api, role.id))
        return name

    yield _create_role

    for api, role_id in created:
        try:
            api.roles.delete(role_id=role_id)
        except Exception:
            pass
