"""Invocation API endpoints for v1."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.agent_orchestrator.models import (
    Invocation,
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
    invocation: Invocation,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Invocation:
    """Accept async invocation request.

    Args:
        invocation: Invocation data with prompt, created_by, and session_id
        db: Database session (dependency injected)

    Returns:
        Created invocation

    Raises:
        HTTPException: If invocation creation fails

    """
    try:
        service = InvocationService(db)
        return await service.create_invocation(
            prompt=invocation.prompt,
            created_by=invocation.created_by,
            session_id=invocation.session_id,
            context_data=invocation.context_data,
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
    include_total: Annotated[bool, Query(description="Include total count in response")] = False,  # noqa: FBT002
    *,
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
