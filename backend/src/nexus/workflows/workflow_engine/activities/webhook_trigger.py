"""Webhook trigger activity for v2 workflows.

Receives the webhook payload forwarded from the webhook reception endpoint
and passes it through as the trigger output. Payload validation (JSON Schema)
is performed upstream in the webhook router before the workflow is started.
"""

from typing import Any

import structlog
from temporalio import activity

from nexus.workflows.workflow_engine.models.workflow_definition import ActivityName

from .output_mapping import apply_output_mapping

logger = structlog.stdlib.get_logger(__name__)


@activity.defn(name=ActivityName.WEBHOOK_TRIGGER)
async def webhook_trigger(
    input_config: dict[str, Any],
    output_config: dict[str, str] | None,
) -> dict[str, Any]:
    """Execute webhook trigger node.

    Returns normalized structure with output portion (no control needed for triggers).
    Output mapping is applied internally before returning to avoid storing suppressed
    fields in Temporal.

    Note: For webhook triggers, input_config contains the webhook payload wrapped
    as {"payload": <request_body>}. JSON Schema validation happens before workflow
    start (in the webhook router), so this is a pass-through.

    Args:
        input_config: Webhook payload data (pre-validated by the webhook router)
        output_config: Output mapping configuration (field_name -> template expression)
                       None = return full result, {} = suppress all, {...} = extract specific fields

    Returns:
        {
            "output": {
                "status": "completed",
                ...input_config  # Only if not suppressed by output_config
            }
        }

    """
    logger.info("Executing webhook trigger", payload_keys=list(input_config.keys()) if input_config else [])

    mapped_output = apply_output_mapping(input_config, output_config)

    return {"output": mapped_output}
