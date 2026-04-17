"""Unit tests for audit event API schemas."""

from datetime import UTC, datetime
from uuid import uuid4

from nexus.audit.models import AuditContextData, BaseAuditData
from nexus.audit.schemas import AuditEventListParams, AuditEventRead


class TestAuditEventRead:
    """Test AuditEventRead response schema."""

    def test_from_attributes_with_all_fields(self) -> None:
        """Test model_validate with from_attributes from a dict-like object."""
        event_id = uuid4()
        actor_id = uuid4()
        workflow_id = uuid4()
        execution_id = uuid4()

        structured_payload = {
            "data_type": "context",
            "username": "testuser",
            "count": 42,
            "active": True,
            "tags": ["admin", "staff"],
            "nested": {"key": "val", "deep": {"level": 3}},
            "nullable_field": None,
        }
        now = datetime.now(UTC)
        data = {
            "id": event_id,
            "created_at": now,
            "event_category": "user_action",
            "event_severity": "warning",
            "event_status": "success",
            "event_action": "create_resource",
            "actor_id": actor_id,
            "actor_type": "user",
            "source_component": "test_service",
            "workflow_id": workflow_id,
            "activity_id": "activity_123",
            "execution_id": execution_id,
            "event_message": "Resource created",
            "structured_data": structured_payload,
        }

        schema = AuditEventRead.model_validate(data)

        assert schema.id == event_id
        assert schema.created_at == now
        assert schema.event_category == "user_action"
        assert schema.event_severity == "warning"
        assert schema.event_status == "success"
        assert schema.event_action == "create_resource"
        assert schema.actor_id == actor_id
        assert schema.actor_type == "user"
        assert schema.source_component == "test_service"
        assert schema.workflow_id == workflow_id
        assert schema.activity_id == "activity_123"
        assert schema.execution_id == execution_id
        assert schema.event_message == "Resource created"

        # Verify structured_data is discriminated to the typed variant and preserves extras
        sd = schema.structured_data
        assert isinstance(sd, AuditContextData)
        dumped = sd.model_dump()
        assert dumped["username"] == "testuser"
        assert isinstance(dumped["username"], str)
        assert isinstance(dumped["count"], int)
        assert isinstance(dumped["active"], bool)
        assert isinstance(dumped["tags"], list)
        assert dumped["tags"] == ["admin", "staff"]
        assert isinstance(dumped["nested"], dict)
        assert dumped["nested"]["deep"]["level"] == 3
        assert dumped["nullable_field"] is None

    def test_optional_fields_default_to_none(self) -> None:
        """Test that optional fields default to None."""
        schema = AuditEventRead.model_validate(
            {
                "id": uuid4(),
                "created_at": datetime.now(UTC),
                "event_category": "system_operation",
                "event_action": "heartbeat",
                "source_component": "monitor",
                "event_message": "Heartbeat",
                "structured_data": {"data_type": "base"},
            }
        )

        assert schema.actor_id is None
        assert schema.actor_type is None
        assert schema.workflow_id is None
        assert schema.activity_id is None
        assert schema.execution_id is None
        assert schema.event_status is None
        assert schema.event_severity == "info"

    def test_structured_data_defaults_to_base_audit_data(self) -> None:
        """Test that structured_data defaults to an empty BaseAuditData instance."""
        schema = AuditEventRead.model_validate(
            {
                "id": uuid4(),
                "created_at": datetime.now(UTC),
                "event_category": "system_operation",
                "event_action": "test",
                "actor_type": "system",
                "source_component": "test",
                "event_message": "Test",
            }
        )

        assert isinstance(schema.structured_data, BaseAuditData)
        assert schema.structured_data.error_type is None
        assert schema.structured_data.error_message is None


class TestAuditEventListParams:
    """Test AuditEventListParams query parameter schema."""

    def test_inherits_base_list_params(self) -> None:
        """Test that AuditEventListParams has inherited fields from BaseListParams."""
        params = AuditEventListParams()

        # BaseListParams provides these defaults
        assert hasattr(params, "limit")
        assert hasattr(params, "cursor")
        assert hasattr(params, "sort")
