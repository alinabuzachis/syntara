"""Unified cursor data structure for pagination and sorting.

This module provides a centralized CursorData class that combines pagination
and sorting state into a single structure, along with utilities for encoding
and decoding cursor tokens.
"""

import base64
import json
from datetime import datetime
from enum import Enum
from typing import Any, TypedDict
from uuid import UUID

from nexus.core.constants import FieldLimits, ValidationMessages


def _raise_cursor_too_large() -> None:
    """Raise ValueError for cursor size validation."""
    msg = ValidationMessages.CURSOR_TOO_LARGE.format(max_size=FieldLimits.MAX_CURSOR_SIZE)
    raise ValueError(msg)


class PaginationDirection(str, Enum):
    """Enumeration for pagination direction."""

    NEXT = "next"
    PREV = "prev"


class SortDirection(str, Enum):
    """Sort direction enumeration."""

    ASC = "asc"
    DESC = "desc"


class CursorData(TypedDict, total=False):
    """Unified cursor data structure for pagination and sorting.

    This structure contains all the information needed to maintain
    pagination and sorting state across API requests.

    Attributes:
        id: Resource ID for pagination positioning
        created_at: Creation timestamp for pagination positioning
        direction: Pagination direction ("next" or "prev")
        sort_field: Field name used for sorting
        sort_direction: Sort direction ("asc" or "desc")

    Note:
        All fields are optional (total=False) to support various cursor scenarios.
        The minimal cursor only needs fields relevant to the specific use case.

    """

    # Pagination fields
    id: str
    created_at: str
    direction: str

    # Sorting fields
    sort_field: str
    sort_direction: str


def create_cursor_data(
    *,
    resource_id: str | UUID | None = None,
    created_at: datetime | str | None = None,
    direction: PaginationDirection = PaginationDirection.NEXT,
    sort_field: str | None = None,
    sort_direction: SortDirection = SortDirection.DESC,
) -> CursorData:
    """Create a cursor data structure with the provided parameters.

    Args:
        resource_id: Resource ID for pagination positioning
        created_at: Creation timestamp for pagination positioning
        direction: Pagination direction
        sort_field: Field name used for sorting
        sort_direction: Sort direction

    Returns:
        CursorData dictionary with the provided fields

    Examples:
        >>> create_cursor_data(
        ...     resource_id="550e8400-e29b-41d4-a716-446655440000",
        ...     created_at=datetime.now(),
        ...     sort_field="name"
        ... )
        {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "created_at": "2025-01-01T12:00:00.000000",
            "direction": "next",
            "sort_field": "name",
            "sort_direction": "desc"
        }

    """
    cursor: CursorData = {}

    # Add pagination fields if provided
    if resource_id is not None:
        cursor["id"] = str(resource_id)

    if created_at is not None:
        if isinstance(created_at, datetime):
            cursor["created_at"] = created_at.isoformat()
        else:
            cursor["created_at"] = created_at

    # Always include direction for pagination
    cursor["direction"] = direction.value

    # Add sorting fields if provided
    if sort_field is not None:
        cursor["sort_field"] = sort_field

    # Always include sort direction if we have a sort field
    if sort_field is not None:
        cursor["sort_direction"] = sort_direction.value

    return cursor


def encode_cursor(cursor_data: CursorData) -> str:
    """Encode cursor data to a base64 string.

    Args:
        cursor_data: CursorData dictionary to encode

    Returns:
        Base64-encoded cursor string

    Examples:
        >>> cursor = {"id": "uuid", "direction": "next"}
        >>> encode_cursor(cursor)
        "eyJkaXJlY3Rpb24iOiJuZXh0IiwiaWQiOiJ1dWlkIn0="

    """
    # Sort keys for consistent encoding
    cursor_json = json.dumps(cursor_data, sort_keys=True)
    cursor_bytes = cursor_json.encode("utf-8")
    return base64.b64encode(cursor_bytes).decode("ascii")


def decode_cursor(cursor: str) -> CursorData:
    """Decode cursor token to CursorData dictionary.

    Args:
        cursor: Base64-encoded cursor string

    Returns:
        CursorData dictionary containing cursor information

    Raises:
        ValueError: If cursor is malformed
        json.JSONDecodeError: If cursor contains invalid JSON

    Examples:
        >>> cursor = "eyJpZCI6InV1aWQifQ=="
        >>> decode_cursor(cursor)
        {"id": "uuid"}

    """
    try:
        # Security: Validate cursor size to prevent memory exhaustion attacks
        if len(cursor) > FieldLimits.MAX_CURSOR_SIZE:
            _raise_cursor_too_large()

        cursor_bytes = base64.b64decode(cursor.encode("ascii"))
        cursor_json = cursor_bytes.decode("utf-8")

        # Security: Validate JSON size after decoding
        if len(cursor_json) > FieldLimits.MAX_CURSOR_SIZE:
            _raise_cursor_too_large()

        # Security: Use secure JSON loading with limited depth
        try:
            return json.loads(cursor_json)  # type: ignore[no-any-return]
        except RecursionError:
            msg = "Cursor JSON too deeply nested"
            raise ValueError(msg) from None

    except json.JSONDecodeError:
        # Re-raise JSONDecodeError as-is for explicit handling
        raise
    except (ValueError, UnicodeDecodeError) as e:
        if "Cursor" in str(e):
            # Re-raise our security-related errors as-is
            raise
        msg = ValidationMessages.CURSOR_INVALID_FORMAT.format(error=e)
        raise ValueError(msg) from e


def get_pagination_direction(cursor: str | None) -> PaginationDirection:
    """Extract pagination direction from cursor.

    Args:
        cursor: Cursor string containing direction information

    Returns:
        Pagination direction (NEXT, PREV, or NEXT for None cursor)

    Examples:
        >>> cursor_data = {"direction": "next"}
        >>> cursor = encode_cursor(cursor_data)
        >>> get_pagination_direction(cursor)
        PaginationDirection.NEXT

    """
    if cursor is None:
        return PaginationDirection.NEXT  # First page is always forward navigation

    try:
        cursor_data = decode_cursor(cursor)
        direction_str = cursor_data.get("direction", "next")
        return PaginationDirection.NEXT if direction_str == "next" else PaginationDirection.PREV
    except (ValueError, json.JSONDecodeError):
        return PaginationDirection.NEXT  # Default to forward navigation on invalid cursor


def extract_sort_from_cursor(cursor_data: CursorData) -> tuple[str, SortDirection]:
    """Extract sort information from cursor data.

    Args:
        cursor_data: CursorData containing cursor information

    Returns:
        Tuple of (field_name, sort_direction) from cursor

    Examples:
        >>> cursor: CursorData = {"sort_field": "name", "sort_direction": "asc"}
        >>> extract_sort_from_cursor(cursor)
        ("name", SortDirection.ASC)

    """
    field = cursor_data.get("sort_field", "created_at")
    direction_str = cursor_data.get("sort_direction", "desc")

    try:
        direction = SortDirection(direction_str)
    except ValueError:
        direction = SortDirection.DESC

    return field, direction


def extract_pagination_from_cursor(cursor_data: CursorData) -> tuple[str | None, str | None, PaginationDirection]:
    """Extract pagination information from cursor data.

    Args:
        cursor_data: CursorData containing cursor information

    Returns:
        Tuple of (resource_id, created_at, direction) from cursor

    Examples:
        >>> cursor: CursorData = {
        ...     "id": "uuid",
        ...     "created_at": "2025-01-01T12:00:00",
        ...     "direction": "next"
        ... }
        >>> extract_pagination_from_cursor(cursor)
        ("uuid", "2025-01-01T12:00:00", PaginationDirection.NEXT)

    """
    resource_id = cursor_data.get("id")
    created_at = cursor_data.get("created_at")
    direction_str = cursor_data.get("direction", "next")

    try:
        direction = PaginationDirection(direction_str)
    except ValueError:
        direction = PaginationDirection.NEXT

    return resource_id, created_at, direction


def merge_cursor_data(
    pagination_cursor: CursorData | None = None,
    sort_cursor: CursorData | None = None,
    **kwargs: Any,  # noqa: ANN401
) -> CursorData:
    """Merge multiple cursor data sources into a unified cursor.

    Args:
        pagination_cursor: Cursor data containing pagination information
        sort_cursor: Cursor data containing sorting information
        **kwargs: Additional cursor fields to include

    Returns:
        Merged CursorData dictionary

    Examples:
        >>> pagination = {"id": "uuid", "direction": "next"}
        >>> sorting = {"sort_field": "name", "sort_direction": "asc"}
        >>> merge_cursor_data(pagination, sorting)
        {
            "id": "uuid",
            "direction": "next",
            "sort_field": "name",
            "sort_direction": "asc"
        }

    """
    result: CursorData = {}

    # Merge pagination cursor data
    if pagination_cursor:
        result.update(pagination_cursor)

    # Merge sort cursor data (may override pagination fields)
    if sort_cursor:
        result.update(sort_cursor)

    # Add any additional fields
    result.update(kwargs)  # type: ignore[typeddict-item]

    return result


def validate_cursor_data(cursor_data: CursorData) -> list[str]:
    """Validate cursor data structure and return any validation errors.

    Args:
        cursor_data: CursorData to validate

    Returns:
        List of validation error messages (empty if valid)

    Examples:
        >>> validate_cursor_data({"direction": "invalid"})
        ["Invalid direction: invalid"]
        >>> validate_cursor_data({"direction": "next", "sort_direction": "asc"})
        []

    """
    errors = []

    # Validate direction if present
    if "direction" in cursor_data:
        try:
            PaginationDirection(cursor_data["direction"])
        except ValueError:
            errors.append(f"Invalid direction: {cursor_data['direction']}")

    # Validate sort direction if present
    if "sort_direction" in cursor_data:
        try:
            SortDirection(cursor_data["sort_direction"])
        except ValueError:
            errors.append(f"Invalid sort_direction: {cursor_data['sort_direction']}")

    # Validate that sort_field and sort_direction go together
    has_sort_field = "sort_field" in cursor_data
    has_sort_direction = "sort_direction" in cursor_data

    if has_sort_field and not has_sort_direction:
        errors.append("sort_field provided without sort_direction")
    elif has_sort_direction and not has_sort_field:
        errors.append("sort_direction provided without sort_field")

    return errors
