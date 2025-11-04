"""Filter parsing utilities for bracket notation query parameters.

This module provides functions for converting URL query parameters with
bracket notation into structured filter objects for database queries.
"""

import logging
import re
from datetime import datetime
from enum import Enum
from typing import Any, TypeVar

from pydantic import BaseModel
from sqlalchemy import Select
from sqlmodel import SQLModel, and_

# We need to import this protected type to pass mypy type-checking
from sqlmodel.sql._expression_select_cls import SelectOfScalar

# Logger for this module
logger = logging.getLogger(__name__)

# Type variable for generic Query/Select type
TP = TypeVar("TP", bound=tuple[Any, ...])

# Type for filter values - more specific than Any
FilterValue = str | int | float | bool | datetime | Enum


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
# Allow dots in field names for nested fields like "configuration.provider_type"
BRACKET_PATTERN = re.compile(r"^([\w.]+)\[(\w+)\]$")


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


def _convert_datetime_value(value: str, field_attr: Any) -> datetime:  # noqa: ANN401
    """Convert string value to datetime.

    Args:
        value: String value to convert
        field_attr: SQLAlchemy field attribute for error context

    Returns:
        Parsed datetime object

    Raises:
        ValueError: If datetime conversion fails

    """
    try:
        # Try parsing as ISO 8601 format (with 'Z' suffix or timezone)
        # Replace 'Z' with '+00:00' for fromisoformat compatibility
        iso_value = value.replace("Z", "+00:00") if value.endswith("Z") else value
        return datetime.fromisoformat(iso_value)
    except ValueError as e:
        # Log warning and re-raise - malformed timestamps should fail loudly
        logger.warning(
            "Failed to parse datetime value '%s' for field %s: %s",
            value,
            getattr(field_attr, "key", "unknown"),
            e,
        )
        msg = f"Invalid datetime format: {value}. Expected ISO 8601 format (e.g., '2025-01-15T10:30:00Z')"
        raise ValueError(msg) from e


def _convert_boolean_value(value: str) -> bool:
    """Convert string value to boolean.

    Args:
        value: String value to convert

    Returns:
        Boolean value

    Raises:
        ValueError: If boolean conversion fails

    """
    try:
        # Convert common string representations to boolean
        lower_value = value.lower().strip()
        if lower_value in ("true", "1", "yes", "on"):
            return True
        if lower_value in ("false", "0", "no", "off"):
            return False
        msg = f"Invalid boolean value: {value}. Expected 'true', 'false', '1', '0', 'yes', 'no', 'on', or 'off'"
        raise ValueError(msg)
    except AttributeError as e:
        # If value doesn't have lower() method, it's not a string
        msg = f"Invalid boolean value: {value}. Expected string representation of boolean"
        raise ValueError(msg) from e


def _convert_numeric_value(value: str, python_type: type[int | float], field_attr: Any) -> int | float:  # noqa: ANN401
    """Convert string value to numeric type.

    Args:
        value: String value to convert
        python_type: Target numeric type (int or float)
        field_attr: SQLAlchemy field attribute for error context

    Returns:
        Converted numeric value

    Raises:
        ValueError: If numeric conversion fails

    """
    try:
        converted_value = python_type(value)
        # Ensure we return the expected type
        if python_type is int:
            return int(converted_value)
        if python_type is float:
            return float(converted_value)
        # This shouldn't happen given the function's usage, but for type safety
        return float(converted_value)
    except ValueError as e:
        # Log warning and re-raise - type mismatches should fail loudly
        logger.warning(
            "Failed to convert value '%s' to %s for field %s: %s",
            value,
            python_type.__name__,
            getattr(field_attr, "key", "unknown"),
            e,
        )
        msg = f"Invalid {python_type.__name__} value: {value}"
        raise ValueError(msg) from e


def _convert_enum_value(value: str, python_type: type[Enum], field_attr: Any) -> Enum:  # noqa: ANN401
    """Convert string value to enum type.

    Args:
        value: String value to convert
        python_type: Target enum type
        field_attr: SQLAlchemy field attribute for error context

    Returns:
        Enum instance

    Raises:
        ValueError: If enum value is invalid

    """
    try:
        # Try to create the enum instance from the string value
        return python_type(value)
    except ValueError as e:
        # Get valid values for error message
        valid_values = [item.value for item in python_type.__members__.values()]
        field_name = getattr(field_attr, "key", "unknown")
        logger.warning(
            "Invalid enum value '%s' for field %s. Valid values: %s",
            value,
            field_name,
            valid_values,
        )
        msg = f"Invalid value '{value}' for field '{field_name}'. Valid values are: {', '.join(valid_values)}"
        raise ValueError(msg) from e


def _convert_filter_value(value: FilterValue, field_attr: Any) -> FilterValue:  # noqa: ANN401, PLR0911
    """Convert filter value to the appropriate type based on the field.

    Args:
        value: Raw filter value (usually a string from query params)
        field_attr: SQLAlchemy field attribute to infer type from

    Returns:
        Converted value of the appropriate type

    Raises:
        ValueError: If datetime conversion fails with invalid format or if enum value is invalid

    """
    # If value is already the right type, return as-is
    if not isinstance(value, str):
        return value

    # Try to infer type from the field's Python type
    try:
        # Get the Python type from the SQLAlchemy column
        python_type = field_attr.type.python_type
    except (AttributeError, NotImplementedError):
        # Some SQLAlchemy types don't implement python_type (like UUID, custom types)
        # This is expected, just use string comparison for these fields
        logger.debug(
            "Field %s does not provide python_type, using string comparison",
            getattr(field_attr, "key", "unknown"),
        )
        return value

    # Handle enum fields with validation
    if isinstance(python_type, type) and issubclass(python_type, Enum):
        return _convert_enum_value(value, python_type, field_attr)

    # Handle datetime fields
    if python_type == datetime or (hasattr(python_type, "__origin__") and python_type.__origin__ == datetime):
        return _convert_datetime_value(value, field_attr)

    # Handle boolean fields
    if python_type is bool:
        return _convert_boolean_value(value)

    # Handle numeric types
    if python_type in (int, float):
        return _convert_numeric_value(value, python_type, field_attr)

    # For other types (str, UUID, custom types), use string comparison
    return value


def _build_condition(field_attr: Any, operator: FilterOperator, value: FilterValue) -> Any:  # noqa: ANN401, PLR0911
    """Build a SQLAlchemy condition for a single filter.

    Args:
        field_attr: SQLAlchemy field attribute from the model
        operator: Filter operator to apply
        value: Value to filter by

    Returns:
        SQLAlchemy condition object

    """
    # Convert value to appropriate type based on field
    converted_value = _convert_filter_value(value, field_attr)

    match operator:
        case FilterOperator.EQ:
            return field_attr == converted_value
        case FilterOperator.CONTAINS:
            sanitized_value = _sanitize_like_value(converted_value)
            return field_attr.ilike(f"%{sanitized_value}%")
        case FilterOperator.STARTS_WITH:
            sanitized_value = _sanitize_like_value(converted_value)
            return field_attr.ilike(f"{sanitized_value}%")
        case FilterOperator.GT:
            return field_attr > converted_value
        case FilterOperator.GTE:
            return field_attr >= converted_value
        case FilterOperator.LT:
            return field_attr < converted_value
        case FilterOperator.LTE:
            return field_attr <= converted_value


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
