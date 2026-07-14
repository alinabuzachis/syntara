"""Reusable factory helpers and pytest fixtures for E2E resource creation."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol
from uuid import UUID

import pytest
from nexus_api_client.models.workflow_create import WorkflowCreate
from nexus_api_client.models.workflow_definition import WorkflowDefinition

from nexus_test_sdk.helpers import MINIMAL_WORKFLOW_DEFINITION, unique_name

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
        *,
        force_save: bool = False,
    ) -> tuple[UUID, str]: ...


@pytest.fixture(scope="module")
def create_workflow() -> Generator[WorkflowFactory, None, None]:
    """Create test workflows. Returns ``(workflow_id, workflow_name)``."""
    created: list[tuple[UUID, NexusApiRegistry]] = []

    def _create_workflow(
        api: NexusApiRegistry,
        project_id: UUID,
        prefix: str | None = None,
        name: str | None = None,
        definition: dict[str, Any] | WorkflowDefinition | None = None,
        *,
        force_save: bool = False,
    ) -> tuple[UUID, str]:
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
            force_save=force_save,
        )
        wf = resp.assert_and_get()
        wf_id = UUID(str(wf.id))
        created.append((wf_id, api))
        return wf_id, str(wf.name)

    yield _create_workflow

    for wf_id, api in created:
        try:
            api.workflows.delete(workflow_id=wf_id)
        except Exception:
            pass
