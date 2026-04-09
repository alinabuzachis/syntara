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

from nexus.workflows.workflow_engine import constants
from nexus.workflows.workflow_engine.models import AgenticExecutorConfig

from .common import ActivityExecutionError
from .output_mapping import apply_output_mapping

# See - https://github.com/temporalio/sdk-python?tab=readme-ov-file#avoiding-the-sandbox for more detail
with workflow.unsafe.imports_passed_through():
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


@activity.defn(name="execute_agentic_activity")
async def execute_agentic_activity(
    input_config: dict[str, Any],
    output_config: dict[str, str] | None,
    execution_id: str = "",
) -> dict[str, Any]:
    """V2 agentic activity with normalized signature.

    Args:
        input_config: Activity configuration containing prompt, agent, model, etc.
        output_config: Output mapping configuration
        execution_id: Workflow execution ID for callback URL generation

    Returns:
        dict with keys:
            - output: Mapped output containing invocation metadata

    """
    correlation_id = str(uuid4())
    logger.info("Starting agentic activity (v2)", correlation_id=correlation_id)

    try:
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

        # Generate callback URL for the agent orchestrator to signal back results
        callback_url = generate_activity_signal_url(UUID(execution_id), activity_id) if execution_id else ""

        logger.info(
            "Invoking Agent Orchestrator",
            correlation_id=correlation_id,
            user_id=user_id,
            agent=config.agent,
            model=config.model,
            file_count=len(file_ids),
        )

        async with AgentOrchestratorClient(base_url=constants.AGENT_ORCHESTRATOR_BASE_URL) as agent_client:
            # Build metadata (callback_url is extracted by client into contextData)
            agent_metadata: dict[str, Any] = {
                "activity_name": "agentic_v2",
                "workflow_id": workflow_id,
            }
            if callback_url:
                agent_metadata["callback_url"] = callback_url

            # Invoke agent asynchronously
            invocation_id = await agent_client.invoke_agent_async(
                prompt=config.prompt,
                user_id=user_id,
                agent=config.agent,
                model=config.model,
                input_data={},  # input_data is part of prompt in v2
                file_ids=file_ids,
                metadata=agent_metadata,
                correlation_id=correlation_id,
            )

            logger.info(
                "Agent invocation created successfully",
                correlation_id=correlation_id,
                invocation_id=invocation_id,
            )

            # Return metadata
            full_result = {
                "status": "completed",
                "activity_id": activity_id,
                "invocation_id": invocation_id,
                "callback_url": callback_url,
                "correlation_id": correlation_id,
            }

            mapped_output = apply_output_mapping(full_result, output_config)
            return {"output": mapped_output}

    except ValidationError as e:
        full_result = {
            "status": "failed",
            "error": f"Invalid configuration: {e}",
        }
        mapped_output = apply_output_mapping(full_result, output_config)
        return {"output": mapped_output}

    except AgentOrchestratorClientConnectionError as e:
        logger.exception("Failed to connect to Agent Orchestrator", correlation_id=correlation_id)
        full_result = {
            "status": "failed",
            "error": f"Failed to connect to Agent Orchestrator: {e}",
        }
        mapped_output = apply_output_mapping(full_result, output_config)
        return {"output": mapped_output}

    except Exception as e:
        logger.exception("Unexpected error during agentic activity", correlation_id=correlation_id)
        full_result = {
            "status": "failed",
            "error": f"Unexpected error: {e}",
        }
        mapped_output = apply_output_mapping(full_result, output_config)
        return {"output": mapped_output}
