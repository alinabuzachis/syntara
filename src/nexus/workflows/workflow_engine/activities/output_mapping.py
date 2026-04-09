"""Shared utility for applying output mapping in activities."""

from typing import Any

from nexus.workflows.utils.namespace_resolver import NamespaceResolver


def apply_output_mapping(result: dict[str, Any], output_config: dict[str, str] | None) -> dict[str, Any]:
    """Apply output mapping to activity result.

    Used by activities to map output before returning to workflow.
    This ensures Temporal doesn't store suppressed fields in event history.

    Mapping rules:
    - If status is "failed", return the result unchanged (ignore output mapping)
    - If output_config is None, return the result unchanged
    - If output_config is {} (empty), return only {"status": "completed"}
    - If output_config has mappings, extract only mapped fields + status

    Args:
        result: Activity result data
        output_config: Optional output mapping (field_name -> template expression)
                       None = no mapping (return full result)
                       {} = suppress all outputs (return only status)
                       {...} = extract specific fields

    Returns:
        Mapped result

    """
    # If failed, return result as-is (ignore output mapping)
    if result.get("status") != "completed":
        return result

    # If no output mapping defined, return result as-is
    if output_config is None:
        return result

    # Status is completed and output mapping is defined
    # If output_config is empty {}, return only status (suppress all fields)
    if not output_config:
        return {"status": "completed"}

    # Extract mapped fields
    temp_resolver = NamespaceResolver()
    temp_resolver.set_namespace("result", result)

    mapped_result: dict[str, Any] = {"status": "completed"}
    for output_key, template_expr in output_config.items():
        try:
            mapped_result[output_key] = temp_resolver.resolve_value(template_expr)
        except (KeyError, AttributeError, TypeError) as exc:
            return {
                "status": "failed",
                "error": {
                    "type": "OutputMappingError",
                    "message": f"Failed to resolve output mapping '{template_expr}': {exc}",
                },
            }

    return mapped_result
