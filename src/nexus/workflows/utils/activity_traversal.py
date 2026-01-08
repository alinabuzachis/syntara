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


def _process_nested_structures(
    activity: Any,  # noqa: ANN401
    callback: Callable[[list[Any]], None],
) -> None:
    """Process all nested structures in an activity with a callback function.

    This helper consolidates processing of steps, branches, then/else, and loop structures
    to reduce cognitive complexity in functions that recursively traverse activities.

    Args:
        activity: Activity object or dict to process
        callback: Function to call with each nested activity list

    """
    steps = _get_field(activity, "steps")
    if steps:
        callback(steps)

    branches = _get_field(activity, "branches")
    if branches:
        callback(branches)

    then_branch = _get_field(activity, "then")
    if then_branch:
        callback(then_branch)

    else_branch = _get_field(activity, "else_", fallback_key="else")
    if else_branch:
        callback(else_branch)

    loop = _get_field(activity, "loop")
    if loop:
        loop_do = _get_field(loop, "do")
        if loop_do:
            callback(loop_do)


def _collect_branch_activities(
    branch_activities: list[Any],
    condition_id: str,
    branch_type: str,
    condition_def: dict[str, Any],
    branch_map: dict[str, dict[str, Any]],
) -> None:
    """Recursively collect all activities in a branch and map them to the condition."""
    for activity in branch_activities:
        activity_type = _get_field(activity, "type")
        activity_id = _get_field(activity, "id")

        if activity_type in ["task", "condition", None] and activity_id:
            branch_map[activity_id] = {
                "condition_id": condition_id,
                "branch": branch_type,
                "condition_def": condition_def,
            }

        steps = _get_field(activity, "steps")
        if steps:
            _collect_branch_activities(steps, condition_id, branch_type, condition_def, branch_map)

        branches = _get_field(activity, "branches")
        if branches:
            _collect_branch_activities(branches, condition_id, branch_type, condition_def, branch_map)

        loop = _get_field(activity, "loop")
        if loop:
            loop_do = _get_field(loop, "do")
            if loop_do:
                _collect_branch_activities(loop_do, condition_id, branch_type, condition_def, branch_map)


def _process_condition_branches(
    activity: Any,  # noqa: ANN401
    activity_id: str,
    branch_map: dict[str, dict[str, Any]],
) -> None:
    """Process then/else branches of a condition activity."""
    then_branch = _get_field(activity, "then")
    if then_branch:
        _collect_branch_activities(then_branch, activity_id, "then", activity, branch_map)

    else_branch = _get_field(activity, "else_", fallback_key="else")
    if else_branch:
        _collect_branch_activities(else_branch, activity_id, "else", activity, branch_map)


def _process_activities_for_conditions(
    activities_list: list[Any],
    branch_map: dict[str, dict[str, Any]],
) -> None:
    """Process activities recursively to find condition nodes and map their branches."""
    for activity in activities_list:
        activity_type = _get_field(activity, "type")
        activity_id = _get_field(activity, "id")

        if activity_type == "condition" and activity_id:
            _process_condition_branches(activity, activity_id, branch_map)

        _process_nested_structures(
            activity,
            lambda nested: _process_activities_for_conditions(nested, branch_map),
        )


def build_branch_head_map(
    activities: list[Any],
) -> dict[str, dict[str, Any]]:
    """Build a map of activities to their parent condition branches.

    This creates a mapping that allows O(1) lookup to determine if an activity
    is inside a condition branch, and if so, which branch and condition.

    When an activity from a branch starts executing, we can immediately identify
    the untriggered opposite branch and mark all its activities as SKIPPED.

    Args:
        activities: List of activities (dicts from workflow definition)

    Returns:
        Dictionary mapping activity_id to {
            "condition_id": parent condition ID,
            "branch": "then" or "else",
            "condition_def": full condition definition (for getting opposite branch)
        }

    Example:
        >>> activities = [{
        ...     "id": "cond1",
        ...     "type": "condition",
        ...     "then": [{"id": "task1", "type": "task"}],
        ...     "else": [{"id": "task2", "type": "task"}]
        ... }]
        >>> build_branch_head_map(activities)
        {
            "task1": {"condition_id": "cond1", "branch": "then", "condition_def": {...}},
            "task2": {"condition_id": "cond1", "branch": "else", "condition_def": {...}}
        }

    """
    branch_map: dict[str, dict[str, Any]] = {}
    _process_activities_for_conditions(activities, branch_map)
    return branch_map


def collect_branch_activity_ids(branch_activities: list[Any]) -> list[str]:
    """Collect all activity IDs from a branch, recursively including nested activities.

    Only includes task activities and condition nodes (not sequence/parallel/loop containers).
    This is used to identify activities that should be marked as SKIPPED when a condition
    branch is not taken.

    Args:
        branch_activities: List of activities in a branch (dicts from workflow definition)

    Returns:
        List of activity IDs (includes nested activities from all control flow structures)

    Example:
        >>> branch = [
        ...     {"id": "task1", "type": "task"},
        ...     {"id": "cond1", "type": "condition",
        ...      "then": [{"id": "task2", "type": "task"}],
        ...      "else": [{"id": "task3", "type": "task"}]}
        ... ]
        >>> collect_branch_activity_ids(branch)
        ["task1", "cond1", "task2", "task3"]

    """
    ids: list[str] = []

    for activity in branch_activities:
        activity_type = _get_field(activity, "type")
        activity_id = _get_field(activity, "id")

        if activity_type in ["task", "condition", None] and activity_id:
            ids.append(activity_id)

        _process_nested_structures(
            activity,
            lambda nested: ids.extend(collect_branch_activity_ids(nested)),
        )

    return ids
