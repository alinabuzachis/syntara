"""Shared utilities for API v1 endpoints."""

from collections.abc import AsyncGenerator, Callable
from typing import Any, cast

from fastapi import Request
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.database.session import get_db
from nexus.workflows.models import WorkflowVersion


def create_session_factory_from_request(request: Request) -> Callable[[], AsyncGenerator[AsyncSession, None]]:
    """Create a session factory that respects FastAPI's dependency injection overrides.

    This function creates a session factory that checks for dependency overrides
    in the FastAPI app instance, allowing tests to inject mock database sessions.

    Args:
        request: FastAPI request object (contains app with dependency overrides)

    Returns:
        Session factory function that creates database sessions

    """
    # Access the FastAPI app instance from the request to get dependency overrides
    app = request.app
    dependency_overrides = getattr(app, "dependency_overrides", {})

    # Use the overridden dependency if it exists, otherwise use the default
    return cast("Callable[[], AsyncGenerator[AsyncSession, None]]", dependency_overrides.get(get_db, get_db))


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
