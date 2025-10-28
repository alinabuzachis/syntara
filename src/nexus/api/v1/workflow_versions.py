"""Workflow version API endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from nexus.api.db import get_db
from nexus.api.v1.utils import deserialize_workflow_version
from nexus.workflows.models import Workflow
from nexus.workflows.models.workflow_version import (
    WorkflowVersion,
    WorkflowVersionListResponse,
    WorkflowVersionRead,
)

router = APIRouter(prefix="/workflows", tags=["workflow-versions"])


# NOTE: WorkflowVersion entities are READ-ONLY and system-managed.
# Versions are created automatically via PATCH /workflows/{id} with workflow_definition.
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
        select(Workflow).filter(Workflow.id == workflow_id, Workflow.deleted_at.is_(None))  # type: ignore[arg-type,union-attr]
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
            WorkflowVersion.workflow_id == workflow_id,  # type: ignore[arg-type]
            WorkflowVersion.deleted_at.is_(None),  # type: ignore[union-attr]
        )
        .order_by(WorkflowVersion.version.desc())  # type: ignore[attr-defined]
    )
    versions = list(result.scalars().all())

    # Deserialize workflow_definition from JSON strings to dicts
    version_dicts = [deserialize_workflow_version(v) for v in versions]

    # Manually construct response with deserialized versions
    return WorkflowVersionListResponse(versions=[WorkflowVersionRead.model_validate(v) for v in version_dicts])


@router.get("/{workflow_id}/versions/{version}")
async def get_workflow_version(
    workflow_id: UUID,
    version: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkflowVersionRead:
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
        select(Workflow).filter(Workflow.id == workflow_id, Workflow.deleted_at.is_(None))  # type: ignore[arg-type,union-attr]
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
            WorkflowVersion.workflow_id == workflow_id,  # type: ignore[arg-type]
            WorkflowVersion.version == version,  # type: ignore[arg-type]
            WorkflowVersion.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    workflow_version = result.scalar_one_or_none()

    if not workflow_version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Version {version} not found for this workflow",
        )

    # Deserialize workflow_definition from JSON string to dict and return
    return WorkflowVersionRead.model_validate(deserialize_workflow_version(workflow_version))
