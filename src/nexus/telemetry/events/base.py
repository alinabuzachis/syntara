"""Base telemetry event class.

Provides the abstract base for all telemetry events transmitted to Segment.com.
"""

import re

from sqlmodel import Field, SQLModel


class BaseTelemetryEvent(SQLModel):
    """Abstract base class for all telemetry events.

    All telemetry events inherit from this base. The to_segment_event() method
    provides a default implementation that converts the event to Segment Track API format.

    The event name is derived from the class name by converting CamelCase to
    snake_case and removing the "Event" suffix.

    Attributes:
        entitlement_id: Unique Nexus installation identifier for anonymized tracking.
        workflow_execution_id: Unique workflow execution identifier (UUID v4 format).

    """

    model_config = {"frozen": True}

    entitlement_id: str = Field(description="Unique Nexus installation identifier")
    workflow_execution_id: str = Field(description="Unique workflow execution identifier (UUID v4)")

    @classmethod
    def _get_event_name(cls) -> str:
        """Get the Segment event name for this event class.

        Derives the name from the class name by converting CamelCase to
        snake_case and removing the "Event" suffix.

        Returns:
            The event name string in snake_case format.

        """
        name = cls.__name__.removesuffix("Event")
        return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()

    def to_segment_event(self) -> dict[str, object]:
        """Convert to Segment Track API format.

        Returns:
            Dictionary with userId, event name, and properties for Segment Track API.

        """
        return {
            "userId": self.entitlement_id,
            "event": self._get_event_name(),
            "properties": self.model_dump(exclude={"entitlement_id"}),
        }
