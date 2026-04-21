"""Unit tests for AuditEventRecord model and from_event conversion."""

from uuid import uuid4

from nexus.audit.models.audit_event import ActorType, AuditEvent, EventCategory, EventSeverity, EventStatus
from nexus.audit.models.audit_event_record import AuditEventRecord
from nexus.audit.models.structured_data import (
    AuditContextData,
    BaseAuditData,
    FunctionData,
)


class TestAuditEventRecordFromEvent:
    """Test AuditEventRecord.from_event() conversion."""

    def test_from_event_maps_all_fields(self) -> None:
        """Test that from_event correctly maps all AuditEvent fields."""
        event_id = uuid4()
        actor_id = uuid4()
        workflow_id = uuid4()
        execution_id = uuid4()

        event = AuditEvent(
            event_id=event_id,
            event_category=EventCategory.USER_ACTION,
            event_severity=EventSeverity.INFO,
            event_status=EventStatus.SUCCESS,
            event_action="create_resource",
            actor_id=actor_id,
            actor_type=ActorType.USER,
            source_component="test_service",
            workflow_id=workflow_id,
            activity_id="activity_123",
            execution_id=execution_id,
            event_message="Resource created",
            structured_data=BaseAuditData(),
        )

        record = AuditEventRecord.from_event(event)

        assert record.id == event_id
        assert record.event_category == EventCategory.USER_ACTION
        assert record.event_severity == EventSeverity.INFO
        assert record.event_status == EventStatus.SUCCESS
        assert record.event_action == "create_resource"
        assert record.actor_id == actor_id
        assert record.actor_type == ActorType.USER
        assert record.source_component == "test_service"
        assert record.workflow_id == workflow_id
        assert record.activity_id == "activity_123"
        assert record.execution_id == execution_id
        assert record.event_message == "Resource created"

    def test_from_event_uses_event_id_as_primary_key(self) -> None:
        """Test that event_id becomes the record's id (primary key)."""
        event_id = uuid4()
        event = AuditEvent(
            event_id=event_id,
            event_category=EventCategory.SYSTEM_OPERATION,
            event_action="startup",
            source_component="core",
            event_message="System started",
        )

        record = AuditEventRecord.from_event(event)

        assert record.id == event_id

    def test_from_event_with_none_optional_fields(self) -> None:
        """Test conversion when optional fields are None."""
        event = AuditEvent(
            event_category=EventCategory.SYSTEM_OPERATION,
            event_action="cleanup",
            source_component="scheduler",
            event_message="Cleanup completed",
        )

        record = AuditEventRecord.from_event(event)

        assert record.actor_id is None
        assert record.actor_type is None
        assert record.workflow_id is None
        assert record.activity_id is None
        assert record.execution_id is None
        assert record.event_status is None

    def test_from_event_preserves_base_audit_data(self) -> None:
        """Test that BaseAuditData is passed through as a typed instance."""
        event = AuditEvent(
            event_category=EventCategory.USER_ACTION,
            event_action="login",
            source_component="auth",
            event_message="User logged in",
            structured_data=BaseAuditData(
                error_type="AuthError",
                error_message="Invalid credentials",
            ),
        )

        record = AuditEventRecord.from_event(event)

        assert isinstance(record.structured_data, BaseAuditData)
        assert record.structured_data.error_type == "AuthError"
        assert record.structured_data.error_message == "Invalid credentials"

    def test_from_event_preserves_function_data(self) -> None:
        """Test that FunctionData is passed through as a typed instance."""
        event = AuditEvent(
            event_category=EventCategory.API_EXECUTION,
            event_action="call_api",
            source_component="api_client",
            event_message="API called",
            structured_data=FunctionData(
                function_args={"param": "value"},
                function_result={"status": "ok"},
            ),
        )

        record = AuditEventRecord.from_event(event)

        assert isinstance(record.structured_data, FunctionData)
        assert record.structured_data.function_args == {"param": "value"}
        assert record.structured_data.function_result == {"status": "ok"}

    def test_from_event_preserves_audit_context_data_with_extras(self) -> None:
        """Test that AuditContextData retains extra fields on the typed instance."""
        event = AuditEvent(
            event_category=EventCategory.AGENT_INTERACTION,
            event_action="agent_query",
            source_component="agent",
            event_message="Agent queried",
            structured_data=AuditContextData(
                custom_field="custom_value",
                nested={"key": "val"},
            ),
        )

        record = AuditEventRecord.from_event(event)

        assert isinstance(record.structured_data, AuditContextData)
        dumped = record.structured_data.model_dump()
        assert dumped["custom_field"] == "custom_value"
        assert dumped["nested"] == {"key": "val"}

    def test_from_event_structured_data_preserves_types(self) -> None:
        """Test that structured_data retains nested Python types end-to-end."""
        event = AuditEvent(
            event_category=EventCategory.API_EXECUTION,
            event_action="call_api",
            source_component="api_client",
            event_message="API called",
            structured_data=FunctionData(
                error_type="ValidationError",
                error_message="Bad request",
                function_args={
                    "username": "testuser",
                    "count": 42,
                    "active": True,
                    "tags": ["admin", "staff"],
                    "nested": {"key": "val", "deep": {"level": 3}},
                    "nullable_field": None,
                },
                function_result={"items": [1, 2, 3], "ok": True},
            ),
        )

        record = AuditEventRecord.from_event(event)
        sd = record.structured_data
        assert isinstance(sd, FunctionData)

        # BaseAuditData fields
        assert isinstance(sd.error_type, str)
        assert isinstance(sd.error_message, str)

        # FunctionData.function_args preserves nested types
        args = sd.function_args
        assert isinstance(args, dict)
        assert isinstance(args["username"], str)
        assert isinstance(args["count"], int)
        assert isinstance(args["active"], bool)
        assert isinstance(args["tags"], list)
        assert args["tags"] == ["admin", "staff"]
        assert isinstance(args["nested"], dict)
        assert args["nested"]["deep"]["level"] == 3
        assert args["nullable_field"] is None

        # FunctionData.function_result preserves types
        result = sd.function_result
        assert isinstance(result, dict)
        assert isinstance(result["items"], list)
        assert result["items"] == [1, 2, 3]
        assert isinstance(result["ok"], bool)

    def test_from_event_stores_enums_as_strings(self) -> None:
        """Test that enum fields are stored as plain strings."""
        event = AuditEvent(
            event_category=EventCategory.SECURITY_EVENT,
            event_severity=EventSeverity.CRITICAL,
            event_status=EventStatus.ERROR,
            event_action="access_denied",
            actor_type=ActorType.SERVICE,
            source_component="auth",
            event_message="Access denied",
        )

        record = AuditEventRecord.from_event(event)

        # StrEnum values are strings
        assert record.event_category == "security_event"
        assert record.event_severity == "critical"
        assert record.event_status == "error"
        assert record.actor_type == "service"

    def test_from_event_default_structured_data(self) -> None:
        """Test conversion with default (empty) structured data."""
        event = AuditEvent(
            event_category=EventCategory.SYSTEM_OPERATION,
            event_action="heartbeat",
            source_component="monitor",
            event_message="Heartbeat",
        )

        record = AuditEventRecord.from_event(event)

        assert isinstance(record.structured_data, BaseAuditData)
        assert record.structured_data.error_type is None
        assert record.structured_data.error_message is None


class TestAuditEventRecordTableConfig:
    """Test AuditEventRecord table configuration."""

    def test_tablename(self) -> None:
        """Test that the table name is audit_events."""
        assert AuditEventRecord.__tablename__ == "audit_events"

    def test_filterable_fields(self) -> None:
        """Test that expected fields are filterable."""
        expected = {
            "id",
            "created_at",
            "updated_at",
            "event_category",
            "event_severity",
            "event_status",
            "event_action",
            "actor_id",
            "actor_type",
            "source_component",
            "workflow_id",
            "activity_id",
            "execution_id",
        }
        assert set(AuditEventRecord.__filterable_fields__) == expected

    def test_sortable_fields(self) -> None:
        """Test that expected fields are sortable."""
        expected = {"created_at", "updated_at", "event_category", "event_severity", "event_status", "actor_type"}
        assert set(AuditEventRecord.__sortable_fields__) == expected
