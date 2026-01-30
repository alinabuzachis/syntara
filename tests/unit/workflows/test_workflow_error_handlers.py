"""Unit tests for workflow-related error handlers."""

import json
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi import Request
from fastapi.responses import JSONResponse

from nexus.core.error_handlers import PROBLEM_TYPES
from nexus.workflows.error_handlers import (
    execution_not_found_handler,
    workflow_disabled_handler,
    workflow_name_conflict_handler,
    workflow_not_found_handler,
    workflow_version_not_found_handler,
)
from nexus.workflows.exceptions import (
    ExecutionNotFoundError,
    WorkflowDisabledError,
    WorkflowNameConflictError,
    WorkflowNotFoundError,
    WorkflowVersionNotFoundError,
)


class TestWorkflowNotFoundHandler:
    """Test suite for workflow_not_found_handler."""

    def test_handles_workflow_not_found_error(self) -> None:
        """Test handling of workflow not found errors."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows/nonexistent"

        exc = WorkflowNotFoundError(uuid4())
        response = workflow_not_found_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 404
        assert response.media_type == "application/problem+json"

        data = json.loads(bytes(response.body).decode())
        assert data["type"] == PROBLEM_TYPES["resource_not_found"]
        assert data["title"] == "Workflow Not Found"
        assert data["detail"] == "The requested workflow was not found"
        assert data["code"] == "WORKFLOW_NOT_FOUND"
        assert data["retryable"] is False
        assert data["instance"] == "https://api.example.com/workflows/nonexistent"

    def test_does_not_expose_workflow_ids(self) -> None:
        """Test that workflow IDs are not exposed in error details."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows/secret-id-123"

        exc = WorkflowNotFoundError(uuid4())
        response = workflow_not_found_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        # Should not contain the actual workflow ID from the exception
        assert "secret-id-123" not in data["detail"]
        assert data["detail"] == "The requested workflow was not found"

    def test_not_retryable(self) -> None:
        """Test that workflow not found errors are not retryable."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows/test"

        exc = WorkflowNotFoundError(uuid4())
        response = workflow_not_found_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        assert data["retryable"] is False


class TestExecutionNotFoundHandler:
    """Test suite for execution_not_found_handler."""

    def test_handles_execution_not_found_error(self) -> None:
        """Test handling of execution not found errors."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/executions/nonexistent"

        exc = ExecutionNotFoundError(uuid4())
        response = execution_not_found_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 404

        data = json.loads(bytes(response.body).decode())
        assert data["type"] == PROBLEM_TYPES["resource_not_found"]
        assert data["title"] == "Execution Not Found"
        assert data["detail"] == "The requested execution was not found"
        assert data["code"] == "EXECUTION_NOT_FOUND"
        assert data["retryable"] is False

    def test_does_not_expose_execution_ids(self) -> None:
        """Test that execution IDs are not exposed in error details."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/executions/secret-exec-456"

        exc = ExecutionNotFoundError(uuid4())
        response = execution_not_found_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        assert "secret-exec-456" not in data["detail"]
        assert data["detail"] == "The requested execution was not found"


class TestWorkflowVersionNotFoundHandler:
    """Test suite for workflow_version_not_found_handler."""

    def test_handles_workflow_version_not_found_error(self) -> None:
        """Test handling of workflow version not found errors."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows/123/versions/v2"

        exc = WorkflowVersionNotFoundError(uuid4(), 1)
        response = workflow_version_not_found_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 404

        data = json.loads(bytes(response.body).decode())
        assert data["type"] == PROBLEM_TYPES["resource_not_found"]
        assert data["title"] == "Workflow Version Not Found"
        assert data["detail"] == "The requested workflow version was not found"
        assert data["code"] == "WORKFLOW_VERSION_NOT_FOUND"
        assert data["retryable"] is False

    def test_does_not_expose_workflow_ids(self) -> None:
        """Test that workflow IDs are not exposed in error details."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows/secret/versions/1"

        exc = WorkflowVersionNotFoundError(uuid4(), 1)
        response = workflow_version_not_found_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        assert "secret" not in data["detail"]


class TestWorkflowNameConflictHandler:
    """Test suite for workflow_name_conflict_handler."""

    def test_handles_workflow_name_conflict_error(self) -> None:
        """Test handling of workflow name conflict errors."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows"

        exc = WorkflowNameConflictError("test-workflow")
        response = workflow_name_conflict_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 409

        data = json.loads(bytes(response.body).decode())
        assert data["type"] == PROBLEM_TYPES["name_conflict"]
        assert data["title"] == "Workflow Name Conflict"
        assert data["detail"] == "A workflow with this name already exists"
        assert data["code"] == "WORKFLOW_NAME_CONFLICT"
        assert data["retryable"] is False

    def test_ignores_exception_parameter(self) -> None:
        """Test that the exception parameter is ignored (marked with underscore)."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows"

        # The handler ignores the exception parameter, so any exception should work
        exc = WorkflowNameConflictError("test-workflow")
        response = workflow_name_conflict_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        # Should use the hardcoded message, not the exception message
        assert data["detail"] == "A workflow with this name already exists"

    def test_not_retryable(self) -> None:
        """Test that workflow name conflicts are not retryable."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows"

        exc = WorkflowNameConflictError("conflict-workflow")
        response = workflow_name_conflict_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        assert data["retryable"] is False


class TestWorkflowDisabledHandler:
    """Test suite for workflow_disabled_handler."""

    def test_handles_workflow_disabled_error(self) -> None:
        """Test handling of workflow disabled errors."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows/disabled-workflow/execute"

        exc = WorkflowDisabledError(uuid4())
        response = workflow_disabled_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 400

        data = json.loads(bytes(response.body).decode())
        assert data["type"] == PROBLEM_TYPES["resource_disabled"]
        assert data["title"] == "Workflow Disabled"
        assert data["detail"] == "The requested workflow is currently disabled"
        assert data["code"] == "WORKFLOW_DISABLED"
        assert data["retryable"] is False

    def test_does_not_expose_workflow_ids(self) -> None:
        """Test that workflow IDs are not exposed in error details."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows/secret-workflow/execute"

        exc = WorkflowDisabledError(uuid4())
        response = workflow_disabled_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        # Should not contain the actual workflow ID from the exception
        assert "secret-workflow" not in data["detail"]
        assert data["detail"] == "The requested workflow is currently disabled"

    def test_not_retryable(self) -> None:
        """Test that workflow disabled errors are not retryable."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows/test/execute"

        exc = WorkflowDisabledError(uuid4())
        response = workflow_disabled_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        assert data["retryable"] is False

    @pytest.mark.parametrize(
        "url",
        [
            "https://api.example.com/workflows/123/execute",
            "https://api.example.com/workflows/test-workflow/run",
            "http://localhost:8000/api/v1/workflows/disabled/start",
        ],
    )
    def test_various_request_urls(self, url: str) -> None:
        """Test handling of various workflow execution URLs."""
        request = Mock(spec=Request)
        request.url = url

        exc = WorkflowDisabledError(uuid4())
        response = workflow_disabled_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        assert data["instance"] == url
