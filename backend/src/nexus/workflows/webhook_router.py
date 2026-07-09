"""Webhook reception endpoints for triggering workflows from external systems.

This router handles incoming POST requests from external services (GitHub, Jira,
Slack, EDA, etc.) and triggers the matching workflow.
"""

from typing import TYPE_CHECKING, Annotated, Any
from uuid import UUID

if TYPE_CHECKING:
    from nexus.core.models.user import User

import structlog
from fastapi import Body, Depends, Path, Request, status
from sqlmodel import Field, SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession
from temporalio.service import RPCError

from nexus.core.config.base import get_settings
from nexus.core.constants import WebhookLimits
from nexus.core.database.session import get_db
from nexus.core.models.principal import make_service_user
from nexus.core.nexus_router import NO_PERMISSION, NexusRouter
from nexus.workflows.exceptions import (
    PayloadTooLargeError,
    TemporalUnavailableError,
    TriggerValidationError,
)
from nexus.workflows.services.execution_service import ExecutionService
from nexus.workflows.services.webhook_trigger_service import WebhookTriggerService
from nexus.workflows.workflow_engine.models.workflow_definition import NodeType
from nexus.workflows.workflow_engine.services.temporal_execution_service import (
    TemporalExecutionService,
    create_temporal_execution_service,
)

logger = structlog.stdlib.get_logger(__name__)

router = NexusRouter(prefix="/webhooks", tags=["webhooks"])


# ============================================================================
# Response Models
# ============================================================================


class WebhookResponse(SQLModel):
    """Response from webhook reception endpoint."""

    execution_id: UUID = Field(description="ID of the triggered workflow execution")
    message: str = Field(description="Human-readable status message")


# ============================================================================
# Dependencies
# ============================================================================


async def _check_payload_size(request: Request) -> None:
    """Reject oversized webhook payloads before business logic runs.

    Two-phase check: first the Content-Length header (fast-path rejection
    without reading the body), then a streaming read that aborts as soon
    as the limit is exceeded — never buffering more than the allowed
    maximum.  A reverse proxy / API gateway should also enforce body size
    limits as an additional layer (e.g. nginx ``client_max_body_size 1m;``).
    """
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            length = int(content_length)
        except (ValueError, TypeError):
            msg = "Invalid Content-Length header"
            raise TriggerValidationError(msg) from None
        if length > WebhookLimits.PAYLOAD_MAX_BYTES:
            msg = f"Payload too large: {length} bytes exceeds maximum of {WebhookLimits.PAYLOAD_MAX_BYTES} bytes"
            raise PayloadTooLargeError(msg)

    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > WebhookLimits.PAYLOAD_MAX_BYTES:
            msg = f"Payload too large: exceeds maximum of {WebhookLimits.PAYLOAD_MAX_BYTES} bytes"
            raise PayloadTooLargeError(msg)

    # Cache so downstream FastAPI Body() parsing can re-read it.
    request._body = bytes(body)  # noqa: SLF001


async def get_webhook_temporal_service() -> TemporalExecutionService | None:
    """Dependency provider for Temporal execution service in webhook context.

    Returns None if Temporal is unavailable (graceful degradation).
    """
    try:
        return await create_temporal_execution_service()
    except (RPCError, OSError, RuntimeError) as e:
        logger.warning("Temporal service unavailable for webhook", error=str(e))
        return None


def _get_service_user() -> "User":
    """Build a synthetic User for the backend service principal."""
    return make_service_user(get_settings().service_identity)


async def get_webhook_trigger_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WebhookTriggerService:
    """Dependency provider for WebhookTriggerService."""
    return WebhookTriggerService(db, _get_service_user())


# ============================================================================
# Shared Logic
# ============================================================================


async def _handle_webhook_request(
    webhook_path: str,
    payload: Any,  # noqa: ANN401
    trigger_type: str,
    webhook_service: WebhookTriggerService,
    temporal_service: TemporalExecutionService | None,
    db: AsyncSession,
    label: str = "",
) -> WebhookResponse:
    label = f"{label} webhook" if label else "webhook"
    logger.info(
        "Received webhook event",
        trigger_type=label,
        webhook_path=webhook_path,
        payload_type=type(payload).__name__,
    )

    trigger = await webhook_service.get_by_webhook_path(webhook_path, trigger_type=trigger_type)

    if temporal_service is None:
        raise TemporalUnavailableError(f"{label} triggering")  # noqa: EM102, TRY003

    execution_service = ExecutionService(db, webhook_service.user, temporal_service=temporal_service)
    trigger_input = {"payload": payload}

    execution = await execution_service.create_execution(
        workflow_id=trigger.workflow_id,
        input_data=trigger_input,
        trigger_node_id=trigger.trigger_node_id,
        use_published=True,
    )

    logger.info(
        "Webhook triggered workflow execution",
        trigger_type=label,
        webhook_path=webhook_path,
        workflow_id=trigger.workflow_id,
        execution_id=execution.id,
        trigger_node_id=trigger.trigger_node_id,
    )

    return WebhookResponse(
        execution_id=execution.id,
        message=f"Workflow execution started from {label} '{webhook_path}'",
    )


# ============================================================================
# Endpoints
# ============================================================================


@router.post(
    "/{webhook_path}",
    status_code=status.HTTP_202_ACCEPTED,
    operation_id="receive_webhook",
    summary="Receive webhook event",
    description=(
        "Receive a webhook event from an external system and trigger the matching workflow. "
        "Only POST method is supported; other methods receive 405 Method Not Allowed."
    ),
    response_description="Webhook accepted and workflow execution started",
    responses={
        413: {
            "description": "Payload exceeds the 1 MB size limit",
            "content": {"application/problem+json": {"schema": {"$ref": "#/components/schemas/ErrorData"}}},
        },
    },
    dependencies=[NO_PERMISSION],
    openapi_extra={"security": []},
)
async def receive_webhook(
    webhook_path: Annotated[str, Path(max_length=WebhookLimits.PATH_MAX_LENGTH, pattern=WebhookLimits.PATH_PATTERN)],
    payload: Annotated[Any, Body()],  # noqa: ANN401
    webhook_service: Annotated[WebhookTriggerService, Depends(get_webhook_trigger_service)],
    temporal_service: Annotated[TemporalExecutionService | None, Depends(get_webhook_temporal_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
    _payload_size: Annotated[None, Depends(_check_payload_size)],
) -> WebhookResponse:
    """Receive a webhook event and trigger the matching workflow."""
    return await _handle_webhook_request(
        webhook_path=webhook_path,
        payload=payload,
        trigger_type=NodeType.WEBHOOK_TRIGGER,
        webhook_service=webhook_service,
        temporal_service=temporal_service,
        db=db,
    )


@router.post(
    "/eda/{webhook_path}",
    status_code=status.HTTP_202_ACCEPTED,
    operation_id="receive_eda_webhook",
    summary="Receive EDA webhook event",
    description=(
        "Receive a webhook event from Event-Driven Ansible and trigger the matching workflow. "
        "Each EDA trigger node has its own unique webhook path. "
        "The payload can be any JSON structure."
    ),
    response_description="Webhook accepted and workflow execution started",
    responses={
        413: {
            "description": "Payload exceeds the 1 MB size limit",
            "content": {"application/problem+json": {"schema": {"$ref": "#/components/schemas/ErrorData"}}},
        },
    },
    dependencies=[NO_PERMISSION],
    openapi_extra={"security": []},
)
async def receive_eda_webhook(
    webhook_path: Annotated[str, Path(max_length=WebhookLimits.PATH_MAX_LENGTH, pattern=WebhookLimits.PATH_PATTERN)],
    payload: Annotated[Any, Body()],  # noqa: ANN401
    webhook_service: Annotated[WebhookTriggerService, Depends(get_webhook_trigger_service)],
    temporal_service: Annotated[TemporalExecutionService | None, Depends(get_webhook_temporal_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
    _payload_size: Annotated[None, Depends(_check_payload_size)],
) -> WebhookResponse:
    """Receive a webhook event from EDA and trigger the matching workflow."""
    return await _handle_webhook_request(
        webhook_path=webhook_path,
        payload=payload,
        trigger_type=NodeType.EDA_TRIGGER,
        webhook_service=webhook_service,
        temporal_service=temporal_service,
        db=db,
        label="EDA",
    )
