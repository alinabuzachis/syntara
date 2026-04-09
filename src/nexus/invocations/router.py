"""Invocation API endpoints for v1."""

import json
from typing import Annotated
from uuid import UUID

import structlog
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Body,
    Depends,
    File,
    Form,
    HTTPException,
    Path,
    Query,
    Request,
    UploadFile,
    status,
)
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator.clients.openrouter_config import get_openrouter_llm
from nexus.agent_orchestrator.models import (
    Invocation,
    InvocationCancelRequest,
    InvocationCancelResponse,
    InvocationCreateRequest,
    InvocationListParams,
    InvocationListResponse,
)
from nexus.agent_orchestrator.models.request import CancellationResult
from nexus.agent_orchestrator.services import InvocationService
from nexus.auth import get_current_user
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.utils.session_factory import create_session_factory_from_request

router = APIRouter(prefix="/invocations", tags=["Invocation"])
logger = structlog.stdlib.get_logger(__name__)

# ============================================================================
# Dependency Injection Providers
# ============================================================================


def get_invocation_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> InvocationService:
    """Dependency provider for InvocationService.

    FastAPI will call this function automatically, injecting all dependencies.
    This centralizes InvocationService creation for endpoints that don't need
    background tasks or custom session factories.

    Args:
        db: Database session
        current_user: Current authenticated user

    Returns:
        InvocationService configured with database session and user

    """
    return InvocationService(db, current_user)


def get_invocation_service_with_background_tasks(
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    request: Request,
) -> InvocationService:
    """Dependency provider for InvocationService with background tasks.

    Args:
        background_tasks: FastAPI background tasks for document conversion
        db: Database session (injected by FastAPI)
        current_user: Current authenticated user
        request: FastAPI request object (contains app with dependency overrides)

    Returns:
        InvocationService configured with all necessary dependencies

    """
    session_factory = create_session_factory_from_request(request)
    return InvocationService(db, current_user, background_tasks, session_factory=session_factory)


def _validate_multipart_required_fields(prompt: str | None, session_id: str | None) -> tuple[str, str]:
    """Validate required fields for multipart requests.

    Args:
        prompt: Prompt field
        session_id: Session ID field

    Returns:
        Tuple of (prompt, session_id) after validation

    Raises:
        HTTPException: If required fields are missing

    """
    if prompt is None or session_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="prompt and session_id are required",
        )
    return (prompt, session_id)


@router.post(
    "",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Create Invocation (Async)",
    description="Accept async agent invocation request and return invocation ID immediately. "
    "Supports both application/json and multipart/form-data with optional file uploads.",
)
async def create_invocation(
    request: Request,
    service: Annotated[InvocationService, Depends(get_invocation_service_with_background_tasks)],
    request_body: Annotated[InvocationCreateRequest | None, Body()] = None,
    prompt: Annotated[str | None, Form()] = None,
    session_id: Annotated[str | None, Form()] = None,
    context_data: Annotated[str | None, Form()] = None,
    files: Annotated[list[UploadFile] | None, File()] = None,
) -> Invocation:
    """Accept async invocation request.

    Supports both formats:
    1. application/json (backward compatible, no file support)
    2. multipart/form-data (with optional file uploads)

    Args:
        request: FastAPI request object (for determining content type)
        service: Invocation service (with background tasks support)
        request_body: JSON request body (for application/json)
        prompt: Prompt field (for multipart/form-data)
        session_id: Session ID field (for multipart/form-data)
        context_data: Context data JSON string (for multipart/form-data)
        files: File uploads (multipart/form-data only, 1-10 files, max 10MB each by default)

    Returns:
        Created invocation with file_ids in context_data if files uploaded

    Raises:
        HTTPException: 400 for validation errors, 500 for storage failures

    Note:
        To upload files, use Content-Type: multipart/form-data.
        JSON requests (Content-Type: application/json) do not support file uploads.

    """
    # Fail fast if LLM is not configured - return 503 Service Unavailable
    # This prevents creating invocations that will immediately fail during execution
    # The LLMConfigurationError will be handled by the global error handler
    get_openrouter_llm()

    # Check content type to determine request format
    content_type = request.headers.get("content-type", "")
    is_json_request = "application/json" in content_type
    is_multipart_request = "multipart/form-data" in content_type

    # Determine request format and extract data
    final_prompt: str
    final_session_id: str
    final_context_data: dict[str, object] | None
    final_files: list[UploadFile] | None

    if is_json_request:
        # JSON request (backward compatible, no file support)
        # Parse JSON manually because FastAPI gets confused with mixed Body() and Form() params
        if request_body is not None:
            # FastAPI successfully parsed it
            body = request_body
        else:
            # Manually parse JSON from request
            json_data = await request.json()
            body = InvocationCreateRequest.model_validate(json_data)

        final_prompt = body.prompt
        final_session_id = body.session_id
        final_context_data = body.context_data
        final_files = None  # Files not supported in JSON mode
    elif is_multipart_request or prompt is not None or session_id is not None:
        # Multipart form data request (supports files)
        final_prompt, final_session_id = _validate_multipart_required_fields(prompt, session_id)
        # Parse context_data JSON string if provided
        parsed_context: dict[str, object] | None = json.loads(context_data) if context_data else None
        final_context_data = parsed_context
        final_files = files
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request must be either application/json or multipart/form-data",
        )

    return await service.create_invocation(
        prompt=final_prompt,
        session_id=final_session_id,
        context_data=final_context_data,
        files=final_files,
    )


@router.get(
    "",
    summary="List Invocations",
    description="List invocations with cursor-based pagination and filtering",
)
async def list_invocations(
    request: Request,
    service: Annotated[InvocationService, Depends(get_invocation_service)],
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
        service: Invocation service
        params: Query parameters for pagination and filtering

    Returns:
        InvocationListResponse with invocations, pagination metadata, and optional total

    """
    return await service.list_invocations(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
    )


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
    service: Annotated[InvocationService, Depends(get_invocation_service)],
) -> Invocation:
    """Get invocation details including result.

    NOTE: This endpoint is primarily for TESTING and DEBUGGING.
    Use WebSockets for production real-time result streaming.

    Args:
        invocation_id: UUID of the invocation
        service: Invocation service

    Returns:
        Full invocation details including:
        - Metadata (id, status, timestamps)
        - The actual result from the agent (LLM response or workflow output)
        - Error information if failed
        - Context and checkpoint data

    Raises:
        HTTPException: 404 if invocation not found, 500 for other errors

    Example:
        # After creating an invocation, retrieve its result:
        # response = await client.get("/api/v1/invocations/{id}")
        # print(response.json()["result"])  # See the actual LLM response

    """
    # Parse UUID
    uuid_obj = UUID(invocation_id)

    # Retrieve invocation from database
    invocation = await service.get_invocation(uuid_obj)

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


@router.post(
    "/{invocation_id}/cancel",
    summary="Cancel Invocation",
    description="Cancel a running or pending invocation. Only the invocation owner can cancel it.",
)
async def cancel_invocation(
    invocation_id: Annotated[
        str,
        Path(
            description="UUID of the invocation to cancel",
        ),
    ],
    request_body: InvocationCancelRequest,
    service: Annotated[InvocationService, Depends(get_invocation_service)],
) -> InvocationCancelResponse:
    """Cancel a running or pending invocation.

    Args:
        invocation_id: UUID of the invocation to cancel
        request_body: Request containing optional cancellation reason
        service: Invocation service

    Returns:
        InvocationCancelResponse indicating success or failure

    Raises:
        HTTPException: 400 for invalid UUID, 404 if not found or unauthorized, 409 if not cancellable

    """
    # Parse UUID
    uuid_obj = UUID(invocation_id)

    # Attempt cancellation
    result = await service.cancel_invocation(uuid_obj, request_body.reason)

    if result == CancellationResult.SUCCESS:
        return InvocationCancelResponse(
            success=True,
            message=f"Invocation {invocation_id} cancelled successfully",
        )

    if result == CancellationResult.NOT_FOUND:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Invocation {invocation_id} not found",
        )

    if result == CancellationResult.NOT_CANCELLABLE:
        # Get the invocation to provide current status in error message
        invocation = await service.get_invocation(uuid_obj)
        current_status = invocation.status.value if invocation else "unknown"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invocation {invocation_id} cannot be cancelled (status: {current_status})",
        )

    # Should never happen, but defensive programming
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Unexpected cancellation result",
    )
