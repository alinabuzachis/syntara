"""Unit tests for validation error handlers."""

import json
from unittest.mock import Mock

from fastapi import Request
from fastapi.responses import JSONResponse

from nexus.core.error_handlers import PROBLEM_TYPES
from nexus.tool_manager.error_handlers import tool_validation_error_handler
from nexus.tool_manager.lib.exceptions import ValidationError as ToolValidationError


class TestToolValidationErrorHandler:
    """Test suite for tool_validation_error_handler."""

    def test_handles_tool_validation_error(self) -> None:
        """Test handling of ToolValidationError."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/tools/validate"

        exc = ToolValidationError("Tool configuration is invalid")
        response = tool_validation_error_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 422
        assert response.media_type == "application/problem+json"

        data = json.loads(bytes(response.body).decode())
        assert data["type"] == PROBLEM_TYPES["validation_error"]
        assert data["title"] == "Tool Validation Error"
        assert data["detail"] == "Tool configuration is invalid"
        assert data["code"] == "TOOL_VALIDATION_ERROR"
        assert data["retryable"] is False
