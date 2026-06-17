"""Reusable factory helpers and pytest fixtures for E2E resource creation."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol
from uuid import UUID

import pytest
from nexus_api_client.models.policy_create import PolicyCreate
from nexus_api_client.models.policy_statement_schema import PolicyStatementSchema

from tests.e2e.conftest import unique_name

if TYPE_CHECKING:
    from collections.abc import Generator

    from nexus_api_client.api import NexusApiRegistry


class PolicyFactory(Protocol):
    """Protocol ensuring type safety for optional and keyword arguments on the factory."""

    def __call__(
        self,
        api: NexusApiRegistry,
        project_id: UUID,
        prefix: str,
        actions: list[str],
    ) -> str: ...


@pytest.fixture(scope="module")
def create_policy() -> Generator[PolicyFactory, None, None]:
    """Create test policy. Returns ``(policy_name)``."""
    created_policy_id = None
    test_api = None

    def _create_policy(
        api: NexusApiRegistry,
        project_id: UUID,
        prefix: str,
        actions: list[str],
    ) -> str:
        """Create a project-scoped deny policy. Returns the policy name."""
        name = unique_name(f"e2e-deny-{prefix}")
        resp = api.policies.create_policy(
            body=PolicyCreate(
                name=name,
                statements=[
                    PolicyStatementSchema(
                        effect="deny",
                        actions=actions,
                        scope="project",
                    ),
                ],
                project_id=project_id,
            ),
        )
        policy = resp.assert_and_get()
        nonlocal created_policy_id, test_api
        test_api = api
        created_policy_id = UUID(str(policy.id))
        return name

    yield _create_policy

    # delete user
    if created_policy_id is not None and test_api is not None:
        try:
            test_api.policies.delete_policy(policy_id=created_policy_id)
        except Exception:
            pass  # Best effort cleanup
