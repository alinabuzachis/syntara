"""Agentic activity executor for workflow integration with Agent Orchestrator.

This module provides functionality to execute agentic activities within workflows,
integrating with the Agent Orchestrator service for AI-driven task execution.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import structlog
from pydantic import ValidationError
from temporalio import activity, workflow

from nexus.settings.cache.settings_cache import get_runtime_settings
from nexus.workflows.workflow_engine import constants
from nexus.workflows.workflow_engine.models import AgenticExecutorConfig
from nexus.workflows.workflow_engine.models.workflow_definition import ActivityName
from nexus.workflows.workflow_engine.utils.credential_scrubber import ensure_resolved_credentials_dict

from .common import ActivityExecutionError
from .output_mapping import apply_output_mapping

# See - https://github.com/temporalio/sdk-python?tab=readme-ov-file#avoiding-the-sandbox for more detail
with workflow.unsafe.imports_passed_through():
    from nexus.auth import create_service_token
    from nexus.workflows.clients.agent_orchestrator_client import (
        AgentOrchestratorClient,
        AgentOrchestratorClientConnectionError,
    )
    from nexus.workflows.utils.url import generate_activity_signal_url


logger = structlog.stdlib.get_logger(__name__)


# ============================================================================
# Exceptions
# ============================================================================


class AgenticActivityError(ActivityExecutionError):
    """Base exception for agentic activity errors."""


# ============================================================================
# Temporal Activity
# ============================================================================


async def _inject_runtime_settings(input_config: dict[str, Any]) -> None:
    """Inject live runtime settings into agentic activity config.

    Raises:
        ValueError: If the prompt exceeds the configured max length.

    """
    cache = get_runtime_settings()
    if "timeout" not in input_config:
        input_config["timeout"] = await cache.get_int("workflow_engine.agentic_timeout_seconds")

    prompt = input_config.get("prompt", "")
    if isinstance(prompt, str):
        max_len = await cache.get_int("workflow_engine.max_prompt_length")
        if len(prompt) > max_len:
            msg = f"Prompt exceeds maximum length ({len(prompt)} > {max_len} characters)"
            raise ValueError(msg)


@activity.defn(name=ActivityName.AGENTIC)
async def execute_agentic_activity(
    input_config: dict[str, Any],
    output_config: dict[str, str] | None,
    execution_id: str = "",
    request_id: str | None = None,
) -> dict[str, Any]:
    """V2 agentic activity with async completion.

    On successful dispatch, calls raise_complete_async() so the activity stays
    STARTED in Temporal until the agent orchestrator calls back with results.
    Pre-dispatch failures return synchronously to avoid retry-induced duplicates.

    Args:
        input_config: Activity configuration containing prompt, agent, model, etc.
        output_config: Output mapping configuration
        execution_id: Workflow execution ID for callback URL generation
        request_id: Optional X-Request-Id (UUID) from the originating HTTP request

    """
    logger.info("Starting agentic activity (v2)")

    try:
        try:
            await _inject_runtime_settings(input_config)
        except ValueError as e:
            full_result = {"status": "failed", "error": str(e)}
            mapped_output = apply_output_mapping(full_result, output_config)
            return {"output": mapped_output}

        # Validate config
        config = AgenticExecutorConfig.model_validate(input_config)

        # Validate prompt
        if not config.prompt.strip():
            full_result = {
                "status": "failed",
                "error": "Agentic activity requires non-empty 'prompt' field",
            }
            mapped_output = apply_output_mapping(full_result, output_config)
            return {"output": mapped_output}

        # Extract file_ids from config
        file_ids = config.file_ids or []

        # Get workflow info for audit trail
        try:
            activity_info = activity.info()
            workflow_id = activity_info.workflow_id
            activity_id = activity_info.activity_id
        except RuntimeError:
            workflow_id = "direct-invocation"
            activity_id = "unknown"

        # Use system user ID
        user_id = str(constants.SYSTEM_USER_ID)

        # Mint a short-lived service JWT for internal API calls
        service_token = create_service_token()

        # Generate callback URL for the agent orchestrator to signal back results
        callback_url = generate_activity_signal_url(UUID(execution_id), activity_id) if execution_id else ""

        logger.info(
            "Invoking Agent Orchestrator",
            user_id=user_id,
            agent=config.agent,
            model=config.model,
            file_count=len(file_ids),
        )

        async with AgentOrchestratorClient(
            base_url=constants.AGENT_ORCHESTRATOR_BASE_URL,
            auth_token=service_token,
        ) as agent_client:
            # Build metadata (callback_url is extracted by client into contextData)
            agent_metadata: dict[str, Any] = {
                "activity_name": "agentic_v2",
                "workflow_id": workflow_id,
            }
            if callback_url:
                agent_metadata["callback_url"] = callback_url
            if request_id:
                agent_metadata["request_id"] = request_id

            # Inject LLM credential if resolved from Nexus credential system
            _inject_llm_credential_metadata(agent_metadata, input_config)

            # Pass response_schema if defined
            if config.response_schema:
                agent_metadata["response_schema"] = config.response_schema

            # Invoke agent asynchronously
            invocation_id = await agent_client.invoke_agent_async(
                prompt=config.prompt,
                user_id=user_id,
                agent=config.agent,
                model=config.model,
                input_data={},  # input_data is part of prompt in v2
                file_ids=file_ids,
                metadata=agent_metadata,
            )

            logger.info(
                "Agent invocation created successfully",
                invocation_id=invocation_id,
            )

            activity.raise_complete_async()

    # NOTE: All exceptions return a success-shaped response intentionally.
    # This is a fire-and-forget pattern: the activity creates an async invocation
    # and returns metadata. The actual AI work completes via callback signal.
    # Raising exceptions here would trigger Temporal retries, creating duplicate
    # invocations. The "status: failed" field is consumed by downstream workflow
    # logic. Compare with credential_resolution_activity.py which IS synchronous
    # and correctly raises ApplicationError for Temporal retries.
    except ValidationError as e:
        full_result = {
            "status": "failed",
            "error": f"Invalid configuration: {e}",
        }
        mapped_output = apply_output_mapping(full_result, output_config)
        return {"output": mapped_output}

    except AgentOrchestratorClientConnectionError as e:
        logger.exception("Failed to connect to Agent Orchestrator")
        full_result = {
            "status": "failed",
            "error": f"Failed to connect to Agent Orchestrator: {e}",
        }
        mapped_output = apply_output_mapping(full_result, output_config)
        return {"output": mapped_output}

    except Exception as e:
        logger.exception("Unexpected error during agentic activity")
        full_result = {
            "status": "failed",
            "error": f"Unexpected error: {e}",
        }
        mapped_output = apply_output_mapping(full_result, output_config)
        return {"output": mapped_output}


def _inject_llm_credential_metadata(metadata: dict[str, Any], input_data: dict[str, Any]) -> None:
    """Inject LLM credential reference into agent metadata from resolved credentials.

    Passes ``credential_id`` for deferred resolution at execution time — the
    decrypted API key is never stored in invocation context_data.  Non-secret
    fields (provider, base_url) are still passed directly.

    Args:
        metadata: Mutable agent metadata dict to update.
        input_data: Activity input data potentially containing _resolved_credentials.

    """
    resolved_creds = input_data.get("_resolved_credentials")
    if not resolved_creds:
        return
    resolved_creds = ensure_resolved_credentials_dict(resolved_creds)
    # Pass credential_id for deferred resolution — NOT the decrypted key
    cred_id = resolved_creds.get("credential_id")
    if cred_id:
        metadata["credential_id"] = cred_id
    # Still pass non-secret fields
    extra_vars = resolved_creds.get("extra_vars", {})
    for key in ("llm_provider", "llm_base_url"):
        value = extra_vars.get(key)
        if value:
            metadata[key] = value
