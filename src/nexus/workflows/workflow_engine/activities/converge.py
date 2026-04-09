"""Converge node activity for v2 workflows."""

from typing import Any

import structlog
from temporalio import activity

from .output_mapping import apply_output_mapping

logger = structlog.stdlib.get_logger(__name__)


@activity.defn(name="converge")
async def converge(
    input_config: dict[str, Any],  # noqa: ARG001
    output_config: dict[str, str] | None,
    predecessor_results: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Execute converge node - waits for all predecessors to complete.

    The actual waiting logic is handled by the workflow executor.
    This activity just merges the results from all predecessors.

    Returns normalized structure with output portion only (no control needed).
    Output mapping is applied internally before returning to avoid storing suppressed fields in Temporal.

    Note: Currently only strategy "all" is supported (waits for all concurrent paths).
    The input_config parameter is reserved for future use.

    Args:
        input_config: Converge node configuration (currently unused - only strategy "all" supported)
        output_config: Output mapping configuration (field_name -> template expression)
                       None = return full result, {} = suppress all, {...} = extract specific fields
        predecessor_results: Results from all predecessor nodes that completed

    Returns:
        {
            "output": {
                "status": "completed",
                "converged_from": [...],
                "results": {...}
            }
        }

    """
    # Currently only supports strategy "all" - waits for all predecessors
    # Future: could support config["strategy"] = "any" or "n_required"

    # Result conforming to converge.schema.json resultSchema
    completed_branch_ids = list(predecessor_results.keys())
    full_result = {
        "status": "completed",
        "branch_count": len(completed_branch_ids),
        "completed_count": len(completed_branch_ids),  # Same for "all" strategy
        "completed_branch_node_ids": completed_branch_ids,
    }

    # Apply output mapping (suppresses fields before Temporal stores it)
    mapped_output = apply_output_mapping(full_result, output_config)

    return {"output": mapped_output}
