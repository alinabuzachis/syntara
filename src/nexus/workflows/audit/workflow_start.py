"""Workflow-start domain event.

Fired when a workflow execution transitions from PENDING to RUNNING.

Requirement: AAP-74302
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from nexus.workflows.workflow_engine.models.workflow_definition import ActivityName  # noqa: TC001

if TYPE_CHECKING:
    from uuid import UUID


@dataclass
class WorkflowStartEvent:
    """Domain event fired when a workflow execution begins."""

    execution_id: UUID
    workflow_id: UUID
    trigger_type: ActivityName | None = field(default=None)
    request_id: UUID | None = field(default=None)
