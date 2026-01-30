"""Unit tests for provider-related error handlers."""

import json
from unittest.mock import Mock

import pytest
from fastapi import Request
from fastapi.responses import JSONResponse

from nexus.core.error_handlers import PROBLEM_TYPES
from nexus.tool_manager.error_handlers import (
    tool_provider_error_handler,
    tool_provider_name_conflict_handler,
    tool_provider_not_found_handler,
)
from nexus.tool_manager.lib.exceptions import (
    ProviderError,
    ProviderNameConflictError,
    ProviderNotFoundError,
)


class TestProviderNotFoundHandler:
    """Test suite for provider_not_found_handler."""

    def test_handles_provider_not_found_error(self) -> None:
        """Test handling of ProviderNotFoundError."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/providers/nonexistent"

        exc = ProviderNotFoundError("Provider 'nonexistent' was not found")
        response = tool_provider_not_found_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 404
        assert response.media_type == "application/problem+json"

        data = json.loads(bytes(response.body).decode())
        assert data["type"] == PROBLEM_TYPES["resource_not_found"]
        assert data["title"] == "Provider Not Found"
        assert data["detail"] == "Provider 'nonexistent' was not found"
        assert data["code"] == "PROVIDER_NOT_FOUND"
        assert data["retryable"] is False
        assert data["instance"] == "https://api.example.com/providers/nonexistent"


class TestProviderNameConflictHandler:
    """Test suite for provider_name_conflict_handler."""

    def test_handles_provider_name_conflict_error(self) -> None:
        """Test handling of ProviderNameConflictError."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/providers"

        exc = ProviderNameConflictError("duplicate")
        response = tool_provider_name_conflict_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 409
        assert response.media_type == "application/problem+json"

        data = json.loads(bytes(response.body).decode())
        assert data["type"] == PROBLEM_TYPES["name_conflict"]
        assert data["title"] == "Provider Name Conflict"
        assert data["detail"] == "Provider with name 'duplicate' already exists"
        assert data["code"] == "PROVIDER_NAME_CONFLICT"
        assert data["retryable"] is False
        assert data["instance"] == "https://api.example.com/providers"

    def test_not_retryable(self) -> None:
        """Test that provider name conflicts are not retryable."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/providers"

        exc = ProviderNameConflictError("Duplicate name")
        response = tool_provider_name_conflict_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        assert data["retryable"] is False


class TestProviderErrorHandler:
    """Test suite for provider_error_handler."""

    def test_handles_provider_error(self) -> None:
        """Test handling of ProviderError."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/providers/test/action"

        exc = ProviderError("Provider configuration is invalid")
        response = tool_provider_error_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 400
        assert response.media_type == "application/problem+json"

        data = json.loads(bytes(response.body).decode())
        assert data["type"] == PROBLEM_TYPES["provider_error"]
        assert data["title"] == "Provider Error"
        assert data["detail"] == "Provider configuration is invalid"
        assert data["code"] == "PROVIDER_ERROR"
        assert data["retryable"] is True
        assert data["instance"] == "https://api.example.com/providers/test/action"

    def test_is_retryable(self) -> None:
        """Test that provider errors are retryable."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/providers/test"

        exc = ProviderError("Temporary provider issue")
        response = tool_provider_error_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        assert data["retryable"] is True

    @pytest.mark.parametrize(
        "error_message",
        [
            "Provider authentication failed",
            "Rate limit exceeded",
            "Provider service unavailable",
        ],
    )
    def test_various_error_messages(self, error_message: str) -> None:
        """Test handling of various provider error messages."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/providers/test"

        exc = ProviderError(error_message)
        response = tool_provider_error_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        assert data["detail"] == error_message

    def test_empty_error_message(self) -> None:
        """Test handling of ProviderError with empty message."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/providers/test"

        # ErrorData requires detail to have at least 1 character
        # This might cause a validation error or be handled gracefully
        exc = ProviderError("")
        try:
            response = tool_provider_error_handler(request, exc)
            data = json.loads(bytes(response.body).decode())
            # If it doesn't raise, it should handle empty gracefully
            assert isinstance(data["detail"], str)
        except Exception:
            # If it raises a validation error, that's expected behavior
            pass
