"""Unit tests for InvocationContextData and InvocationMetadata typed models."""

from typing import Any

import pytest
from pydantic import HttpUrl, SecretStr, ValidationError

from nexus.agent_orchestrator.models.context_data import InvocationContextData, InvocationMetadata, OpaqueResponseSchema


class TestInvocationMetadata:
    """Tests for InvocationMetadata model."""

    def test_minimal_construction(self) -> None:
        meta = InvocationMetadata()
        assert meta.credential_id is None
        assert meta.response_schema is None
        assert meta.request_id is None

    def test_full_construction(self) -> None:
        meta = InvocationMetadata(
            credential_id=SecretStr("cred-123"),
            response_schema=OpaqueResponseSchema({"type": "object"}),
            request_id="req-456",
            llm_base_url=HttpUrl("https://api.example.com"),
            llm_provider="openrouter",
            activity_name="agentic_v2",
            workflow_id="wf-789",
        )
        assert meta.credential_id is not None
        assert meta.credential_id.get_secret_value() == "cred-123"
        assert meta.response_schema is not None
        assert meta.response_schema.get_data() == {"type": "object"}
        assert str(meta.llm_base_url) == "https://api.example.com/"

    def test_secret_str_from_raw_dict(self) -> None:
        """model_validate auto-wraps plain strings into SecretStr."""
        meta = InvocationMetadata.model_validate({"credential_id": "cred-1"})
        assert isinstance(meta.credential_id, SecretStr)
        assert meta.credential_id.get_secret_value() == "cred-1"

    def test_secret_str_masked_in_repr(self) -> None:
        meta = InvocationMetadata.model_validate({"credential_id": "secret-cred"})
        assert "secret-cred" not in repr(meta)

    def test_audit_safe_dump_excludes_sensitive_fields(self) -> None:
        meta = InvocationMetadata.model_validate(
            {
                "credential_id": "cred-123",
                "response_schema": {"type": "object"},
                "request_id": "req-456",
                "activity_name": "agentic_v2",
            }
        )
        safe = meta.audit_safe_dump()

        assert "credential_id" not in safe
        assert "response_schema" not in safe
        assert safe["request_id"] == "req-456"
        assert safe["activity_name"] == "agentic_v2"

    def test_extra_fields_ignored(self) -> None:
        meta = InvocationMetadata.model_validate({"custom_key": "custom_value"})
        assert "custom_key" not in meta.model_dump()


class TestInvocationContextData:
    """Tests for InvocationContextData model."""

    def test_minimal_construction(self) -> None:
        ctx = InvocationContextData()
        assert ctx.file_ids == []
        assert ctx.agent is None
        assert ctx.model is None
        assert ctx.metadata is None

    def test_from_raw_dict(self) -> None:
        raw: dict[str, Any] = {
            "file_ids": ["id-1", "id-2"],
            "agent": "workflow-agent",
            "model": "gpt-4",
            "callback_url": "https://example.com/cb",
            "metadata": {
                "request_id": "req-1",
                "credential_id": "cred-1",
                "llm_base_url": "https://api.example.com",
            },
        }
        ctx = InvocationContextData.model_validate(raw)
        assert ctx.file_ids == ["id-1", "id-2"]
        assert ctx.agent == "workflow-agent"
        assert isinstance(ctx.callback_url, SecretStr)
        assert ctx.callback_url.get_secret_value() == "https://example.com/cb"
        assert ctx.metadata is not None
        assert ctx.metadata.request_id == "req-1"
        assert ctx.metadata.credential_id is not None
        assert ctx.metadata.credential_id.get_secret_value() == "cred-1"

    def test_audit_safe_metadata(self) -> None:
        ctx = InvocationContextData.model_validate(
            {
                "metadata": {
                    "credential_id": "cred-secret",
                    "response_schema": {"type": "string"},
                    "request_id": "req-visible",
                }
            }
        )
        safe = ctx.audit_safe_metadata()
        assert "credential_id" not in safe
        assert "response_schema" not in safe
        assert safe["request_id"] == "req-visible"

    def test_audit_safe_metadata_when_none(self) -> None:
        ctx = InvocationContextData()
        assert ctx.audit_safe_metadata() == {}

    def test_extra_fields_preserved(self) -> None:
        raw: dict[str, Any] = {"file_ids": [], "environment": "production", "region": "us-east-1"}
        ctx = InvocationContextData.model_validate(raw)
        dumped = ctx.model_dump()
        assert dumped["environment"] == "production"
        assert dumped["region"] == "us-east-1"

    def test_empty_dict_validation(self) -> None:
        ctx = InvocationContextData.model_validate({})
        assert ctx.file_ids == []
        assert ctx.metadata is None

    def test_round_trip_preserves_data(self) -> None:
        """model_validate -> model_dump round-trip preserves all fields."""
        raw: dict[str, Any] = {
            "file_ids": ["f1"],
            "agent": "test-agent",
            "model": "gpt-4",
            "callback_url": "https://cb.example.com",
            "input_data": {"key": "val"},
            "metadata": {
                "credential_id": "c1",
                "response_schema": {"type": "object"},
                "request_id": "r1",
                "llm_base_url": "https://llm.example.com",
                "activity_name": "agentic_v2",
                "workflow_id": "w1",
            },
        }
        ctx = InvocationContextData.model_validate(raw)
        assert ctx.callback_url is not None
        assert ctx.callback_url.get_secret_value() == "https://cb.example.com"
        assert ctx.metadata is not None
        assert ctx.metadata.credential_id is not None
        assert ctx.metadata.credential_id.get_secret_value() == "c1"
        assert ctx.metadata.response_schema is not None
        assert ctx.metadata.response_schema.get_data() == {"type": "object"}

        # Verify round-trip: dump and re-validate produces equivalent data
        dumped = ctx.model_dump()
        ctx2 = InvocationContextData.model_validate(dumped)
        assert ctx2.file_ids == ["f1"]
        assert ctx2.agent == "test-agent"
        assert ctx2.model == "gpt-4"
        assert ctx2.callback_url is not None
        assert ctx2.callback_url.get_secret_value() == "https://cb.example.com"
        assert ctx2.input_data == {"key": "val"}
        assert ctx2.metadata is not None
        assert ctx2.metadata.credential_id is not None
        assert ctx2.metadata.credential_id.get_secret_value() == "c1"
        assert ctx2.metadata.response_schema is not None
        assert ctx2.metadata.response_schema.get_data() == {"type": "object"}
        assert ctx2.metadata.request_id == "r1"
        assert ctx2.metadata.activity_name == "agentic_v2"
        assert ctx2.metadata.workflow_id == "w1"

    def test_top_level_callback_url_is_secret(self) -> None:
        ctx = InvocationContextData.model_validate({"callback_url": "https://secret-cb.com"})
        assert isinstance(ctx.callback_url, SecretStr)
        assert "https://secret-cb.com" not in repr(ctx)

    def test_metadata_rejects_invalid_type(self) -> None:
        """Metadata must be dict, InvocationMetadata, or None — not a list or string."""
        with pytest.raises(ValidationError, match="metadata must be a dict"):
            InvocationContextData.model_validate({"metadata": ["not", "a", "dict"]})

        with pytest.raises(ValidationError, match="metadata must be a dict"):
            InvocationContextData.model_validate({"metadata": "bad"})


class TestOpaqueResponseSchema:
    """Tests for OpaqueResponseSchema wrapper type."""

    def test_get_data_returns_wrapped_value(self) -> None:
        schema = {"type": "object", "properties": {"name": {"type": "string"}}}
        opaque = OpaqueResponseSchema(schema)
        assert opaque.get_data() == schema

    def test_repr_hides_data(self) -> None:
        opaque = OpaqueResponseSchema({"type": "object", "secret": "large-payload"})
        assert repr(opaque) == "OpaqueResponseSchema(**)"
        assert str(opaque) == "OpaqueResponseSchema(**)"
        assert "large-payload" not in repr(opaque)

    def test_equality(self) -> None:
        a = OpaqueResponseSchema({"type": "object"})
        b = OpaqueResponseSchema({"type": "object"})
        c = OpaqueResponseSchema({"type": "string"})
        assert a == b
        assert a != c

    def test_model_validate_wraps_dict(self) -> None:
        """model_validate auto-wraps raw dicts into OpaqueResponseSchema."""
        meta = InvocationMetadata.model_validate({"response_schema": {"type": "object"}})
        assert isinstance(meta.response_schema, OpaqueResponseSchema)
        assert meta.response_schema.get_data() == {"type": "object"}

    def test_model_dump_unwraps(self) -> None:
        """model_dump serializes OpaqueResponseSchema back to the raw value."""
        meta = InvocationMetadata.model_validate({"response_schema": {"type": "object"}})
        dumped = meta.model_dump()
        assert dumped["response_schema"] == {"type": "object"}

    def test_excluded_from_audit_safe_dump(self) -> None:
        meta = InvocationMetadata.model_validate({"response_schema": {"type": "object"}, "request_id": "r1"})
        safe = meta.audit_safe_dump()
        assert "response_schema" not in safe
        assert safe["request_id"] == "r1"

    def test_none_response_schema(self) -> None:
        meta = InvocationMetadata()
        assert meta.response_schema is None

    def test_rejects_non_dict(self) -> None:
        with pytest.raises(ValidationError, match="response_schema must be a dict"):
            InvocationMetadata.model_validate({"response_schema": "not-a-dict"})

    def test_rejects_missing_type_field(self) -> None:
        with pytest.raises(ValidationError, match="must include a 'type' field"):
            InvocationMetadata.model_validate({"response_schema": {"properties": {}}})
