"""Label filtering utilities for key-value label matching.

This module provides functions for matching resources by label key-value pairs
using AND logic (all filter labels must match).
"""

import re
from typing import Any, TypeVar

from sqlalchemy import Select, and_, func
from sqlmodel import SQLModel
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from nexus.core import BaseResource

# Type variable for generic Query/Select type
TP = TypeVar("TP", bound=tuple[Any, ...])

# Regex pattern to match label filter parameters: labels[key]
LABEL_PARAM_PATTERN = re.compile(r"^labels\[([^]]+)\]$")


def matches(resource_labels: dict[str, str] | None, filter_labels: dict[str, str]) -> bool:
    """Check if resource labels match filter criteria.

    Args:
        resource_labels: Labels on the resource (can be None)
        filter_labels: Label criteria to match against

    Returns:
        True if all filter labels exist in resource labels with matching values

    Examples:
        >>> matches(
        ...     {"env": "prod", "region": "us-east-1", "team": "platform"},
        ...     {"env": "prod", "region": "us-east-1"}
        ... )
        True

        >>> matches(
        ...     {"env": "staging"},
        ...     {"env": "prod"}
        ... )
        False

        >>> matches(None, {})
        True

    """
    # Empty filter matches any resource
    if not filter_labels:
        return True

    # None or empty resource labels can't match non-empty filter
    if not resource_labels:
        return False

    # All filter labels must exist in resource labels with exact values
    return all(resource_labels.get(filter_key) == filter_value for filter_key, filter_value in filter_labels.items())


def parse_label_filter(params: dict[str, str]) -> dict[str, str]:
    """Parse label filter parameters from query parameters.

    Extracts label filters from parameters with the pattern: labels[key]=value

    Args:
        params: Dictionary of query parameters from request

    Returns:
        Dictionary of label key-value pairs to filter by

    Examples:
        >>> params = {
        ...     "labels[environment]": "production",
        ...     "labels[region]": "us-east-1",
        ...     "other_param": "ignored"
        ... }
        >>> parse_label_filter(params)
        {"environment": "production", "region": "us-east-1"}

    """
    label_filters = {}

    for param_name, param_value in params.items():
        # Try to match label parameter pattern
        match = LABEL_PARAM_PATTERN.match(param_name)
        if match:
            label_key = match.group(1)
            label_filters[label_key] = param_value

    return label_filters


def filter_resources(
    resources: list[BaseResource], label_filters: dict[str, str], label_field: str = "labels"
) -> list[BaseResource]:
    """Filter a list of resources by label criteria.

    Args:
        resources: List of resource objects to filter
        label_filters: Label key-value pairs to match
        label_field: Name of the labels field on resource objects

    Returns:
        Filtered list of resources that match all label criteria

    Examples:
        >>> resources = [
        ...     MockResource(labels={"env": "prod", "team": "api"}),
        ...     MockResource(labels={"env": "staging", "team": "api"}),
        ...     MockResource(labels={"env": "prod", "team": "web"})
        ... ]
        >>> filter_resources(resources, {"env": "prod"})
        [MockResource(...), MockResource(...)]  # First and third

    """
    if not label_filters:
        return resources

    filtered: list[BaseResource] = []
    for resource in resources:
        resource_labels = getattr(resource, label_field, None)
        if matches(resource_labels, label_filters):
            filtered.append(resource)

    return filtered


def apply_label_filters(
    query: Select[TP] | SelectOfScalar[TP], label_filters: dict[str, str], model: type[SQLModel]
) -> Select[TP] | SelectOfScalar[TP]:
    """Apply label filters to a SQLAlchemy Query using JSON operations.

    Args:
        query: SQLAlchemy Query object or SQLModel Select statement to filter
        label_filters: Label key-value pairs to match
        model: SQLModel class to get labels field attribute from

    Returns:
        Filtered query object of the same type as input

    Examples:
        >>> # With SQLModel Select
        >>> stmt = select(Resource)
        >>> filtered_stmt = apply_label_filters(stmt, {"env": "prod"}, Resource)

        >>> # With SQLAlchemy Query
        >>> query = session.query(Resource)
        >>> filtered_query = apply_label_filters(query, {"region": "us-east-1"}, Resource)

    """
    if not label_filters:
        return query

    # Get the labels field attribute from the model
    if not hasattr(model, "labels"):
        msg = f"Model {model.__name__} does not have a 'labels' field"
        raise ValueError(msg)

    labels_field = model.labels
    conditions = []

    for key, value in label_filters.items():
        # Use SQLite JSON function for label matching
        # This creates conditions like: json_extract(Resource.labels, '$.env') == 'prod'
        condition = func.json_extract(labels_field, f"$.{key}") == value
        conditions.append(condition)

    # Apply all conditions with AND logic
    if conditions:
        query = query.filter(and_(*conditions))

    return query
