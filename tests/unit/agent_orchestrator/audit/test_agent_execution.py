"""Unit tests for AgentExecutionEvent and AgentExecutionHandler."""

# mypy: disable-error-code="attr-defined"

from uuid import uuid4

from nexus.agent_orchestrator.audit.agent_execution import (
    AgentExecutionEvent,
    AgentExecutionHandler,
    AgentExecutionStatus,
)
from nexus.audit.emitter import AuditActorContext
from nexus.audit.handler import AuditEventHandler
from nexus.audit.models.audit_event import ActorType, EventCategory, EventSeverity, EventStatus
from nexus.audit.models.structured_data import AuditContextData
from nexus.core.models.user import User


class TestAgentExecutionHandler:
    """Tests for AgentExecutionHandler audit event handler."""

    def test_is_audit_event_handler_subclass(self) -> None:
        """AgentExecutionHandler is a subclass of AuditEventHandler."""
        handler = AgentExecutionHandler()
        assert isinstance(handler, AuditEventHandler)

    async def test_started_status_with_user_actor(self, test_user: User) -> None:
        """Started agent execution with USER actor produces SUCCESS status."""
        execution_id = uuid4()
        event = AgentExecutionEvent(
            agent_type="orchestrator",
            session_id="session-123",
            status=AgentExecutionStatus.STARTED,
            execution_id=execution_id,
            actor_context=AuditActorContext(
                actor_id=test_user.id, actor_username=test_user.username, actor_type=ActorType.USER
            ),
        )

        handler = AgentExecutionHandler()
        result = handler.handle(event)

        assert result.event_category == EventCategory.AGENT_INTERACTION
        assert result.event_severity == EventSeverity.INFO
        assert result.event_status == EventStatus.SUCCESS
        assert result.event_action == "agent_started"
        assert result.event_message == "Agent orchestrator started"
        assert result.source_component == "nexus.agent_orchestrator.agents.orchestrator"
        assert result.actor_id == test_user.id
        assert result.actor_type == ActorType.USER
        assert result.actor_username == test_user.username
        assert result.execution_id == execution_id
        assert result.resource_urn == f"urn:nexus:execution:{execution_id}"

        assert isinstance(result.structured_data, AuditContextData)
        assert result.structured_data.data_type == "agent_execution"
        assert result.structured_data.agent_type == "orchestrator"
        assert result.structured_data.status == "started"
        assert result.structured_data.session_id == "session-123"
        assert result.structured_data.error_type is None
        assert result.structured_data.error_message is None

    async def test_failed_status_with_error(self, test_user: User) -> None:
        """Failed agent execution produces ERROR severity with error details."""
        execution_id = uuid4()
        invocation_id = uuid4()
        event = AgentExecutionEvent(
            agent_type="orchestrator",
            session_id="session-789",
            status=AgentExecutionStatus.FAILED,
            invocation_id=invocation_id,
            execution_id=execution_id,
            actor_context=AuditActorContext(
                actor_id=test_user.id, actor_username=test_user.username, actor_type=ActorType.USER
            ),
            error_type="TimeoutError",
        )

        handler = AgentExecutionHandler()
        result = handler.handle(event)

        assert result.event_category == EventCategory.AGENT_INTERACTION
        assert result.event_severity == EventSeverity.ERROR
        assert result.event_status == EventStatus.ERROR
        assert result.event_action == "agent_failed"
        assert result.event_message == "Agent orchestrator failed"
        assert result.source_component == "nexus.agent_orchestrator.agents.orchestrator"
        assert result.actor_id == test_user.id
        assert result.actor_username == test_user.username

        assert isinstance(result.structured_data, AuditContextData)
        assert result.structured_data.data_type == "agent_execution"
        assert result.structured_data.error_type == "TimeoutError"
        assert result.structured_data.error_message == "Agent orchestrator failed"
        assert result.structured_data.status == "failed"

    def test_orchestrator_specific_fields(self) -> None:
        """Orchestrator-specific fields are included in structured data."""
        execution_id = uuid4()
        event = AgentExecutionEvent(
            agent_type="orchestrator",
            session_id="session-abc",
            status=AgentExecutionStatus.COMPLETED,
            execution_id=execution_id,
            actor_context=AuditActorContext(),
            context_applied=True,
            grounding_score=0.85,
            routed_to_agent="generic_agent",
        )

        handler = AgentExecutionHandler()
        result = handler.handle(event)

        assert result.structured_data.context_applied is True
        assert result.structured_data.grounding_score == 0.85
        assert result.structured_data.routed_to_agent == "generic_agent"

    def test_orchestrator_fields_optional(self) -> None:
        """Orchestrator-specific fields are optional (None by default)."""
        execution_id = uuid4()
        event = AgentExecutionEvent(
            agent_type="generic_agent",
            session_id="session-def",
            status=AgentExecutionStatus.STARTED,
            execution_id=execution_id,
            actor_context=AuditActorContext(),
        )

        handler = AgentExecutionHandler()
        result = handler.handle(event)

        assert result.structured_data.context_applied is None
        assert result.structured_data.grounding_score is None
        assert result.structured_data.routed_to_agent is None

    def test_invocation_id_included(self) -> None:
        """Invocation ID is included when provided."""
        execution_id = uuid4()
        invocation_id = uuid4()
        event = AgentExecutionEvent(
            agent_type="orchestrator",
            session_id="session-ghi",
            status=AgentExecutionStatus.STARTED,
            invocation_id=invocation_id,
            execution_id=execution_id,
            actor_context=AuditActorContext(),
        )

        handler = AgentExecutionHandler()
        result = handler.handle(event)

        assert result.execution_id == execution_id
        assert result.structured_data.invocation_id == invocation_id

    def test_invocation_id_optional(self) -> None:
        """Invocation ID is optional in structured_data."""
        execution_id = uuid4()
        event = AgentExecutionEvent(
            agent_type="orchestrator",
            session_id="session-xyz",
            status=AgentExecutionStatus.STARTED,
            invocation_id=None,
            execution_id=execution_id,
            actor_context=AuditActorContext(),
        )

        handler = AgentExecutionHandler()
        result = handler.handle(event)

        assert result.structured_data.invocation_id is None

    def test_no_actor_context(self) -> None:
        """Event without actor_context defaults to SYSTEM actor."""
        execution_id = uuid4()
        event = AgentExecutionEvent(
            agent_type="generic_agent",
            session_id="session-jkl",
            status=AgentExecutionStatus.COMPLETED,
            execution_id=execution_id,
            actor_context=None,
        )

        handler = AgentExecutionHandler()
        result = handler.handle(event)

        assert result.actor_id is None
        assert result.actor_username is None
        assert result.actor_type is None

    def test_source_component_uses_agent_type(self) -> None:
        """Source component is constructed from agent type."""
        execution_id = uuid4()
        event = AgentExecutionEvent(
            agent_type="custom_agent",
            session_id="session-mno",
            status=AgentExecutionStatus.STARTED,
            execution_id=execution_id,
            actor_context=AuditActorContext(),
        )

        handler = AgentExecutionHandler()
        result = handler.handle(event)

        assert result.source_component == "nexus.agent_orchestrator.agents.custom_agent"

    def test_failed_without_error_type(self) -> None:
        """Failed status without explicit error_type still produces error event."""
        execution_id = uuid4()
        event = AgentExecutionEvent(
            agent_type="orchestrator",
            session_id="session-pqr",
            status=AgentExecutionStatus.FAILED,
            execution_id=execution_id,
            actor_context=AuditActorContext(),
            error_type=None,
        )

        handler = AgentExecutionHandler()
        result = handler.handle(event)

        assert result.event_severity == EventSeverity.ERROR
        assert result.event_status == EventStatus.ERROR
        assert result.structured_data.error_type is None
        assert result.structured_data.error_message == "Agent orchestrator failed"
