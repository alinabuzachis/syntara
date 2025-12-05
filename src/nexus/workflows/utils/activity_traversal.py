"""Utilities for traversing activity trees in workflow definitions.

This module provides shared utilities for recursively traversing nested activity
structures, supporting all activity types: task, sequence, parallel, condition, loop, converge.
"""

from collections.abc import Callable
from typing import Any


def traverse_activities[T](
    activities: list[Any],
    callback: Callable[[Any, str], T | None],
    path: str = "workflow",
) -> list[T]:
    """Recursively traverse activity tree and apply callback to each activity.

    This function handles all activity types and their nested structures:
    - Sequences: `steps` field
    - Parallels: `branches` field
    - Conditions: `then` and `else` fields
    - Loops: `do` field inside `loop` object

    Works with both Pydantic Activity objects and dict representations.

    Args:
        activities: List of activities (Pydantic objects or dicts)
        callback: Function to apply to each activity (receives activity, path).
                 Should return a value to collect, or None to skip.
        path: Current path in activity tree (for error reporting/tracking)

    Returns:
        List of non-None results from callback invocations

    Example:
        # Collect IDs with paths (for validation)
        >>> results = traverse_activities(
        ...     activities,
        ...     lambda act, path: (act.id if hasattr(act, 'id') else act['id'], path)
        ... )

        # Build lookup map (for database queries)
        >>> activity_map = {}
        >>> traverse_activities(
        ...     activities,
        ...     lambda act, path: activity_map.update({act['id']: act}) if 'id' in act else None
        ... )

    """
    results: list[T] = []

    for idx, activity in enumerate(activities):
        current_path = f"{path}.activities[{idx}]"

        # Apply callback to this activity
        result = callback(activity, current_path)
        if result is not None:
            results.append(result)

        # Recursively process nested activities
        # Handle both Pydantic objects (hasattr) and dicts (dict.get)

        # Sequences have 'steps'
        steps = _get_field(activity, "steps")
        if steps:
            results.extend(traverse_activities(steps, callback, f"{current_path}.steps"))

        # Parallels have 'branches'
        branches = _get_field(activity, "branches")
        if branches:
            results.extend(traverse_activities(branches, callback, f"{current_path}.branches"))

        # Conditions have 'then' and 'else'
        then_branch = _get_field(activity, "then")
        if then_branch:
            results.extend(traverse_activities(then_branch, callback, f"{current_path}.then"))

        # Handle 'else' field (note: Pydantic uses 'else_' internally)
        else_branch = _get_field(activity, "else_", fallback_key="else")
        if else_branch:
            results.extend(traverse_activities(else_branch, callback, f"{current_path}.else"))

        # Loops have 'do' inside 'loop' object
        loop = _get_field(activity, "loop")
        if loop:
            loop_do = _get_field(loop, "do")
            if loop_do:
                results.extend(traverse_activities(loop_do, callback, f"{current_path}.loop.do"))

    return results


def _get_field(obj: Any, field_name: str, fallback_key: str | None = None) -> Any:  # noqa: ANN401
    """Get field value from Pydantic object or dict.

    Args:
        obj: Pydantic object or dict
        field_name: Primary field name to try
        fallback_key: Alternative key to try for dicts (e.g., 'else' when field_name is 'else_')

    Returns:
        Field value, or None if not found

    """
    # Try as Pydantic object attribute
    if hasattr(obj, field_name):
        return getattr(obj, field_name, None)

    # Try as dict with primary key
    if isinstance(obj, dict):
        value = obj.get(field_name)
        if value is not None:
            return value

        # Try fallback key if provided
        if fallback_key is not None:
            return obj.get(fallback_key)

    return None
