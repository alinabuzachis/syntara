"""Unit tests for webhook trigger error handlers."""

import json
from unittest.mock import Mock

from fastapi import Request
from fastapi.responses import JSONResponse

from nexus.core.error_handlers import PROBLEM_TYPES
from nexus.workflows.error_handlers import (
    trigger_validation_handler,
    webhook_trigger_not_found_handler,
    webhook_trigger_path_conflict_handler,
)
from nexus.workflows.exceptions import (
    TriggerValidationError,
    WebhookTriggerNotFoundError,
    WebhookTriggerPathConflictError,
)


class TestWebhookTriggerNotFoundHandler:
    """Test suite for webhook_trigger_not_found_handler."""

    def test_returns_404_with_problem_json(self) -> None:
        """Test that handler returns 404 with RFC 9457 format."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/webhooks/my-hook"

        exc = WebhookTriggerNotFoundError("my-hook", "webhook_trigger")
        response = webhook_trigger_not_found_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 404
        assert response.media_type == "application/problem+json"

        data = json.loads(bytes(response.body).decode())
        assert data["type"] == PROBLEM_TYPES["resource_not_found"]
        assert data["title"] == "Webhook Trigger Not Found"
        assert data["detail"] == "No webhook trigger is configured for the requested path"
        assert data["code"] == "WEBHOOK_TRIGGER_NOT_FOUND"
        assert data["retryable"] is False
        assert data["instance"] == "https://api.example.com/webhooks/my-hook"

    def test_does_not_expose_webhook_path_in_detail(self) -> None:
        """Test that the webhook path is not leaked into the detail message."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/webhooks/secret-path"

        exc = WebhookTriggerNotFoundError("secret-path", "webhook_trigger")
        response = webhook_trigger_not_found_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        assert "secret-path" not in data["detail"]

    def test_not_retryable(self) -> None:
        """Test that webhook trigger not found errors are not retryable."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/webhooks/test"

        exc = WebhookTriggerNotFoundError("test", "webhook_trigger")
        response = webhook_trigger_not_found_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        assert data["retryable"] is False


class TestWebhookTriggerPathConflictHandler:
    """Test suite for webhook_trigger_path_conflict_handler."""

    def test_returns_409_with_problem_json(self) -> None:
        """Test that handler returns 409 for path conflicts."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows"

        exc = WebhookTriggerPathConflictError("github-events")
        response = webhook_trigger_path_conflict_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 409
        assert response.media_type == "application/problem+json"

        data = json.loads(bytes(response.body).decode())
        assert data["type"] == PROBLEM_TYPES["name_conflict"]
        assert data["title"] == "Webhook Path Conflict"
        assert data["detail"] == "The requested webhook path is already in use by another trigger"
        assert data["code"] == "WEBHOOK_TRIGGER_PATH_CONFLICT"
        assert data["retryable"] is False

    def test_does_not_expose_conflicting_path(self) -> None:
        """Test that the conflicting path is not leaked into the detail message."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows"

        exc = WebhookTriggerPathConflictError("my-secret-path")
        response = webhook_trigger_path_conflict_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        assert "my-secret-path" not in data["detail"]

    def test_not_retryable(self) -> None:
        """Test that path conflict errors are not retryable."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows"

        exc = WebhookTriggerPathConflictError("test")
        response = webhook_trigger_path_conflict_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        assert data["retryable"] is False


class TestTriggerValidationHandler:
    """Test suite for trigger_validation_handler."""

    def test_returns_422_with_problem_json(self) -> None:
        """Test that handler returns 422 for validation errors."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/webhooks/my-hook"

        exc = TriggerValidationError("'required_field' is a required property")
        response = trigger_validation_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 422
        assert response.media_type == "application/problem+json"

        data = json.loads(bytes(response.body).decode())
        assert data["type"] == PROBLEM_TYPES["validation_error"]
        assert data["title"] == "Trigger Payload Validation Failed"
        assert data["code"] == "TRIGGER_VALIDATION_ERROR"
        assert data["retryable"] is False

    def test_includes_exception_message_in_detail(self) -> None:
        """Test that the validation error message is passed through to detail."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/webhooks/test"

        msg = "Webhook payload validation failed: 'name' is a required property"
        exc = TriggerValidationError(msg)
        response = trigger_validation_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        assert data["detail"] == msg

    def test_not_retryable(self) -> None:
        """Test that validation errors are not retryable."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/webhooks/test"

        exc = TriggerValidationError("bad payload")
        response = trigger_validation_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        assert data["retryable"] is False
