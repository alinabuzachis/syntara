"""Reusable factory helpers and pytest fixtures for E2E resource creation."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol
from uuid import UUID

import pytest
from nexus_api_client.models.workflow_create import WorkflowCreate
from nexus_api_client.models.workflow_definition import WorkflowDefinition

from tests.e2e.conftest import unique_name
from tests.e2e.fixtures.constants import MINIMAL_WORKFLOW_DEFINITION

if TYPE_CHECKING:
    from collections.abc import Generator

    from nexus_api_client.api import NexusApiRegistry


class WorkflowFactory(Protocol):
    """Protocol ensuring type safety for optional and keyword arguments on the factory."""

    def __call__(
        self,
        api: NexusApiRegistry,
        project_id: UUID,
        prefix: str | None = None,
        name: str | None = None,
        definition: dict[str, Any] | WorkflowDefinition | None = None,
    ) -> tuple[UUID, str]: ...


@pytest.fixture(scope="module")
def create_workflow() -> Generator[WorkflowFactory, None, None]:
    """Create test workflow. Returns ``(workflow_id, workflow_name)``."""
    created_workflow_id = None
    test_api = None

    def _create_workflow(
        api: NexusApiRegistry,
        project_id: UUID,
        prefix: str | None = None,
        name: str | None = None,
        definition: dict[str, Any] | WorkflowDefinition | None = None,
    ) -> tuple[UUID, str]:
        """Create a minimal test workflow. Returns ``(workflow_id, name)``."""
        prefx = prefix or "test"
        workflow_name = name or unique_name(f"e2e-rbac-wf-{prefx}")
        workflow_def = MINIMAL_WORKFLOW_DEFINITION
        if definition is not None:
            workflow_def = WorkflowDefinition.from_dict(definition) if isinstance(definition, dict) else definition
        resp = api.workflows.create(
            body=WorkflowCreate(
                name=workflow_name,
                workflow_definition=workflow_def,
                project_id=project_id,
            ),
        )
        wf = resp.assert_and_get()
        nonlocal created_workflow_id, test_api
        test_api = api
        created_workflow_id = UUID(str(wf.id))
        return created_workflow_id, str(wf.name)

    yield _create_workflow

    # delete user
    if created_workflow_id is not None and test_api is not None:
        try:
            test_api.workflows.delete(workflow_id=created_workflow_id)
        except Exception:
            pass  # Best effort cleanup
