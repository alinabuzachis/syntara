"""WorkflowVersionCreatedEvent domain event.

Fired when a new workflow version is saved (initial creation or definition update).
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
