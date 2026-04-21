"""Audit event model and enums for tracking system activities."""

from enum import StrEnum
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel

from nexus.audit.models.structured_data import AuditDataUnion, BaseAuditData


class EventCategory(StrEnum):
    """Categories for different types of audit events."""

    USER_ACTION = "user_action"
    WORKFLOW_EVENT = "workflow_event"
    AGENT_INTERACTION = "agent_interaction"
    LLM_INTERACTION = "llm_interaction"
    LLM_TOOL_CALL = "llm_tool_call"
    LLM_REASONING = "llm_reasoning"
    API_EXECUTION = "api_execution"
    SYSTEM_OPERATION = "system_operation"
    SECURITY_EVENT = "security_event"


class EventSeverity(StrEnum):
    """Severity levels for audit events."""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class EventStatus(StrEnum):
    """Status of an audited operation."""

    SUCCESS = "success"
    ERROR = "error"


class ActorType(StrEnum):
    """Types of actors that can perform audited actions."""

    USER = "user"
    SYSTEM = "system"
    SERVICE = "service"


class AuditEvent(SQLModel):
    """Audit event model for tracking system activities and user actions."""

    # Core identification
    event_id: UUID = Field(default_factory=uuid4, description="Unique identifier for the audit event")
    event_category: EventCategory = Field(description="Category of the audit event")
    event_severity: EventSeverity = Field(default=EventSeverity.INFO, description="Severity level of the audit event")
    event_status: EventStatus | None = Field(default=None, description="Status of the audited operation")
    event_action: str = Field(description="Specific action that occurred")

    # Actor and source information
    actor_id: UUID | None = Field(default=None, description="User/system/service that performed action")
    actor_type: ActorType | None = Field(default=None, description="Type of actor (user|system|service)")
    source_component: str = Field(description="Component that generated event")

    # Context tracking
    workflow_id: UUID | None = Field(default=None, description="Workflow identifier for workflow-scoped events")
    activity_id: str | None = Field(default=None, description="Activity identifier for activity-level events")
    execution_id: UUID | None = Field(default=None, description="Execution identifier for execution tracing")

    # Human-readable message
    event_message: str = Field(description="Human-readable description of the event")

    # Event data (sanitized)
    structured_data: AuditDataUnion = Field(
        default_factory=BaseAuditData, description="Structured event data (sanitized)"
    )
