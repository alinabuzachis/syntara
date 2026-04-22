"""Loop activity implementation (for_each and do_while)."""

from typing import Any

import structlog
from temporalio import activity

from nexus.workflows.workflow_engine import constants
from nexus.workflows.workflow_engine.models.workflow_definition import ActivityName

from .output_mapping import apply_output_mapping

logger = structlog.stdlib.get_logger(__name__)


@activity.defn(name=ActivityName.LOOP)
async def loop(
    input_config: dict[str, Any],
    output_config: dict[str, str] | None,
    iteration_results: dict[str, list[Any]],
) -> dict[str, Any]:
    """Loop activity that iterates over a collection or condition.

    Input config (for_each):
    - type: "for_each"
    - items: List of items to iterate over
    - current_index: Current iteration index (managed by workflow engine)

    Input config (do_while):
    - type: "do_while"
    - current_index: Current iteration index
    - condition_result: Boolean result of condition evaluation (None on first iteration)
    - max_iterations: Maximum iteration limit

    Args:
        input_config: Loop configuration
        output_config: Output mapping configuration
        iteration_results: Aggregated results from previous iterations

    Returns:
    - output: Mapped output containing iteration metadata
    - control: next_port ("iterate" or "complete") and loop state

    """
    loop_type = input_config.get("type", "for_each")
    current_index = input_config.get("current_index", 0)

    if loop_type == "for_each":
        items = input_config.get("items") or []
        if not isinstance(items, list):
            return {
                "output": {
                    "status": "failed",
                    "error": {
                        "type": "ConfigError",
                        "message": f"'items' must be a list, got {type(items).__name__}",
                    },
                },
                "control": {"next_port": "complete"},
            }

        # Check if we have more items to process
        if current_index < len(items):
            current_item = items[current_index]
            next_port = "iterate"
            next_index = current_index + 1
        else:
            current_item = None
            next_port = "complete"
            next_index = current_index

        # Build full result conforming to resultSchema
        full_result = {
            "status": "completed",
            "iteration_count": current_index,
        }

        # Only include iteration_results if loop is complete
        if next_port == "complete":
            full_result["iteration_results"] = iteration_results

        # Apply output mapping
        mapped_output = apply_output_mapping(full_result, output_config)

        # Return with control data
        return {
            "output": mapped_output,
            "control": {
                "next_port": next_port,
                "next_index": next_index,
                "items": items,
                "current_item": current_item,
                "current_index": current_index,
            },
        }

    if loop_type == "do_while":
        condition_result = input_config.get("condition_result")
        max_iterations = input_config.get("max_iterations", constants.MAX_LOOP_ITERATIONS)

        # First iteration always executes (do-while semantic)
        # After first iteration, check condition and max_iterations
        if current_index == 0:
            # First iteration - always iterate
            next_port = "iterate"
            next_index = current_index + 1
        elif condition_result is True and current_index < max_iterations:
            # Condition is true and haven't hit limit - continue
            next_port = "iterate"
            next_index = current_index + 1
        else:
            # Condition is false OR max iterations reached - complete
            next_port = "complete"
            next_index = current_index

        # Build full result conforming to resultSchema
        full_result = {
            "status": "completed",
            "iteration_count": current_index,
        }

        # Only include iteration_results if loop is complete
        if next_port == "complete":
            full_result["iteration_results"] = iteration_results

        # Apply output mapping
        mapped_output = apply_output_mapping(full_result, output_config)

        # Return with control data
        return {
            "output": mapped_output,
            "control": {
                "next_port": next_port,
                "next_index": next_index,
                "current_index": current_index,
            },
        }

    return {
        "output": {
            "status": "failed",
            "error": {
                "type": "ConfigError",
                "message": f"Unknown loop type: {loop_type}",
            },
        },
        "control": {"next_port": "complete"},
    }
