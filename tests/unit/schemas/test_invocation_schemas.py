"""Unit tests for invocation data models."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from nexus.api.schemas.invocation import (
    InvocationListResponse,
    InvocationResponse,
    InvocationStatus,
    InvokeRequest,
    InvokeResponse,
)


class TestInvokeRequest:
    """Tests for InvokeRequest model."""

    def test_valid_minimal_request(self) -> None:
        """Test valid request with only required fields."""
        request = InvokeRequest(
            prompt="Deploy app to production",
            user_id="user-123",
            session_id="session-001",
        )

        assert request.prompt == "Deploy app to production"
        assert request.user_id == "user-123"
        assert request.session_id == "session-001"
        assert request.context == {}
        assert request.metadata == {}

    def test_valid_request_with_context(self) -> None:
        """Test valid request with context and metadata."""
        request = InvokeRequest(
            prompt="Deploy app to production",
            user_id="user-123",
            session_id="session-001",
            context={"environment": "prod", "app_id": "app-1"},
            metadata={"correlation_id": "corr-123"},
        )

        assert request.session_id == "session-001"
        assert request.context == {"environment": "prod", "app_id": "app-1"}
        assert request.metadata == {"correlation_id": "corr-123"}

    def test_prompt_too_short(self) -> None:
        """Test validation error when prompt is empty string."""
        with pytest.raises(ValidationError) as exc_info:
            InvokeRequest(
                prompt="",
                user_id="user-123",
                session_id="session-001",
            )

        errors = exc_info.value.errors()
        assert any(e["type"] == "string_too_short" for e in errors)

    def test_prompt_whitespace_only(self) -> None:
        """Test validation error when prompt is whitespace only."""
        with pytest.raises(ValidationError) as exc_info:
            InvokeRequest(
                prompt="   ",
                user_id="user-123",
                session_id="session-001",
            )

        errors = exc_info.value.errors()
        assert any("whitespace" in str(e).lower() for e in errors)

    def test_prompt_too_long(self) -> None:
        """Test validation error when prompt exceeds max length."""
        long_prompt = "x" * 10001

        with pytest.raises(ValidationError) as exc_info:
            InvokeRequest(
                prompt=long_prompt,
                user_id="user-123",
                session_id="session-001",
            )

        errors = exc_info.value.errors()
        assert any(e["type"] == "string_too_long" for e in errors)

    def test_user_id_empty(self) -> None:
        """Test validation error when user_id is empty."""
        with pytest.raises(ValidationError) as exc_info:
            InvokeRequest(
                prompt="Deploy app",
                user_id="",
                session_id="session-001",
            )

        errors = exc_info.value.errors()
        assert any("user" in str(e).lower() for e in errors)

    def test_missing_required_fields(self) -> None:
        """Test validation error when required fields are missing."""
        with pytest.raises(ValidationError) as exc_info:
            InvokeRequest()  # type: ignore[call-arg]

        errors = exc_info.value.errors()
        assert len(errors) >= 3  # prompt, user_id, and session_id are required


class TestInvokeResponse:
    """Tests for InvokeResponse model."""

    def test_valid_response(self) -> None:
        """Test valid invoke response."""
        invocation_id = uuid4()
        created_at = datetime.now(UTC)

        response = InvokeResponse(
            id=invocation_id,
            status=InvocationStatus.RUNNING,
            created_at=created_at,
        )

        assert response.id == invocation_id
        assert response.status == InvocationStatus.RUNNING
        assert response.created_at == created_at
        assert response.ws_url is None

    def test_response_with_ws_url(self) -> None:
        """Test response with WebSocket URL."""
        invocation_id = uuid4()
        ws_url = f"ws://localhost:8000/api/v1/ws/invoke/{invocation_id}"

        response = InvokeResponse(
            id=invocation_id,
            status=InvocationStatus.RUNNING,
            created_at=datetime.now(UTC),
            ws_url=ws_url,
        )

        assert response.ws_url == ws_url


class TestInvocationResponse:
    """Tests for InvocationResponse internal model."""

    def test_valid_invocation(self) -> None:
        """Test valid invocation model."""
        invocation_id = uuid4()
        now = datetime.now(UTC)

        invocation = InvocationResponse(
            id=invocation_id,
            prompt="Deploy app to production",
            user_id="user-123",
            session_id="session-001",
            status=InvocationStatus.RUNNING,
            created_at=now,
            updated_at=now,
        )

        assert invocation.id == invocation_id
        assert invocation.prompt == "Deploy app to production"
        assert invocation.user_id == "user-123"
        assert invocation.session_id == "session-001"
        assert invocation.status == InvocationStatus.RUNNING
        assert invocation.started_at is None
        assert invocation.completed_at is None
        assert invocation.context_data == {}
        assert invocation.result is None
        assert invocation.error_message is None

    def test_invocation_with_optional_fields(self) -> None:
        """Test invocation with all optional fields."""
        invocation_id = uuid4()
        now = datetime.now(UTC)

        invocation = InvocationResponse(
            id=invocation_id,
            prompt="Deploy app",
            user_id="user-123",
            session_id="session-001",
            status=InvocationStatus.COMPLETED,
            created_at=now,
            started_at=now,
            completed_at=now,
            updated_at=now,
            context_data={"env": "prod"},
            result={"workflow_id": "wf-123"},
            error_message=None,
            checkpoint_data={"phase": "complete"},
        )

        assert invocation.context_data == {"env": "prod"}
        assert invocation.result == {"workflow_id": "wf-123"}
        assert invocation.checkpoint_data == {"phase": "complete"}


class TestInvocationListResponse:
    """Tests for InvocationListResponse model."""

    def test_empty_list(self) -> None:
        """Test list response with no invocations."""
        response = InvocationListResponse(
            invocations=[],
            total=0,
        )

        assert response.invocations == []
        assert response.total == 0

    def test_list_with_invocations(self) -> None:
        """Test list response with invocations."""
        invocation_1 = InvokeResponse(
            id=uuid4(),
            status=InvocationStatus.RUNNING,
            created_at=datetime.now(UTC),
        )
        invocation_2 = InvokeResponse(
            id=uuid4(),
            status=InvocationStatus.COMPLETED,
            created_at=datetime.now(UTC),
        )

        response = InvocationListResponse(
            invocations=[invocation_1, invocation_2],
            total=2,
        )

        assert len(response.invocations) == 2
        assert response.total == 2


class TestInvocationStatus:
    """Tests for InvocationStatus enum."""

    def test_all_status_values(self) -> None:
        """Test all valid status values."""
        assert InvocationStatus.RUNNING.value == "running"
        assert InvocationStatus.PAUSED.value == "paused"
        assert InvocationStatus.CANCELLED.value == "cancelled"
        assert InvocationStatus.COMPLETED.value == "completed"
        assert InvocationStatus.FAILED.value == "failed"

    def test_status_from_string(self) -> None:
        """Test creating status from string."""
        status = InvocationStatus("running")
        assert status == InvocationStatus.RUNNING
