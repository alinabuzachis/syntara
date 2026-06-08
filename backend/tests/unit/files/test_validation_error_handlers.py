"""Unit tests for validation error handlers."""

import json
from unittest.mock import Mock

from fastapi import Request
from fastapi.responses import JSONResponse

from nexus.core.error_handlers import PROBLEM_TYPES
from nexus.files.error_handlers import file_validation_error_handler
from nexus.files.exceptions import FileValidationError


class TestFileValidationErrorHandler:
    """Test suite for file_validation_error_handler."""

    def test_handles_file_validation_error(self) -> None:
        """Test handling of FileValidationError."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/files/upload"

        exc = FileValidationError("File format not supported")
        response = file_validation_error_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 400
        assert response.media_type == "application/problem+json"

        data = json.loads(bytes(response.body).decode())
        assert data["type"] == PROBLEM_TYPES["validation_error"]
        assert data["title"] == "File Validation Error"
        assert data["detail"] == "File format not supported"
        assert data["code"] == "FILE_VALIDATION_ERROR"
        assert data["retryable"] is False
        assert data["instance"] == "https://api.example.com/files/upload"

    def test_not_retryable(self) -> None:
        """Test that file validation errors are not retryable."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/files/test"

        exc = FileValidationError("Invalid file")
        response = file_validation_error_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        assert data["retryable"] is False
