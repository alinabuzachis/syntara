"""Unit tests for audit error handlers."""

import json
from unittest.mock import Mock

from fastapi import Request
from fastapi.responses import JSONResponse

from nexus.audit.error_handlers import export_not_found_handler
from nexus.audit.exceptions import AuditExportNotFoundError
from nexus.core.error_handlers import PROBLEM_TYPES


class TestExportNotFoundHandler:
    """Test suite for export_not_found_handler."""

    def test_handles_export_not_found_error(self) -> None:
        """Test handling of AuditExportNotFoundError."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/api/v1/audit/exports/abc123/download"

        export_id = "abc123"
        exc = AuditExportNotFoundError(export_id)
        response = export_not_found_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 404
        assert response.media_type == "application/problem+json"

        data = json.loads(bytes(response.body).decode())
        assert data["type"] == PROBLEM_TYPES["resource_not_found"]
        assert data["title"] == "Export Not Found"
        assert data["detail"] == "Audit export abc123 not found."
        assert data["code"] == "EXPORT_NOT_FOUND"
        assert data["retryable"] is False
        assert data["instance"] == "https://api.example.com/api/v1/audit/exports/abc123/download"
