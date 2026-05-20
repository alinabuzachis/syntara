"""Service for executing invocations decoupled from creation."""

import contextlib
import os
import time
from collections.abc import AsyncGenerator, Callable
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

import structlog

from nexus.audit.utils import escalate_actor_type

if TYPE_CHECKING:
    from nexus.agent_orchestrator.context_manager.compressor import CompressorService
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator import ContextManagerPlanner
from nexus.agent_orchestrator.audit.invocation_lifecycle import InvocationLifecycleEvent
from nexus.agent_orchestrator.clients.openrouter_config import get_openrouter_llm
from nexus.agent_orchestrator.exceptions import InvocationCancelledError, LLMConfigurationError
from nexus.agent_orchestrator.models import Invocation, InvocationContextData, InvocationStatus, LLMCredentialConfig
from nexus.agent_orchestrator.services.orchestration_service import OrchestrationService
from nexus.agent_orchestrator.token_manager.models import UsageDetails, UsageDetailsResult
from nexus.agent_orchestrator.token_manager.repository import TokenUsageRepository
from nexus.agent_orchestrator.utils.workflow_signal_client import WorkflowSignalClient
from nexus.audit.context_managers import actor_context as audit_actor_context
from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.audit.emitter import AuditActorContext
from nexus.audit.models.audit_event import ActorType
from nexus.core.config.base import get_settings
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.core.services.secret_service import create_secret_service
from nexus.credentials.lib.injector_resolver import InjectorResolver
from nexus.credentials.models.credential import Credential
from nexus.credentials.models.credential_type import CredentialType
from nexus.files.file_manager import FileManager, get_file_manager
from nexus.files.models import FileStatus
from nexus.metrics.dependencies import get_metrics_recorder
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.types import MetricType

logger = structlog.stdlib.get_logger(__name__)


def _extract_workflow_id(ctx: InvocationContextData) -> UUID | None:
    """Extract workflow_id UUID from invocation context."""
    if ctx.workflow_id:
        with contextlib.suppress(ValueError):
            return UUID(ctx.workflow_id)
    return None


def _extract_execution_id(ctx: InvocationContextData) -> UUID | None:
    """Extract execution_id UUID from invocation context."""
    if ctx.execution_id:
        with contextlib.suppress(ValueError):
            return UUID(ctx.execution_id)
    return None


def _extract_request_id(ctx: InvocationContextData) -> UUID | None:
    """Extract request_id UUID from invocation context."""
    if ctx.metadata and ctx.metadata.request_id:
        with contextlib.suppress(ValueError):
            return UUID(ctx.metadata.request_id)
    return None


def _extract_response_schema(ctx: InvocationContextData) -> dict[str, Any] | None:
    """Extract response_schema from invocation context."""
    opaque = ctx.metadata.response_schema if ctx.metadata else None
    return opaque.get_data() if opaque else None


def _extract_model_name(result_dict: dict[str, Any]) -> str | None:
    """Extract model name from result metadata.

    Args:
        result_dict: Result dictionary from orchestration service

    Returns:
        Model name if found, None otherwise

    """
    if isinstance(result_dict, dict):
        response_metadata = result_dict.get("response_metadata")
        if isinstance(response_metadata, dict):
            return response_metadata.get("model")
    return None


def _aggregate_token_usage(
    usage_log: list[dict[str, Any]],
) -> tuple[int, int, int, UsageDetailsResult]:
    """Aggregate token counts from LLM call entries and build usage_details.

    Maps extraction-layer field names (input_tokens, output_tokens) to
    DB-layer field names (prompt_tokens, completion_tokens).

    Args:
        usage_log: List of token usage entries from GenericAgent.

    Returns:
        Tuple of (prompt_tokens, completion_tokens, total_tokens, usage_details).
        usage_details is always a list of per-call details, or None if no
        provider metadata was captured.

    """
    prompt_tokens = sum(entry.get("input_tokens", 0) for entry in usage_log)
    completion_tokens = sum(entry.get("output_tokens", 0) for entry in usage_log)
    total_tokens = prompt_tokens + completion_tokens

    filtered: list[UsageDetails] = [
        entry["usage_details"] for entry in usage_log if entry.get("usage_details") is not None
    ]
    usage_details: UsageDetailsResult = filtered or None

    return prompt_tokens, completion_tokens, total_tokens, usage_details


class InvocationExecutor:
    """Service for executing invocations independently of creation.

    This service is designed to be called by background tasks after
    document conversion is complete, allowing for decoupled execution.
    """

    def __init__(
        self,
        session_factory: Callable[[], AsyncGenerator[AsyncSession, None]] = get_db,
        file_manager_factory: Callable[[], FileManager] = get_file_manager,
        token_usage_repository: TokenUsageRepository | None = None,
    ) -> None:
        """Initialize execution service with database session factory.

        Args:
            session_factory: Factory function for creating database sessions
            file_manager_factory: Factory function for creating FileManager
            token_usage_repository: Optional repository for token usage updates

        """
        self.session_factory = session_factory
        self.file_manager = file_manager_factory()
        self.token_usage_repository = token_usage_repository or TokenUsageRepository()
        # Create async context manager from the session factory
        self.get_async_session_context = contextlib.asynccontextmanager(session_factory)

    @staticmethod
    async def _get_actor_context_for_invocation(session: AsyncSession, invocation: Invocation) -> AuditActorContext:
        """Get AuditActorContext for an invocation's creator.

        Args:
            session: Database session
            invocation: Invocation being executed

        Returns:
            ActorContext with atomic actor_id and actor_username

        """
        user = await session.get(User, invocation.created_by)
        if user:
            return AuditActorContext(
                actor_id=user.id,
                actor_username=user.username,
                actor_type=escalate_actor_type(user.id),
            )
        # This scenario should not happen. Invocations are created by the AgenticActivity that
        # creates a Bearer Token for the System User. The Invocation.created_by will therefore be
        # that of the System User.
        logger.warning(
            "User associated with Invocation.created_by cannot be found. Using System User context.",
            invocation_id=invocation.id,
            created_by=invocation.created_by,
        )
        return AuditActorContext(
            actor_id=get_settings().system_user_id,
            actor_username="system",
            actor_type=ActorType.SYSTEM,
        )

    async def execute_invocation(self, invocation_id: UUID) -> None:
        """Execute invocation by ID, loading fresh data from database.

        This method loads the invocation from the database to get the latest
        FileMetadata status updates from background tasks.

        Args:
            invocation_id: UUID of the invocation to execute

        Returns:
            True if execution completed (success or permanent failure),
            False if execution was gated and should be retried later

        """
        async with self.get_async_session_context() as session:
            # Load fresh invocation from database to get latest FileMetadata status
            invocation: Invocation | None = await session.get(Invocation, invocation_id)
            if not invocation:
                logger.error("Invocation not found for execution", invocation_id=invocation_id)
                return

            # Check if invocation was cancelled before execution
            if invocation.status == InvocationStatus.CANCELLED:
                logger.info("Invocation was cancelled before execution", invocation_id=invocation_id)
                return

            logger.info(
                "Executing invocation",
                invocation_id=invocation.id,
            )

            # Parse context_data into typed model once, reused throughout execution
            ctx = InvocationContextData.model_validate(invocation.context_data or {})

            # Log conversion failures but allow execution to proceed (FR-020)
            await self._log_conversion_failures(invocation, ctx, session)

            # Initialize OrchestrationService - fail immediately if LLM not configured
            orchestration_service = await self._init_orchestration(invocation, ctx, session)
            if orchestration_service is None:
                return

            # Execute orchestration with error handling
            workflow_id: UUID | None = _extract_workflow_id(ctx)
            activity_id: str | None = ctx.activity_id
            execution_id: UUID | None = _extract_execution_id(ctx)
            request_id: UUID | None = _extract_request_id(ctx)
            actor_context = await self._get_actor_context_for_invocation(session, invocation)
            with audit_actor_context(
                actor=actor_context,
                workflow_id=workflow_id,
                activity_id=activity_id,
                execution_id=execution_id,
                request_id=request_id,
            ):
                await self._execute_orchestration(invocation, orchestration_service, session, ctx, actor_context)

    async def _execute_orchestration(
        self,
        invocation: Invocation,
        orchestration_service: OrchestrationService,
        session: AsyncSession,
        ctx: InvocationContextData,
        actor_context: AuditActorContext,
    ) -> None:
        """Execute orchestration service and handle result processing.

        Args:
            invocation: The invocation to execute
            orchestration_service: Initialized orchestration service
            session: Database session
            ctx: Parsed context_data model
            actor_context: Actor context for audit event

        """
        recorder = get_metrics_recorder()
        invocation_start = time.perf_counter()
        execution_id = _extract_execution_id(ctx)

        try:
            # Mark invocation as started
            invocation.started_at = datetime.now(UTC)
            invocation.status = InvocationStatus.RUNNING
            await session.commit()

            # Dispatch RUNNING event
            AuditEventDispatcher.dispatch(
                InvocationLifecycleEvent(
                    invocation_id=invocation.id, execution_id=execution_id, status=InvocationStatus.RUNNING
                )
            )

            # Execute through OrchestrationService (which handles context enhancement internally)
            logger.info(
                "Executing through OrchestrationService",
                invocation_id=invocation.id,
                prompt=invocation.prompt,
            )

            # Extract response_schema for structured output support
            opaque = ctx.metadata.response_schema if ctx.metadata else None
            response_schema = opaque.get_data() if opaque else None

            result_dict = await orchestration_service.execute(
                prompt=invocation.prompt,
                session_id=invocation.session_id,
                invocation_id=invocation.id,
                actor_context=actor_context,
                ctx=ctx,
                execution_id=execution_id,
                response_schema=response_schema,
            )

            # Check if invocation was cancelled during execution (fix race condition)
            # Refresh the current invocation to get latest status from database
            await session.refresh(invocation)

            if invocation.status == InvocationStatus.CANCELLED:
                logger.warning(
                    "Invocation was cancelled during execution, skipping completion",
                    invocation_id=invocation.id,
                )
                # Dispatch CANCELLED event
                AuditEventDispatcher.dispatch(
                    InvocationLifecycleEvent(
                        invocation_id=invocation.id, execution_id=execution_id, status=InvocationStatus.CANCELLED
                    )
                )
                return  # Don't override the CANCELLED status

            # Update token usage record with actual provider-reported counts
            await self._update_token_usage(result_dict, invocation, session)

            # Extract model name from result metadata
            model_name = _extract_model_name(result_dict)

            # Store result and mark as completed (after cancellation check)
            invocation.result = result_dict
            invocation.model_name = model_name
            invocation.status = InvocationStatus.COMPLETED
            invocation.completed_at = datetime.now(UTC)
            await session.commit()

            # Dispatch COMPLETED event
            AuditEventDispatcher.dispatch(
                InvocationLifecycleEvent(
                    invocation_id=invocation.id,
                    execution_id=execution_id,
                    status=InvocationStatus.COMPLETED,
                    model_name=model_name,
                )
            )

            self._record_invocation_metrics(recorder, invocation_start, invocation.id, status="success")

        except InvocationCancelledError:
            # Invocation was cancelled during execution - this is expected behavior
            # Don't mark as failed since cancellation is already handled
            logger.info("Invocation cancelled during execution", invocation_id=invocation.id)
        except Exception as e:
            self._record_invocation_metrics(recorder, invocation_start, invocation.id, status="error", error=e)

            logger.exception(
                "Exception during invocation execution",
                invocation_id=invocation.id,
                error_type=type(e).__name__,
            )
            await self._handle_execution_error(e, invocation.id, execution_id, session)

            # Send failure signal to workflow
            cb_url = ctx.callback_url.get_secret_value() if ctx.callback_url else None
            await WorkflowSignalClient.send_failure_signal(cb_url, invocation.id, e)

    async def _update_token_usage(
        self,
        result_dict: dict[str, Any],
        invocation: Invocation,
        session: AsyncSession,
    ) -> None:
        """Update TokenUsageRecord with actual provider-reported token counts.

        Pops llm_token_usage_log from result_dict (so it's not stored in invocation.result),
        aggregates token counts across calls, and updates the record via SAVEPOINT.
        Non-blocking: logs warning on failure but never raises (FR-007).

        Args:
            result_dict: Result dictionary (modified in-place to remove llm_token_usage_log)
            invocation: The Invocation object (provides .id as UUID)
            session: Async database session

        """
        usage_log = result_dict.pop("llm_token_usage_log", [])
        if not usage_log:
            return

        total_prompt, total_completion, total_tokens, usage_details = _aggregate_token_usage(usage_log)

        try:
            async with session.begin_nested():
                await self.token_usage_repository.update_with_actual_token_usage(
                    invocation_id=invocation.id,
                    prompt_tokens=total_prompt,
                    completion_tokens=total_completion,
                    token_count=total_tokens,
                    usage_details=usage_details,
                    session=session,
                    user_id=invocation.created_by,
                )
            logger.info(
                "Post-LLM token usage updated",
                user_id=str(invocation.created_by),
                invocation_id=str(invocation.id),
                prompt_tokens=total_prompt,
                completion_tokens=total_completion,
                token_count=total_tokens,
            )
        except Exception:  # noqa: BLE001
            logger.warning(
                "Failed to update post-LLM token usage (non-blocking)",
                user_id=str(invocation.created_by),
                invocation_id=str(invocation.id),
                prompt_tokens=total_prompt,
                completion_tokens=total_completion,
                token_count=total_tokens,
                exc_info=True,
            )

    async def _init_orchestration(
        self, invocation: Invocation, ctx: InvocationContextData, session: AsyncSession
    ) -> "OrchestrationService | None":
        """Initialise LLM and OrchestrationService, handling configuration failures.

        Extracts LLM credentials from invocation context_data (injected by the
        credential system via agentic_activity) and falls back to env vars.

        Returns the OrchestrationService instance or ``None`` on failure.
        """
        try:
            logger.info("Initializing LLM for invocation", invocation_id=invocation.id)

            meta = ctx.metadata
            credential_base_url = str(meta.llm_base_url) if meta and meta.llm_base_url else None
            invocation_model = ctx.model

            # Resolve API key via deferred credential resolution (no plaintext in DB).
            # Falls back to settings.openrouter_api_key only when
            # E2E_LLM_CREDENTIAL_CONFIGURED is set (e2e testing without stored credentials).
            raw_credential_id = meta.credential_id.get_secret_value() if meta and meta.credential_id else None
            credential_api_key: str | None = None
            if raw_credential_id:
                credential_api_key = await self._resolve_llm_api_key(raw_credential_id, session)
            elif os.environ.get("E2E_LLM_CREDENTIAL_CONFIGURED"):
                _settings = get_settings()
                if _settings.openrouter_api_key:
                    credential_api_key = _settings.openrouter_api_key.get_secret_value()

            llm = get_openrouter_llm(
                api_key=credential_api_key,
                base_url=credential_base_url,
                model=invocation_model,
            )

            llm_credential_config = LLMCredentialConfig(
                api_key=credential_api_key or "",
                base_url=str(llm.openai_api_base or ""),
                model=llm.model_name,
            )

            # Pass the credential-configured LLM to the compressor so it doesn't
            # create its own (which would fail without env var).
            def compressor_factory() -> "CompressorService":
                from nexus.agent_orchestrator.context_manager.compressor import CompressorService  # noqa: PLC0415

                return CompressorService(llm=llm)

            context_manager_planner = ContextManagerPlanner(
                session_factory=self.session_factory,
                compressor_service_factory=compressor_factory,
                llm_credential_config=llm_credential_config,
            )
            service = OrchestrationService(llm=llm, context_manager_planner=context_manager_planner)
            logger.info("LLM initialized successfully for invocation", invocation_id=invocation.id)
            return service
        except LLMConfigurationError as e:
            logger.exception("LLM configuration failed for invocation", invocation_id=invocation.id)
            now = datetime.now(UTC)
            invocation.started_at = now
            invocation.status = InvocationStatus.FAILED
            invocation.error_message = str(e)
            invocation.completed_at = now
            await session.commit()
            logger.exception("Invocation failed", invocation_id=invocation.id, error_message=str(e))

            cb_url = ctx.callback_url.get_secret_value() if ctx.callback_url else None
            await WorkflowSignalClient.send_failure_signal(cb_url, invocation.id, e)
            return None

    @staticmethod
    def _record_invocation_metrics(
        recorder: MetricsRecorder,
        start_time: float,
        invocation_id: UUID,
        *,
        status: str,
        error: Exception | None = None,
    ) -> None:
        """Record invocation duration and status metrics.

        Args:
            recorder: Metrics recorder instance.
            start_time: ``time.perf_counter()`` value captured at invocation start.
            invocation_id: Invocation UUID.
            status: Outcome label (``"success"`` or ``"error"``).
            error: Optional exception for error-path labels.

        """
        duration_ms = (time.perf_counter() - start_time) * 1000
        labels: dict[str, str] = {"invocation_id": str(invocation_id), "status": status}
        recorder.record(MetricType.AGENT_INVOCATION_DURATION, duration_ms, unit="ms", labels=labels)

        status_labels = dict(labels)
        if error is not None:
            status_labels["error_type"] = type(error).__name__
        recorder.record(MetricType.AGENT_STATUS, value=1, labels=status_labels)

    async def _handle_execution_error(
        self, error: Exception, invocation_id: UUID, execution_id: UUID | None, session: AsyncSession
    ) -> None:
        """Handle execution errors by marking invocation as failed.

        Args:
            error: The exception that occurred
            invocation_id: ID of the invocation that failed
            execution_id: ID of the execution
            session: Database session

        """
        logger.exception(
            "Invocation execution failed",
            invocation_id=invocation_id,
        )
        # Rollback session to clear any pending changes from the error
        await session.rollback()

        # Re-fetch invocation to get fresh instance attached to session
        fresh_invocation = await session.get(Invocation, invocation_id)
        if fresh_invocation:
            # Mark invocation as failed
            now = datetime.now(UTC)
            # Set started_at if not already set (failure before execution started)
            if fresh_invocation.started_at is None:
                fresh_invocation.started_at = now
            fresh_invocation.status = InvocationStatus.FAILED
            fresh_invocation.error_message = str(error)
            fresh_invocation.completed_at = now
            await session.commit()

            # Dispatch FAILED event
            AuditEventDispatcher.dispatch(
                InvocationLifecycleEvent(
                    invocation_id=invocation_id,
                    execution_id=execution_id,
                    status=InvocationStatus.FAILED,
                    error_type=type(error).__name__,
                )
            )

    async def _log_conversion_failures(
        self, invocation: Invocation, ctx: InvocationContextData, session: AsyncSession
    ) -> None:
        """Log conversion failures but allow execution to proceed (FR-020).

        Queries FileMetadata records by file_ids via FileManager and logs any
        that have CONVERSION_FAILED status. This allows execution to continue
        with partial file context rather than failing entirely.

        Args:
            invocation: The invocation to check for conversion failures
            ctx: Parsed context_data model
            session: Database session for querying FileMetadata

        """
        if not ctx.file_ids:
            return

        # Convert strings to UUIDs at the boundary
        file_ids = [UUID(fid) for fid in ctx.file_ids]

        # Query FileMetadata records via FileManager
        file_metadata_records = await self.file_manager.get_files_metadata(file_ids, session)
        failed_files = [f for f in file_metadata_records if f.status == FileStatus.CONVERSION_FAILED]

        if failed_files:
            logger.warning(
                "Proceeding with invocation despite failed conversions",
                failed_conversion_count=len(failed_files),
                invocation_id=invocation.id,
                failed_files=[f.filename for f in failed_files],
            )

    @staticmethod
    async def _resolve_llm_api_key(credential_id: str, session: AsyncSession) -> str:
        """Decrypt LLM API key from credential at execution time.

        Resolves the credential from the database, decrypts its secret inputs,
        and applies injector templates to extract the ``llm_api_key``.
        This avoids storing the plaintext key in invocation context_data.

        Raises:
            LLMConfigurationError: If the credential is not found, disabled, or has no API key.

        """
        try:
            cred_uuid = UUID(credential_id)
        except ValueError as e:
            msg = f"Invalid credential ID '{credential_id}'."
            raise LLMConfigurationError(msg) from e

        credential = await session.get(Credential, cred_uuid)
        if not credential:
            msg = f"LLM credential '{credential_id}' not found."
            raise LLMConfigurationError(msg)
        if not credential.enabled:
            msg = f"LLM credential '{credential_id}' is disabled."
            raise LLMConfigurationError(msg)
        if not credential.secret_id:
            msg = f"LLM credential '{credential_id}' has no stored secret data."
            raise LLMConfigurationError(msg)

        try:
            secret_service = create_secret_service(session)
            decrypted = await secret_service.retrieve_secret(credential.secret_id)
        except Exception as e:
            msg = f"Failed to decrypt credential '{credential_id}'. It may need to be re-saved after key rotation."
            raise LLMConfigurationError(msg) from e

        cred_type = await session.get(CredentialType, credential.credential_type_id)
        if not cred_type:
            msg = f"Credential type for credential '{credential_id}' not found."
            raise LLMConfigurationError(msg)

        try:
            resolved = InjectorResolver.resolve(cred_type.injectors, decrypted)
        except Exception as e:
            msg = f"Failed to resolve credential '{credential_id}' injector templates."
            raise LLMConfigurationError(msg) from e

        api_key: str | None = resolved.extra_vars.get("llm_api_key")
        if not api_key:
            msg = f"LLM credential '{credential_id}' resolved but contains no API key."
            raise LLMConfigurationError(msg)
        return api_key


# ===================================================
# Factory function for dependency injection
# ---------------------------------------------------


def get_invocation_executor(
    session_factory: Callable[[], AsyncGenerator[AsyncSession, None]] = get_db,
) -> InvocationExecutor:
    """Create a InvocationExecutor instance with fresh dependencies.

    Args:
        session_factory: Session factory for database operations (defaults to get_db)

    Returns:
        InvocationExecutor: Fresh InvocationExecutor instance

    Example:
        invocation_executor = get_invocation_executor()
        await invocation_executor.execute_invocation(invocation_id)

    """
    return InvocationExecutor(session_factory=session_factory)


# ===================================================
