"""Invocation API endpoints for v1."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.api.db import get_db
from nexus.api.schemas.invocation import (
    InvocationListResponse,
    InvocationStatus,
    InvokeRequest,
    InvokeResponse,
)
from nexus.api.services.invocation_service import InvocationService

router = APIRouter(prefix="/invocations", tags=["Invocation"])
logger = logging.getLogger(__name__)


@router.post(
    "",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Create Invocation (Async)",
    description="Accept async agent invocation request and return invocation ID immediately",
)
async def invoke_agent(
    request: InvokeRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InvokeResponse:
    """Accept async invocation request.

    Args:
        request: Invocation request with prompt, user_id, and session_id
        db: Database session (dependency injected)

    Returns:
        Invocation response with id and status

    Raises:
        HTTPException: If invocation creation fails

    """
    try:
        service = InvocationService(db)
        invocation = await service.accept_invocation(request)

        return InvokeResponse(
            id=invocation.id,
            status=InvocationStatus(invocation.status),
            created_at=invocation.created_at,
            ws_url=None,  # WebSocket support in NEXUS-002-2
        )

    except ValidationError as e:
        logger.warning("Validation error in invocation request", exc_info=e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid request data",
        ) from e
    except Exception as e:
        logger.exception("Unexpected error creating invocation")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        ) from e


@router.get(
    "",
    summary="List Invocations",
    description="List invocations with optional status filter",
)
async def list_invocations(
    status_filter: Annotated[
        InvocationStatus | None,
        Query(
            alias="status",
            description="Filter by invocation status",
        ),
    ] = None,
    limit: Annotated[
        int,
        Query(
            ge=1,
            le=1000,
            description="Maximum number of results",
        ),
    ] = 100,
    offset: Annotated[
        int,
        Query(
            ge=0,
            description="Number of results to skip",
        ),
    ] = 0,
    *,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InvocationListResponse:
    """List invocations with optional filtering.

    Args:
        status_filter: Optional status to filter by
        limit: Maximum results to return (1-1000)
        offset: Number of results to skip
        db: Database session (dependency injected)

    Returns:
        List of invocations with total count

    Raises:
        HTTPException: If list operation fails

    """
    try:
        service = InvocationService(db)

        invocations, total = await service.list_invocations(
            status=status_filter,
            limit=limit,
            offset=offset,
        )

        # Convert Invocation models to InvokeResponse models
        invoke_responses = [
            InvokeResponse(
                id=inv.id,
                status=InvocationStatus(inv.status),
                created_at=inv.created_at,
                ws_url=None,
            )
            for inv in invocations
        ]

        return InvocationListResponse(
            invocations=invoke_responses,
            total=total,
        )

    except Exception as e:
        logger.exception("Unexpected error listing invocations")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        ) from e
