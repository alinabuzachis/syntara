"""Unit tests for approval activity.

Tests approval request creation including:
- Basic approval request creation
- Output mapping
"""

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from nexus.workflows.workflow_engine.activities.approval_activity import (
    execute_approval_activity,
)


@pytest.fixture
def approval_config() -> dict[str, Any]:
    """Basic approval configuration (input_config)."""
    return {
        "description": "Please approve this deployment",
        "timeout": 3600,
    }


@pytest.fixture
def mock_activity_info() -> MagicMock:
    """Fixture providing a mock activity info."""
    mock_info = MagicMock()
    mock_info.activity_id = "review_deployment"
    return mock_info


def assert_valid_approval_metadata(output: dict[str, Any]) -> None:
    """Helper to verify basic approval metadata structure in V2 output."""
    assert "approval_id" in output
    assert output["approval_id"].startswith("apr_")
    assert output["approval_status"] == "pending"


@pytest.mark.asyncio
async def test_create_approval_request_basic(
    approval_config: dict[str, Any],
    mock_activity_info: MagicMock,
) -> None:
    """Test basic approval request creation."""
    with patch(
        "nexus.workflows.workflow_engine.activities.approval_activity.activity.info",
        return_value=mock_activity_info,
    ):
        result = await execute_approval_activity(approval_config, None)

    # V2 wraps in {"output": {...}}
    output = result["output"]
    assert_valid_approval_metadata(output)
    assert output["description"] == "Please approve this deployment"
    assert output["timeout"] == 3600
    assert output["status"] == "completed"


@pytest.mark.asyncio
async def test_create_approval_request_minimal_config(
    mock_activity_info: MagicMock,
) -> None:
    """Test approval request with minimal configuration."""
    minimal_config: dict[str, Any] = {
        "description": "Simple approval",
        "timeout": None,
    }

    with patch(
        "nexus.workflows.workflow_engine.activities.approval_activity.activity.info",
        return_value=mock_activity_info,
    ):
        result = await execute_approval_activity(minimal_config, None)

    output = result["output"]
    assert_valid_approval_metadata(output)
    assert output["description"] == "Simple approval"
    assert output["timeout"] is None


@pytest.mark.asyncio
async def test_create_approval_request_with_output_mapping(
    approval_config: dict[str, Any],
    mock_activity_info: MagicMock,
) -> None:
    """Test approval request with output mapping."""
    output_config = {
        "id": "${result.approval_id}",
        "state": "${result.approval_status}",
    }

    with patch(
        "nexus.workflows.workflow_engine.activities.approval_activity.activity.info",
        return_value=mock_activity_info,
    ):
        result = await execute_approval_activity(approval_config, output_config)

    # Output mapping should have been applied
    output = result["output"]
    assert output["id"].startswith("apr_")
    assert output["state"] == "pending"
    assert output["status"] == "completed"


@pytest.mark.asyncio
async def test_create_approval_request_activity_info_error() -> None:
    """Test approval request handles activity.info() error gracefully."""
    config: dict[str, Any] = {
        "description": "Test approval",
        "timeout": 60,
    }

    with patch(
        "nexus.workflows.workflow_engine.activities.approval_activity.activity.info",
        side_effect=RuntimeError("Not in activity context"),
    ):
        result = await execute_approval_activity(config, None)

    # Should still succeed with "unknown" activity_id
    output = result["output"]
    assert_valid_approval_metadata(output)
    assert output["status"] == "completed"
