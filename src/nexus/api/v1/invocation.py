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
    InvocationListResponse,
    InvocationStatus,
)
from nexus.agent_orchestrator.services import InvocationService
from nexus.api.db import get_db
from nexus.core.utils import generate_response
from nexus.core.utils.cursor import SortDirection
from nexus.core.utils.filters import parse_filters
from nexus.core.utils.labels import parse_label_filter
from nexus.core.utils.sorting import parse_sort

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
) -> Invocation:
    """Accept async invocation request.

    Supports both camelCase (API contract) and snake_case field names
    via Pydantic field aliasing with populate_by_name=True.

    Args:
        request_body: Validated invocation request
        db: Database session (dependency injected)

    Returns:
        Created invocation

    Raises:
        HTTPException: If invocation creation fails

    """
    try:
        service = InvocationService(db)
        return await service.create_invocation(
            prompt=request_body.prompt,
            created_by=request_body.created_by,
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
    cursor: Annotated[str | None, Query(description="Pagination cursor")] = None,
    limit: Annotated[int, Query(ge=1, le=100, description="Maximum number of results")] = 20,
    sort: Annotated[str | None, Query(description="Sort field (prefix with - for descending)")] = None,
    invocation_status: Annotated[InvocationStatus | None, Query(alias="status", description="Filter by status")] = None,
    *,
    include_total: Annotated[bool, Query(description="Include total count in response")] = False,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InvocationListResponse:
    """List invocations with cursor-based pagination and filtering.

    Supports advanced filtering with operators:
    - prompt: prompt[contains]=text, prompt[starts_with]=text
    - created_by: created_by=uuid or created_by[eq]=uuid
    - session_id: session_id=id, session_id[eq]=id, session_id[contains]=text,
      session_id[starts_with]=text
    - labels: labels[key]=value (e.g., labels[environment]=production)
    - created_at: created_at[gt|gte|lt|lte]=timestamp
    - updated_at: updated_at[gt|gte|lt|lte]=timestamp

    Args:
        request: FastAPI request object to access query parameters
        cursor: Pagination cursor for next/previous page
        limit: Maximum results to return (1-100, default 20)
        sort: Field to sort by (prefix with - for descending, e.g., "-created_at")
        invocation_status: Filter by invocation status (query param: status)
        include_total: Whether to include total count
        db: Database session (dependency injected)

    Returns:
        Paginated list of invocations with cursors

    Raises:
        HTTPException: If list operation fails or invalid filter/sort field

    """
    try:
        # Parse query parameters (API layer responsibility)
        query_params = dict(request.query_params)

        # Remove non-filter parameters
        for param in ["cursor", "limit", "sort", "include_total", "status"]:
            query_params.pop(param, None)

        # Parse label filters
        label_filters = parse_label_filter(query_params)
        for key in query_params.copy():
            if key.startswith("labels["):
                query_params.pop(key)

        # Parse advanced filters
        allowed_fields = [
            "prompt",
            "created_by",
            "session_id",
            "created_at",
            "updated_at",
        ]
        filters = parse_filters(query_params, allowed_fields)

        # Parse sorting
        sort_field, sort_direction = parse_sort(
            sort,
            Invocation.__sortable_fields__,
            default_field="created_at",
            default_direction=SortDirection.DESC,
        )

        # Call service layer (business logic)
        service = InvocationService(db)
        invocations, total_count = await service.list_invocations(
            filters=filters,
            label_filters=label_filters,
            status_filter=invocation_status,
            sorting=[(sort_field, sort_direction)],
            limit=limit,
            include_total=include_total,
        )

        # Generate response (API layer responsibility)
        pagination_metadata = generate_response(
            items=invocations,
            limit=limit,
            cursor=cursor,
            include_total=include_total,
            total_count=total_count,
        )

        return InvocationListResponse(
            resources=invocations,
            next=pagination_metadata["next"],
            prev=pagination_metadata["prev"],
            total=pagination_metadata["total"],
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid filter or sort parameter: {e}",
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
) -> Invocation:
    """Get invocation details including result.

    NOTE: This endpoint is primarily for TESTING and DEBUGGING.
    Use WebSockets for production real-time result streaming.

    Args:
        invocation_id: UUID of the invocation
        db: Database session (dependency injected)

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
        service = InvocationService(db)
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
