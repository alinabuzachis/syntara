"""Shared utilities for API v1 endpoints."""

from typing import Any

from nexus.workflows.models import WorkflowVersion


def deserialize_workflow_version(version: WorkflowVersion) -> dict[str, Any]:
    """Convert a WorkflowVersion ORM object to a dict for API responses.

    Args:
        version: WorkflowVersion ORM object from database (workflow_definition is already a dict
                 from JSONB column - SQLAlchemy automatically deserializes)

    Returns:
        Dictionary with all version fields including workflow_definition dict

    """
    return {
        "id": version.id,
        "workflow_id": version.workflow_id,
        "version": version.version,
        "schema_version": version.schema_version,
        "workflow_definition": version.workflow_definition,  # Already a dict from JSONB
        "change_description": version.change_description,
        "created_by": version.created_by,
        "created_at": version.created_at,
        "updated_at": version.updated_at,
        "deleted_at": version.deleted_at,
        "deleted_by": version.deleted_by,
    }
