"""Workflow version telemetry event models.

Emitted when workflow versions are created or restored, enabling tracking of
workflow evolution frequency, patterns, and rollback rates.
"""

from __future__ import annotations

from sqlmodel import Field

from nexus.telemetry.events.base import BaseTelemetryEvent


class WorkflowVersionCreatedEvent(BaseTelemetryEvent):
    """Telemetry event emitted when a new workflow version is created.

    Attributes:
        workflow_id: Unique workflow identifier (UUID v4 format).
        version: Sequential version number within the workflow.

    """

    workflow_id: str = Field(description="Unique workflow identifier (UUID v4)")
    version: int = Field(ge=1, description="Sequential version number")


class WorkflowVersionRestoredEvent(BaseTelemetryEvent):
    """Telemetry event emitted when a workflow version is restored.

    Attributes:
        workflow_id: Unique workflow identifier (UUID v4 format).
        restored_from_version: Version number that was restored from.
        new_version: Version number of the newly created draft.

    """

    workflow_id: str = Field(description="Unique workflow identifier (UUID v4)")
    restored_from_version: int = Field(ge=1, description="Source version restored from")
    new_version: int = Field(ge=1, description="New draft version created by restore")
