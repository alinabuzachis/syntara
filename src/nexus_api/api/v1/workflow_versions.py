"""Workflow version API endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from nexus_api.db import get_db
from nexus_api.models import Workflow, WorkflowVersion
from nexus_api.schemas import (
    WorkflowVersionListResponse,
    WorkflowVersionResponse,
)

router = APIRouter(prefix="/workflows", tags=["workflow-versions"])


# NOTE: WorkflowVersion entities are READ-ONLY and system-managed.
# Versions are created automatically via PATCH /workflows/{id} with yaml_definition.
# No POST endpoint for manual version creation - this ensures version integrity.


@router.get("/{workflow_id}/versions")
async def list_workflow_versions(
    workflow_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkflowVersionListResponse:
    """List all versions for a workflow.

    Args:
        workflow_id: Workflow UUID
        db: Database session

    Returns:
        List of versions ordered by version DESC

    Raises:
        HTTPException: 404 if workflow not found

    """
    # Verify workflow exists
    workflow_result = await db.execute(
        select(Workflow).filter(Workflow.id == workflow_id, Workflow.deleted_at.is_(None))
    )
    workflow = workflow_result.scalar_one_or_none()

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )

    # Get versions
    result = await db.execute(
        select(WorkflowVersion)
        .filter(
            WorkflowVersion.workflow_id == workflow_id,
            WorkflowVersion.deleted_at.is_(None),
        )
        .order_by(WorkflowVersion.version.desc())
    )
    versions = list(result.scalars().all())

    # Return ORM objects - FastAPI auto-converts to WorkflowVersionResponse list
    # Pydantic's from_attributes=True handles ORM → Pydantic conversion
    return WorkflowVersionListResponse(versions=versions)  # type: ignore[arg-type]


@router.get("/{workflow_id}/versions/{version}")
async def get_workflow_version(
    workflow_id: UUID,
    version: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkflowVersionResponse:
    """Get a specific workflow version.

    Args:
        workflow_id: Workflow UUID
        version: Version number
        db: Database session

    Returns:
        Workflow version

    Raises:
        HTTPException: 404 if workflow or version not found

    """
    # Verify workflow exists
    workflow_result = await db.execute(
        select(Workflow).filter(Workflow.id == workflow_id, Workflow.deleted_at.is_(None))
    )
    workflow = workflow_result.scalar_one_or_none()

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )

    # Get version
    result = await db.execute(
        select(WorkflowVersion).filter(
            WorkflowVersion.workflow_id == workflow_id,
            WorkflowVersion.version == version,
            WorkflowVersion.deleted_at.is_(None),
        )
    )
    workflow_version = result.scalar_one_or_none()

    if not workflow_version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Version {version} not found for this workflow",
        )

    # Return ORM object - FastAPI auto-converts to WorkflowVersionResponse
    # Pydantic's from_attributes=True handles ORM → Pydantic conversion
    return workflow_version  # type: ignore[return-value]
