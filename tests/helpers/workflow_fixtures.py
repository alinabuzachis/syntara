"""Test fixtures and helpers for workflow tests."""

from typing import Any


def create_minimal_workflow_definition(
    name: str = "test-workflow",
    description: str = "Test workflow description",
    activity_id: str = "test_activity",
    activity_type: str = "task",
) -> dict[str, Any]:
    """Create a minimal valid workflow definition for testing.

    Returns a dict with camelCase keys matching the WorkflowDefinition schema.
    Useful for creating test workflows with minimal required fields.

    Args:
        name: Workflow name
        description: Workflow description
        activity_id: Activity ID
        activity_type: Activity type (task, parallel, sequence, condition, loop, join)

    Returns:
        Dict with workflow definition structure ready for validation

    """
    # Base workflow structure
    workflow_def: dict[str, Any] = {
        "schemaVersion": "1.0.0",
        "version": 1,
        "metadata": {"name": name, "description": description},
        "triggers": [{"type": "manual"}],
        "workflow": {"activities": []},
    }

    # Add activity based on type
    if activity_type == "task":
        workflow_def["workflow"]["activities"] = [
            {
                "id": activity_id,
                "name": f"Activity {activity_id}",
                "type": "task",
                "task": {
                    "executor": "script",
                    "config": {"language": "python", "code": "print('hello')"},
                },
            }
        ]
    else:
        # For non-task types, create minimal activity
        workflow_def["workflow"]["activities"] = [
            {
                "id": activity_id,
                "name": f"Activity {activity_id}",
                "type": activity_type,
            }
        ]

    return workflow_def


def create_workflow_definition_with_activities(
    name: str,
    description: str,
    activities: list[dict[str, object]],
) -> dict[str, Any]:
    """Create a workflow definition with custom activities as dict.

    Args:
        name: Workflow name
        description: Workflow description
        activities: List of activity definitions

    Returns:
        Dict matching WorkflowDefinition schema

    """
    return {
        "schemaVersion": "1.0.0",
        "version": 1,
        "metadata": {"name": name, "description": description},
        "triggers": [{"type": "manual"}],
        "workflow": {"activities": activities},
    }
