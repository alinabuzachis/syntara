"""Filter parsing utilities for bracket notation query parameters.

This module provides functions for converting URL query parameters with
bracket notation into structured filter objects for database queries.
"""

import re
from datetime import datetime
from enum import Enum
from typing import Any, TypeVar

from pydantic import BaseModel
from sqlalchemy import Select, and_
from sqlmodel import SQLModel

# We need to import this protected type to pass mypy type-checking
from sqlmodel.sql._expression_select_cls import SelectOfScalar

# Type variable for generic Query/Select type
TP = TypeVar("TP", bound=tuple[Any, ...])

# Type for filter values - more specific than Any
FilterValue = str | int | float | bool | datetime


class FilterOperator(str, Enum):
    """Supported filter operators for query parameters.

    String values match the expected bracket notation syntax:
    - eq: Exact equality match
    - contains: Substring match (case-insensitive)
    - starts_with: Prefix match (case-insensitive)
    - gt: Greater than comparison
    - gte: Greater than or equal comparison
    - lt: Less than comparison
    - lte: Less than or equal comparison
    """

    EQ = "eq"
    CONTAINS = "contains"
    STARTS_WITH = "starts_with"
    GT = "gt"
    GTE = "gte"
    LT = "lt"
    LTE = "lte"


class Filter(BaseModel):
    """Structured filter object parsed from query parameters.

    Attributes:
        field: Name of the field to filter on
        operator: Filter operator to apply
        value: Value to filter by (supports str, int, float, bool, datetime)

    """

    field: str
    operator: FilterOperator
    value: FilterValue


# Regex pattern to match bracket notation: field[operator]
BRACKET_PATTERN = re.compile(r"^(\w+)\[(\w+)\]$")


def parse_filters(params: dict[str, str], allowed_fields: list[str]) -> list[Filter]:
    """Parse query parameters into structured filter objects.

    Supports both shorthand equality syntax (field=value) and explicit
    bracket notation (field[operator]=value) for advanced filtering.

    Args:
        params: Dictionary of query parameters from request
        allowed_fields: List of field names that can be filtered

    Returns:
        List of Filter objects parsed from parameters

    Raises:
        ValueError: If invalid field name or operator is used

    Examples:
        >>> params = {"name[contains]": "test", "status": "active"}
        >>> parse_filters(params, ["name", "status"])
        [Filter(field="name", operator=CONTAINS, value="test"),
         Filter(field="status", operator=EQ, value="active")]

    """
    filters: list[Filter] = []

    for param_name, param_value in params.items():
        # Try to match bracket notation first
        bracket_match = BRACKET_PATTERN.match(param_name)

        if bracket_match:
            # Bracket notation: field[operator]=value
            field_name, operator_str = bracket_match.groups()

            # Validate field name
            if field_name not in allowed_fields:
                msg = f"Invalid field: {field_name}"
                raise ValueError(msg)

            # Validate operator
            if operator_str not in FilterOperator.__members__.values():
                msg = f"Invalid operator: {operator_str}"
                raise ValueError(msg)

            operator = FilterOperator(operator_str)

            # Handle comma-separated values (OR logic)
            values = param_value.split(",")
            for value in values:
                filters.extend([Filter(field=field_name, operator=operator, value=value.strip())])

        else:
            # Shorthand notation: field=value (implies equality)
            field_name = param_name

            # Validate field name
            if field_name not in allowed_fields:
                msg = f"Invalid field: {field_name}"
                raise ValueError(msg)

            # Handle comma-separated values (OR logic)
            values = param_value.split(",")
            for value in values:
                filters.extend([Filter(field=field_name, operator=FilterOperator.EQ, value=value.strip())])

    return filters


def validate_operator_for_field_type(operator: FilterOperator, field_type: type) -> bool:
    """Validate that an operator is compatible with a field type.

    Args:
        operator: Filter operator to validate
        field_type: Python type of the field being filtered

    Returns:
        True if operator is compatible with field type

    Field Type Compatibility:
        - String fields: All operators supported
        - DateTime/Numeric fields: eq, gt, gte, lt, lte
        - Boolean fields: eq only

    """
    # String fields support all operators
    if field_type is str:
        return True

    # DateTime and numeric fields support comparison operators
    if field_type in (int, float, complex) or hasattr(field_type, "timestamp"):
        return operator in {
            FilterOperator.EQ,
            FilterOperator.GT,
            FilterOperator.GTE,
            FilterOperator.LT,
            FilterOperator.LTE,
        }

    # Boolean and other types only support equality
    return operator == FilterOperator.EQ


def _sanitize_like_value(value: FilterValue) -> str:
    """Sanitize value for use in LIKE/ILIKE patterns to prevent injection.

    Args:
        value: Value to sanitize for LIKE pattern

    Returns:
        Sanitized string value with special characters escaped

    Security Note:
        Escapes % and _ characters that have special meaning in SQL LIKE patterns
        to prevent injection attacks through pattern manipulation.

    """
    if not isinstance(value, str):
        value = str(value)

    # Escape special LIKE pattern characters
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _build_condition(field_attr: Any, operator: FilterOperator, value: FilterValue) -> Any:  # noqa: ANN401, PLR0911
    """Build a SQLAlchemy condition for a single filter.

    Args:
        field_attr: SQLAlchemy field attribute from the model
        operator: Filter operator to apply
        value: Value to filter by

    Returns:
        SQLAlchemy condition object

    """
    match operator:
        case FilterOperator.EQ:
            return field_attr == value
        case FilterOperator.CONTAINS:
            sanitized_value = _sanitize_like_value(value)
            return field_attr.ilike(f"%{sanitized_value}%")
        case FilterOperator.STARTS_WITH:
            sanitized_value = _sanitize_like_value(value)
            return field_attr.ilike(f"{sanitized_value}%")
        case FilterOperator.GT:
            return field_attr > value
        case FilterOperator.GTE:
            return field_attr >= value
        case FilterOperator.LT:
            return field_attr < value
        case FilterOperator.LTE:
            return field_attr <= value


def apply_filters(
    query: Select[TP] | SelectOfScalar[TP], filters: list[Filter], model: type[SQLModel]
) -> Select[TP] | SelectOfScalar[TP]:
    """Apply filters to a SQLAlchemy Query or SQLModel Select using Query API.

    Args:
        query: SQLAlchemy Query object or SQLModel Select statement to filter
        filters: List of Filter objects to apply
        model: SQLModel class to get field attributes from

    Returns:
        Filtered query object of the same type as input

    Examples:
        >>> # With SQLAlchemy Query
        >>> query = session.query(User)
        >>> filtered_query = apply_filters(query, filters, User)

        >>> # With SQLModel Select
        >>> stmt = select(User)
        >>> filtered_stmt = apply_filters(stmt, filters, User)

    """
    if not filters:
        return query

    conditions = []

    for filter_obj in filters:
        # Get the model attribute for the field
        if not hasattr(model, filter_obj.field):
            msg = f"Field '{filter_obj.field}' not found on model {model.__name__}"
            raise ValueError(msg)

        field_attr = getattr(model, filter_obj.field)
        condition = _build_condition(field_attr, filter_obj.operator, filter_obj.value)
        conditions.append(condition)

    # Apply all conditions with AND logic
    if conditions:
        query = query.filter(and_(*conditions))

    return query
