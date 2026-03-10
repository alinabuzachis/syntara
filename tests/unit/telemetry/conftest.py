"""Shared fixtures for telemetry unit tests."""

import pytest

# Common test data constants
VALID_WORKFLOW_EXECUTION_ID = "550e8400-e29b-41d4-a716-446655440000"
VALID_ACTIVITY_HASH = "b" * 64
SAMPLE_ACTIVITY_DEF = {"name": "test-activity", "type": "task"}


@pytest.fixture
def valid_workflow_execution_id() -> str:
    """Return a valid workflow execution ID for telemetry tests."""
    return VALID_WORKFLOW_EXECUTION_ID


@pytest.fixture
def valid_activity_hash() -> str:
    """Return a valid activity hash for telemetry tests."""
    return VALID_ACTIVITY_HASH


@pytest.fixture
def sample_activity_def() -> dict[str, str]:
    """Return a sample activity definition for telemetry tests."""
    return SAMPLE_ACTIVITY_DEF.copy()
