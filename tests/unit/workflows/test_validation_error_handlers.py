"""Unit tests for validation error handlers."""

import json
from unittest.mock import Mock

from fastapi import Request
from fastapi.responses import JSONResponse

from nexus.core.error_handlers import PROBLEM_TYPES
from nexus.workflows.error_handlers import validation_error_handler
from nexus.workflows.exceptions import WorkflowValidationError


class TestValidationErrorHandler:
    """Test suite for validation_error_handler."""

    def test_handles_validation_error(self) -> None:
        """Test handling of core validation errors."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/validate"

        exc = WorkflowValidationError("Core validation error")
        response = validation_error_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 422

        data = json.loads(bytes(response.body).decode())
        assert data["type"] == PROBLEM_TYPES["validation_error"]
        assert data["title"] == "Validation Error"
        assert data["detail"] == "Core validation error"
        assert data["code"] == "VALIDATION_ERROR"
        assert data["retryable"] is False
