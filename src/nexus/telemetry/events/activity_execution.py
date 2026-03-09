"""Activity execution telemetry event model and builder.

Defines the SQLModel model for activity execution events and a builder
class for constructing events from activity execution context.
"""

from __future__ import annotations

import hashlib
import json
import re
from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from sqlmodel import Field

from nexus.telemetry.events.base import BaseTelemetryEvent
from nexus.workflows.workflow_engine.models.workflow_definition import (  # noqa: TC001
    ActivityTerminalStatus,
    ActivityType,
)

_SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$", re.IGNORECASE)


class ActivityExecutionEvent(BaseTelemetryEvent):
    """Telemetry event emitted when an activity executes within a workflow.

    Attributes:
        entitlement_id: Nexus installation identifier.
        workflow_execution_id: Links to parent workflow execution (UUID v4).
        activity_type: Type of activity executed.
        activity_hash: SHA-256 hash of activity definition.
        status: Activity execution outcome.
        action_type: Optional action type for task activities.
        inbound_activities: Optional array of activity hashes that led to this activity.
        outbound_activities: Optional array of activity hashes triggered by this activity.
        error_type: Categorized error type if activity failed, null otherwise.

    """

    activity_type: ActivityType
    activity_hash: str = Field(description="SHA-256 hash of activity definition")
    status: ActivityTerminalStatus
    duration_ms: int | None = Field(
        default=None,
        description="Activity execution duration in milliseconds",
    )

    @field_validator("activity_hash")
    @classmethod
    def _validate_hash(cls, v: str) -> str:
        if not _SHA256_PATTERN.match(v):
            msg = "activity_hash must be a 64-character hex string"
            raise ValueError(msg)
        return v

    action_type: str | None = Field(
        default=None,
        description="Optional action type for task activities",
    )
    inbound_activities: list[str] | None = Field(
        default=None,
        description="Optional array of activity hashes that led to this activity's execution",
    )
    outbound_activities: list[str] | None = Field(
        default=None,
        description="Optional array of activity hashes triggered by this activity",
    )
    error_type: Literal["ActivityExecutionError"] | None = Field(
        default=None,
        description="Categorized error type if activity failed, null otherwise",
    )


class ActivityExecutionEventBuilder:
    """Builder for constructing activity execution telemetry events.

    Attributes:
        entitlement_id: Nexus installation identifier.

    """

    def __init__(self, entitlement_id: str) -> None:
        """Initialize the builder.

        Args:
            entitlement_id: Nexus installation identifier.

        """
        self.entitlement_id = entitlement_id

    @staticmethod
    @lru_cache(maxsize=256)
    def _calculate_definition_hash(canonical_json: str) -> str:
        """Calculate SHA-256 hash of an activity definition for anonymized identification.

        Args:
            canonical_json: Canonical JSON string representation of the activity definition.

        Returns:
            64-character hex string SHA-256 hash.

        """
        return hashlib.sha256(canonical_json.encode()).hexdigest()

    def build_event(
        self,
        workflow_execution_id: str,
        activity_type: ActivityType,
        activity_def: dict[str, object],
        status: ActivityTerminalStatus,
        duration_ms: int | None = None,
        action_type: str | None = None,
        inbound_activities: list[str] | None = None,
        outbound_activities: list[str] | None = None,
        error_type: Literal["ActivityExecutionError"] | None = None,
    ) -> ActivityExecutionEvent:
        """Build an activity execution event.

        Args:
            workflow_execution_id: Links to parent workflow execution (UUID v4).
            activity_type: Type of activity executed.
            activity_def: Activity definition dictionary for hash calculation.
            status: Activity execution outcome.
            duration_ms: Activity execution duration in milliseconds.
            action_type: Optional action type for task activities.
            inbound_activities: Optional array of preceding activity hashes.
            outbound_activities: Optional array of following activity hashes.
            error_type: Categorized error type if activity failed.

        Returns:
            ActivityExecutionEvent instance.

        """
        canonical_json = json.dumps(activity_def, sort_keys=True)
        activity_hash = self._calculate_definition_hash(canonical_json)
        return ActivityExecutionEvent(
            entitlement_id=self.entitlement_id,
            workflow_execution_id=workflow_execution_id,
            activity_type=activity_type,
            activity_hash=activity_hash,
            status=status,
            duration_ms=duration_ms,
            action_type=action_type,
            inbound_activities=inbound_activities,
            outbound_activities=outbound_activities,
            error_type=error_type,
        )
