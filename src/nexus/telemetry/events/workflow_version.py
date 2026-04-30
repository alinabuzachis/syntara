"""Workflow version telemetry event model.

Emitted when a new workflow version is saved, enabling tracking of
workflow evolution frequency and patterns.
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
