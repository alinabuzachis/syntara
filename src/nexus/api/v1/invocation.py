"""Invocation API endpoints for v1."""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.agent_orchestrator.models import (
    Invocation,
    InvocationCreateRequest,
    InvocationListParams,
    InvocationListResponse,
)
from nexus.agent_orchestrator.services import InvocationService
from nexus.api.auth import get_current_user
from nexus.api.db import get_db
from nexus.core.models import User

router = APIRouter(prefix="/invocations", tags=["Invocation"])
logger = logging.getLogger(__name__)


@router.post(
    "",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Create Invocation (Async)",
    description="Accept async agent invocation request and return invocation ID immediately",
)
async def invoke_agent(
    request_body: InvocationCreateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Invocation:
    """Accept async invocation request.

    Supports both camelCase (API contract) and snake_case field names
    via Pydantic field aliasing with populate_by_name=True.

    Args:
        request_body: Validated invocation request
        db: Database session (dependency injected)
        current_user: Current authenticated user

    Returns:
        Created invocation

    Raises:
        HTTPException: If invocation creation fails

    """
    try:
        service = InvocationService(db, current_user)
        return await service.create_invocation(
            prompt=request_body.prompt,
            session_id=request_body.session_id,
            context_data=request_body.context_data,
        )

    except ValidationError as e:
        logger.warning("Pydantic validation error in invocation request", exc_info=e)
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
    description="List invocations with cursor-based pagination and filtering",
)
async def list_invocations(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    params: Annotated[InvocationListParams, Query()],
) -> InvocationListResponse:
    """List invocations with filtering, sorting, and pagination.

    Supports filtering using query parameters with advanced operators:
    - prompt: Filter by prompt text (prompt[contains]=text, prompt[starts_with]=text)
    - created_by: Filter by creator user ID (created_by=uuid)
    - session_id: Filter by session ID (session_id=id, session_id[contains]=text)
    - status: Filter by invocation status (status=created|running|completed|failed)
    - labels: Filter by labels using bracket notation (labels[environment]=production)
    - created_at: Filter by creation time (created_at[gt|gte|lt|lte]=timestamp)
    - updated_at: Filter by update time (updated_at[gt|gte|lt|lte]=timestamp)

    Uses cursor-based pagination for scalability and consistency.

    Args:
        request: FastAPI request object containing query parameters
        db: Database session
        current_user: Current authenticated user
        params: Query parameters for pagination and filtering

    Returns:
        InvocationListResponse with invocations, pagination metadata, and optional total

    """
    try:
        service = InvocationService(db, current_user)

        return await service.list_invocations(
            limit=params.limit,
            cursor=params.cursor,
            sort=params.sort,
            query_params_items=request.query_params.items(),
            include_total=params.include_total,
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        ) from e
    except HTTPException:
        # Re-raise HTTPExceptions without wrapping
        raise
    except Exception as e:
        logger.exception("Unexpected error listing invocations")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        ) from e


# NOTE: This endpoint is primarily for TESTING and DEBUGGING purposes.
# In production, you would typically use WebSockets or Server-Sent Events
# for real-time result streaming instead of polling this endpoint.
# This is useful during development to:
# - View the actual LLM responses from GenericAgent
# - Inspect workflow execution results
# - Debug routing decisions and agent behavior
@router.get(
    "/{invocation_id}",
    summary="Get Invocation Details (Testing/Debug)",
    description="Retrieve full invocation details including the result. "
    "NOTE: This endpoint is for testing and debugging. "
    "Production systems should use WebSockets for real-time results.",
)
async def get_invocation(
    invocation_id: Annotated[
        str,
        Path(
            description="UUID of the invocation to retrieve",
        ),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Invocation:
    """Get invocation details including result.

    NOTE: This endpoint is primarily for TESTING and DEBUGGING.
    Use WebSockets for production real-time result streaming.

    Args:
        invocation_id: UUID of the invocation
        db: Database session (dependency injected)
        current_user: Current authenticated user

    Returns:
        Full invocation details including:
        - Metadata (id, status, timestamps)
        - The actual result from the agent (LLM response or workflow output)
        - Error information if failed
        - Context and checkpoint data

    Raises:
        HTTPException: 404 if invocation not found, 500 for other errors

    Example:
        >>> # After creating an invocation, retrieve its result:
        >>> response = await client.get("/api/v1/invocations/{id}")
        >>> print(response.json()["result"])  # See the actual LLM response

    """
    # Parse UUID
    try:
        uuid_obj = UUID(invocation_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid UUID format: {invocation_id}",
        ) from e

    # Retrieve invocation from database
    try:
        service = InvocationService(db, current_user)
        invocation = await service.get_invocation(uuid_obj)
    except Exception as e:
        logger.exception("Unexpected error retrieving invocation %s", invocation_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        ) from e

    # Check if invocation exists
    if not invocation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Invocation {invocation_id} not found",
        )

    # NOTE: The 'result' field contains the actual agent response.
    # For GenericAgent: {"type": "answer", "content": "...", "metadata": {...}}
    # For WorkflowGeneratorAgent: workflow execution results
    return invocation
