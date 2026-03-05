"""Unit tests for approval activity.

Tests approval request creation including:
- Basic approval request creation
- Callback URL generation
- Workflow context handling
- Correlation ID generation
"""

from collections.abc import Callable
from typing import Any
from unittest.mock import MagicMock, patch
from uuid import UUID

import pytest

from nexus.core.exceptions import SafeValueError
from nexus.workflows.workflow_engine.activities.approval_activity import (
    create_approval_request_activity,
)


@pytest.fixture
def approval_config() -> dict[str, Any]:
    """Basic approval configuration."""
    return {
        "description": "Please approve this deployment",
        "timeout": 3600,
    }


@pytest.fixture
def workflow_context() -> dict[str, Any]:
    """Basic workflow context."""
    return {
        "workflow_inputs": {"environment": "production"},
        "previous_step": {"status": "prepared"},
        "execution_id": "123e4567-e89b-12d3-a456-426614174000",
        "workflow_name": "test-workflow",
    }


@pytest.fixture
def mock_activity_info() -> Callable[[str], MagicMock]:
    """Fixture providing a mock activity info."""

    def _mock_activity_info(activity_id: str = "review_deployment") -> MagicMock:
        mock_info = MagicMock()
        mock_info.activity_id = activity_id
        return mock_info

    return _mock_activity_info


def assert_valid_approval_metadata(result: dict[str, Any]) -> None:
    """Helper to verify basic approval metadata structure."""
    assert "approval_id" in result
    assert result["approval_id"].startswith("apr_")
    assert result["status"] == "pending"
    assert "correlation_id" in result


@pytest.mark.asyncio
async def test_create_approval_request_basic(
    approval_config: dict[str, Any],
    workflow_context: dict[str, Any],
    mock_activity_info,
) -> None:
    """Test basic approval request creation."""
    with patch(
        "nexus.workflows.workflow_engine.activities.approval_activity.activity.info",
        return_value=mock_activity_info(),
    ):
        result = await create_approval_request_activity(approval_config, workflow_context)

    # Verify result structure
    assert_valid_approval_metadata(result)
    assert result["description"] == "Please approve this deployment"
    assert result["timeout"] == 3600
    assert result["workflow_context"] == workflow_context


@pytest.mark.asyncio
async def test_create_approval_request_with_callback_url(
    approval_config: dict[str, Any],
    workflow_context: dict[str, Any],
    mock_activity_info,
) -> None:
    """Test approval request with callback URL generation."""
    with (
        patch(
            "nexus.workflows.workflow_engine.activities.approval_activity.activity.info",
            return_value=mock_activity_info(),
        ),
        patch(
            "nexus.workflows.workflow_engine.activities.approval_activity.generate_activity_signal_url"
        ) as mock_generate_url,
    ):
        mock_generate_url.return_value = (
            "http://localhost:8000/api/v1/executions/123/activities/review_deployment/signal"
        )

        result = await create_approval_request_activity(approval_config, workflow_context)

    # Verify callback URL was generated
    assert result["callback_url"] == "http://localhost:8000/api/v1/executions/123/activities/review_deployment/signal"
    mock_generate_url.assert_called_once_with(UUID("123e4567-e89b-12d3-a456-426614174000"), "review_deployment")


@pytest.mark.parametrize(
    ("context_overrides", "expected_callback_url"),
    [
        # Missing execution_id
        ({"execution_id": None}, None),
        # Empty string execution_id
        ({"execution_id": ""}, None),
    ],
)
@pytest.mark.asyncio
async def test_create_approval_request_missing_context(
    approval_config: dict[str, Any],
    workflow_context: dict[str, Any],
    mock_activity_info,
    context_overrides: dict[str, Any],
    expected_callback_url: str | None,
) -> None:
    """Test approval request creation with missing context data."""
    workflow_context.update(context_overrides)

    with patch(
        "nexus.workflows.workflow_engine.activities.approval_activity.activity.info",
        return_value=mock_activity_info(),
    ):
        result = await create_approval_request_activity(approval_config, workflow_context)

    # Verify no callback URL when required context is missing
    assert result["callback_url"] == expected_callback_url


@pytest.mark.parametrize(
    ("error_type", "error_message", "expected_callback_check"),
    [
        # activity.info() raises RuntimeError
        (RuntimeError, "Not in activity context", lambda url: "unknown" in url),
        # URL generation fails
        (SafeValueError, "Invalid execution ID", lambda url: url is None),
    ],
)
@pytest.mark.asyncio
async def test_create_approval_request_error_handling(
    approval_config: dict[str, Any],
    workflow_context: dict[str, Any],
    mock_activity_info,
    error_type: type[Exception],
    error_message: str,
    expected_callback_check,
) -> None:
    """Test approval request handles errors gracefully."""
    if error_type is RuntimeError:
        # Patch activity.info() to raise error
        with patch(
            "nexus.workflows.workflow_engine.activities.approval_activity.activity.info",
            side_effect=error_type(error_message),
        ):
            result = await create_approval_request_activity(approval_config, workflow_context)
    else:
        # Patch URL generation to raise error
        with (
            patch(
                "nexus.workflows.workflow_engine.activities.approval_activity.activity.info",
                return_value=mock_activity_info(),
            ),
            patch(
                "nexus.workflows.workflow_engine.activities.approval_activity.generate_activity_signal_url",
                side_effect=error_type(error_message),
            ),
        ):
            result = await create_approval_request_activity(approval_config, workflow_context)

    # Should still succeed with valid metadata
    assert_valid_approval_metadata(result)
    assert expected_callback_check(result["callback_url"])


@pytest.mark.asyncio
async def test_create_approval_request_minimal_config(
    workflow_context: dict[str, Any],
    mock_activity_info,
) -> None:
    """Test approval request with minimal configuration."""
    minimal_config = {
        "description": "Simple approval",
        "timeout": None,
    }

    with patch(
        "nexus.workflows.workflow_engine.activities.approval_activity.activity.info",
        return_value=mock_activity_info("simple_approval"),
    ):
        result = await create_approval_request_activity(minimal_config, workflow_context)

    assert_valid_approval_metadata(result)
    assert result["description"] == "Simple approval"
    assert result["timeout"] is None
