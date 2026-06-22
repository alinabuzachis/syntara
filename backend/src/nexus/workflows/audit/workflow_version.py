"""Workflow version lifecycle domain events.

Fired when workflow versions are created, restored, published, or unpublished.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from uuid import UUID


@dataclass
class WorkflowVersionCreatedEvent:
    """Domain event fired when a new workflow version is created."""

    workflow_id: UUID
    version: int
    workflow_name: str


@dataclass
class WorkflowVersionRestoredEvent:
    """Domain event fired when a workflow version is restored from a previous version."""

    workflow_id: UUID
    restored_from_version: int
    new_version: int
    workflow_name: str


@dataclass
class WorkflowVersionPublishedEvent:
    """Domain event fired when a workflow version is published."""

    workflow_id: UUID
    version: int
    workflow_name: str


@dataclass
class WorkflowVersionUnpublishedEvent:
    """Domain event fired when a workflow is unpublished."""

    workflow_id: UUID
    version: int
    workflow_name: str
