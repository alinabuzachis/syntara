"""Unit tests for scheduled trigger error handlers."""

import json
from unittest.mock import Mock

from fastapi import Request
from fastapi.responses import JSONResponse

from nexus.core.error_handlers import PROBLEM_TYPES
from nexus.workflows.error_handlers import scheduled_trigger_sync_handler
from nexus.workflows.exceptions import ScheduledTriggerSyncError


class TestScheduledTriggerSyncHandler:
    """Test suite for scheduled_trigger_sync_handler."""

    def test_returns_503_with_problem_details(self) -> None:
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows/wf-123/versions/1/publish"

        exc = ScheduledTriggerSyncError("wf-123", 2)
        response = scheduled_trigger_sync_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 503
        assert response.media_type == "application/problem+json"

        data = json.loads(bytes(response.body).decode())
        assert data["type"] == PROBLEM_TYPES["service_unavailable"]
        assert data["title"] == "Scheduled Trigger Sync Failed"
        assert data["code"] == "SCHEDULED_TRIGGER_SYNC_FAILED"
        assert data["retryable"] is True
        assert data["instance"] == "https://api.example.com/workflows/wf-123/versions/1/publish"
