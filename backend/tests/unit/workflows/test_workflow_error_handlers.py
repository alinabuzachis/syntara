"""Unit tests for workflow-related error handlers."""

import json
from unittest.mock import Mock
from uuid import uuid4

from fastapi import Request
from fastapi.responses import JSONResponse

from nexus.core.error_handlers import PROBLEM_TYPES
from nexus.workflows.error_handlers import (
    definition_invalid_handler,
    execution_not_found_handler,
    workflow_name_conflict_handler,
    workflow_not_found_handler,
    workflow_not_published_handler,
    workflow_version_not_found_handler,
)
from nexus.workflows.exceptions import (
    ExecutionNotFoundError,
    WorkflowDefinitionInvalidError,
    WorkflowNameConflictError,
    WorkflowNotFoundError,
    WorkflowNotPublishedError,
    WorkflowVersionNotFoundError,
)
from nexus.workflows.models.validation_finding import (
    ValidationCategory,
    ValidationFinding,
    ValidationResult,
    ValidationSeverity,
)
from nexus.workflows.models.workflow_validation_result import (
    ValidationIssue,
    WorkflowValidationResult,
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
        assert data["detail"] == "A workflow with this name already exists in this project"
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
        assert data["detail"] == "A workflow with this name already exists in this project"

    def test_not_retryable(self) -> None:
        """Test that workflow name conflicts are not retryable."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows"

        exc = WorkflowNameConflictError("conflict-workflow")
        response = workflow_name_conflict_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        assert data["retryable"] is False


class TestWorkflowNotPublishedHandler:
    """Test suite for workflow_not_published_handler."""

    def test_handles_workflow_not_published_error(self) -> None:
        """Test handling of workflow not published errors."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows/test/execute"

        exc = WorkflowNotPublishedError(uuid4())
        response = workflow_not_published_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 400
        assert response.media_type == "application/problem+json"

        data = json.loads(bytes(response.body).decode())
        assert data["type"] == PROBLEM_TYPES["resource_not_published"]
        assert data["title"] == "Workflow Not Published"
        assert data["detail"] == "The requested workflow has no published version"
        assert data["code"] == "WORKFLOW_NOT_PUBLISHED"
        assert data["retryable"] is False

    def test_not_retryable(self) -> None:
        """Test that workflow not published errors are not retryable."""
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows/test/execute"

        exc = WorkflowNotPublishedError(uuid4())
        response = workflow_not_published_handler(request, exc)

        data = json.loads(bytes(response.body).decode())
        assert data["retryable"] is False


class TestDefinitionInvalidHandler:
    """Test suite for definition_invalid_handler branching."""

    def test_legacy_response_when_no_validation_result(self) -> None:
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows/validate"

        legacy_result = WorkflowValidationResult(
            valid=False,
            errors=[ValidationIssue(message="bad node")],
        )
        exc = WorkflowDefinitionInvalidError(legacy_result)
        response = definition_invalid_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 422

        data = json.loads(bytes(response.body).decode())
        vr = data["validation_result"]
        assert vr["valid"] is False
        assert len(vr["errors"]) == 1
        assert "findings" not in vr

    def test_detailed_response_when_validation_result_present(self) -> None:
        request = Mock(spec=Request)
        request.url = "https://api.example.com/workflows/validate/detailed"

        legacy_result = WorkflowValidationResult(
            valid=False,
            errors=[ValidationIssue(message="bad node")],
        )
        findings = [
            ValidationFinding(
                severity=ValidationSeverity.error,
                category=ValidationCategory.schema_violation,
                message="bad node",
                node_id="n1",
            ),
        ]
        detailed_result = ValidationResult.from_findings(findings)
        exc = WorkflowDefinitionInvalidError(legacy_result, validation_result=detailed_result)
        response = definition_invalid_handler(request, exc)

        assert isinstance(response, JSONResponse)
        assert response.status_code == 422

        data = json.loads(bytes(response.body).decode())
        vr = data["validation_result"]
        assert vr["is_valid"] is False
        assert vr["error_count"] == 1
        assert len(vr["findings"]) == 1
        assert vr["findings"][0]["node_id"] == "n1"
