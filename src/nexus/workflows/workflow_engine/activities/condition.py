"""Condition node activity for v2 workflows."""

from typing import Any

from temporalio import activity

from nexus.workflows.workflow_engine.expression_resolver import safe_eval_condition

from .output_mapping import apply_output_mapping


@activity.defn(name="condition")
async def condition(
    input_config: dict[str, Any],
    output_config: dict[str, str] | None,
) -> dict[str, Any]:
    """Execute condition node - evaluate expression and determine routing.

    Returns normalized structure with output and control portions:
    - output: User-facing evaluation result (subject to output mapping)
    - control: Workflow routing data (next_port, never mapped or suppressed)

    Output mapping is applied internally before returning to avoid storing suppressed fields in Temporal.

    Args:
        input_config: Condition node configuration with "condition" expression
        output_config: Output mapping configuration (field_name -> template expression)
                       None = return full result, {} = suppress all, {...} = extract specific fields

    Returns:
        {
            "output": {
                "status": "completed",
                "evaluated_result": bool  # Only if not suppressed
            },
            "control": {
                "next_port": "true" | "false"
            }
        }

    """
    condition_expr = input_config.get("condition", "")

    if not condition_expr:
        # Failed result conforming to baseFailedResult schema
        return {
            "output": {
                "status": "failed",
                "error": {
                    "type": "ConfigurationError",
                    "message": "Missing 'condition' in config",
                },
            }
        }

    try:
        evaluated_result = safe_eval_condition(condition_expr)

        # Full result before mapping (conforms to resultSchema for completed)
        full_result = {
            "status": "completed",
            "evaluated_result": evaluated_result,
        }

        # Apply output mapping (suppresses fields before Temporal stores it)
        mapped_output = apply_output_mapping(full_result, output_config)

        return {
            "output": mapped_output,
            "control": {
                "next_port": "true" if evaluated_result else "false",
            },
        }

    except (ValueError, KeyError, AttributeError, TypeError, RuntimeError) as e:
        # Failed result conforming to baseFailedResult schema
        error_result = {
            "status": "failed",
            "error": {
                "type": "ConditionEvaluationError",
                "message": f"Failed to evaluate condition '{condition_expr}': {e!s}",
            },
        }
        # No mapping on failures
        return {"output": error_result}
