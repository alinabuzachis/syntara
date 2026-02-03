"""Agentic activity executor for workflow integration with Agent Orchestrator.

This module provides functionality to execute agentic activities within workflows,
integrating with the Agent Orchestrator service for AI-driven task execution.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import structlog
from pydantic import ValidationError
from temporalio import activity, workflow

from nexus.workflows.utils.template_resolution import resolve_config_templates
from nexus.workflows.utils.url import generate_activity_signal_url
from nexus.workflows.workflow_engine import constants
from nexus.workflows.workflow_engine.models import AgenticExecutorConfig

# See - https://github.com/temporalio/sdk-python?tab=readme-ov-file#avoiding-the-sandbox for more detail
with workflow.unsafe.imports_passed_through():
    from nexus.workflows.clients.agent_orchestrator_client import (
        AgentOrchestratorClient,
        AgentOrchestratorConnectionError,
        AgentOrchestratorError,
    )


logger = structlog.stdlib.get_logger(__name__)


# ============================================================================
# Exceptions
# ============================================================================


class AgenticActivityError(Exception):
    """Base exception for agentic activity errors."""


# ============================================================================
# Configuration and Validation
# ============================================================================


def _validate_input_data(input_data: dict[str, Any]) -> None:
    """Validate input data to prevent security issues.

    Validates:
    - Individual input value lengths (prevent memory exhaustion)
    - Total input size (prevent DoS)
    - Input values don't contain null bytes or control characters (basic sanitization)

    Args:
        input_data: Input parameters from workflow

    Raises:
        AgenticActivityError: If validation fails

    """
    if not input_data:
        return  # Empty input is valid

    total_size = 0

    for key, value in input_data.items():
        # Convert to string for validation
        str_value = str(value) if not isinstance(value, str) else value

        # Check individual value length
        value_length = len(str_value)
        if value_length > constants.MAX_INPUT_VALUE_LENGTH:
            msg = (
                f"Input value '{key}' exceeds maximum length "
                f"({value_length} > {constants.MAX_INPUT_VALUE_LENGTH} characters)"
            )
            raise AgenticActivityError(msg)

        # Check for null bytes (security risk)
        if "\0" in str_value:
            msg = f"Input value '{key}' contains null bytes (potential security risk)"
            raise AgenticActivityError(msg)

        # Accumulate total size
        total_size += value_length

    # Check total input size
    if total_size > constants.MAX_TOTAL_INPUT_SIZE:
        msg = f"Total input size exceeds maximum ({total_size} > {constants.MAX_TOTAL_INPUT_SIZE} characters)"
        raise AgenticActivityError(msg)


def _validate_resolved_prompt(prompt: str) -> None:
    """Validate resolved prompt to prevent security issues.

    Validates:
    - Prompt length (prevent memory exhaustion and DoS)
    - Prompt doesn't contain null bytes

    Args:
        prompt: Resolved prompt string

    Raises:
        AgenticActivityError: If validation fails

    """
    prompt_length = len(prompt)

    if prompt_length > constants.MAX_PROMPT_LENGTH:
        msg = f"Resolved prompt exceeds maximum length ({prompt_length} > {constants.MAX_PROMPT_LENGTH} characters)"
        raise AgenticActivityError(msg)

    if "\0" in prompt:
        msg = "Resolved prompt contains null bytes (potential security risk)"
        raise AgenticActivityError(msg)


def _extract_config(activity_config: dict[str, Any], input_data: dict[str, Any]) -> AgenticExecutorConfig:
    """Extract and validate required configuration from activity config.

    Args:
        activity_config: Activity configuration from workflow YAML
        input_data: Input parameters for expression resolution

    Returns:
        Validated AgenticExecutorConfig

    Raises:
        AgenticActivityError: If config is invalid or prompt is missing

    """
    config_dict = activity_config.get("config", {})

    # Setup workflow state for expression resolution
    workflow_state = {"inputs": input_data}

    # Resolve template expressions in config (e.g., ${input.custom_timeout} -> 60)
    resolved_config = resolve_config_templates(config_dict, workflow_state)

    try:
        # Parse and validate using Pydantic model
        config = AgenticExecutorConfig(**resolved_config)
    except ValidationError as e:
        msg = f"Invalid agentic activity configuration: {e}"
        raise AgenticActivityError(msg) from e

    # Additional validation: prompt must not be empty or whitespace-only
    if not config.prompt.strip():
        msg = "Agentic activity requires non-empty 'config.prompt' field"
        raise AgenticActivityError(msg)

    return config


# ============================================================================
# Temporal Activity
# ============================================================================


@activity.defn
async def execute_agentic_activity(
    activity_config: dict[str, Any],
    input_data: dict[str, Any],
) -> dict[str, Any]:
    """Execute agentic activity by invoking Agent Orchestrator.

    This is a Temporal activity that can also be called directly for testing.

    Args:
        activity_config: Activity configuration from workflow YAML containing:
            - config.prompt: Prompt template (required)
            - config.agent: Agent identifier for routing (optional)
            - config.model: Model identifier (optional)
            - config.fileIds: List of file IDs for context (optional)
        input_data: Runtime input parameters for the activity

    Returns:
        Full invocation response from Agent Orchestrator containing:
            - id: Invocation ID
            - status: Invocation status (completed, failed, cancelled)
            - result: Agent result (if completed successfully)
            - error_message: Error message (if failed)
            - Plus other metadata fields

    Raises:
        AgenticActivityError: If required config is missing or execution fails
        AgentOrchestratorConnectionError: If connection fails

    """
    # Propagate correlation ID from workflow context if available, otherwise generate new one
    correlation_id = activity_config.get("metadata", {}).get("correlation_id") or str(uuid4())
    logger.info("Starting agentic activity", correlation_id=correlation_id)

    # Validate input data for security (prevent injection, DoS, etc.)
    _validate_input_data(input_data)

    # Extract and validate configuration (resolves template expressions)
    config = _extract_config(activity_config, input_data)

    # Prompt is already resolved in _extract_config, just validate it
    _validate_resolved_prompt(config.prompt)

    # Extract file_ids from config (empty list if not specified)
    file_ids = config.file_ids if config.file_ids else []

    # Get workflow info for audit trail (if running in Temporal context)
    try:
        activity_info = activity.info()
        workflow_id = activity_info.workflow_id
    except RuntimeError:
        # Not in activity context (e.g., tests or direct invocation)
        workflow_id = "direct-invocation"

    # Use system user ID for workflow-initiated invocations, until users have been added/integrated
    user_id = str(constants.SYSTEM_USER_ID)

    # Generate callback URL if execution context is available
    callback_url = None
    execution_id_str = activity_config.get("metadata", {}).get("execution_id")
    activity_id = activity_config.get("metadata", {}).get("activity_id")

    if execution_id_str and activity_id:
        try:
            execution_id = UUID(execution_id_str)
            callback_url = generate_activity_signal_url(execution_id, activity_id)
            logger.info(
                "Generated callback URL for activity",
                correlation_id=correlation_id,
                callback_url=callback_url,
            )
        except (ValueError, TypeError) as e:
            logger.warning(
                "Failed to generate callback URL",
                correlation_id=correlation_id,
                error=str(e),
            )

    logger.info(
        "Invoking Agent Orchestrator",
        correlation_id=correlation_id,
        user_id=user_id,
        agent=config.agent,
        model=config.model,
        file_count=len(file_ids),
        has_callback=callback_url is not None,
    )

    # Use context manager for automatic resource cleanup
    async with AgentOrchestratorClient(base_url=constants.AGENT_ORCHESTRATOR_BASE_URL) as agent_client:
        try:
            # Build metadata with callback URL if available
            agent_metadata = {
                "activity_name": activity_config.get("name", "unknown"),
                "workflow_id": workflow_id,
            }
            if callback_url:
                agent_metadata["callback_url"] = callback_url

            # Invoke agent asynchronously - returns immediately with invocation ID
            # The workflow will wait for a signal with the actual result
            logger.info(
                "Invoking agent asynchronously",
                correlation_id=correlation_id,
                callback_url=callback_url,
            )

            invocation_id = await agent_client.invoke_agent_async(
                prompt=config.prompt,
                user_id=user_id,
                agent=config.agent,
                model=config.model,
                input_data=input_data,
                file_ids=file_ids,
                metadata=agent_metadata,
                correlation_id=correlation_id,
            )

            logger.info(
                "Agent invocation created successfully",
                correlation_id=correlation_id,
                invocation_id=invocation_id,
                callback_url=callback_url,
            )

            # Return metadata for the workflow to track
            # The workflow will wait for a signal with the actual result
            result = {
                "activity_id": activity_id,
                "invocation_id": invocation_id,
                "status": "running",
                "callback_url": callback_url,
                "correlation_id": correlation_id,
            }

            logger.info(
                "Returning from agentic activity - workflow will now wait for signal",
                correlation_id=correlation_id,
                invocation_id=invocation_id,
            )

            return result

        except AgentOrchestratorConnectionError:
            logger.exception("Failed to connect to Agent Orchestrator", correlation_id=correlation_id)
            raise

        except AgentOrchestratorError as e:
            logger.exception("Agent Orchestrator error", correlation_id=correlation_id)
            msg = f"Agent Orchestrator error: {e}"
            raise AgenticActivityError(msg) from e

        except Exception as e:
            logger.exception("Unexpected error during agentic activity", correlation_id=correlation_id)
            msg = f"Unexpected error: {e}"
            raise AgenticActivityError(msg) from e
