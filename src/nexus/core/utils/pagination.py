"""Pagination utilities for cursor-based pagination.

This module provides functions for generating cursor-based pagination
responses with next/prev cursors and optional total counts.

Cursor Format:
    Base64-encoded JSON containing pagination state:
    {"id": "uuid", "created_at": "iso8601", "direction": "next", ...}
"""

from collections.abc import Sequence

from nexus.core.models.base import BaseResource
from nexus.core.utils.cursor import (
    PaginationDirection,
    create_cursor_data,
    encode_cursor,
)


def generate_response(
    items: Sequence[BaseResource],
    limit: int,
    cursor: str | None,
    *,
    include_total: bool = False,
    total_count: int | None = None,
) -> dict[str, str | int | None]:
    """Generate paginated response with next/prev cursor tokens.

    This implementation provides proper bidirectional navigation by:
    - Generating next cursor when there are more items (items count equals limit)
    - Generating prev cursor when current page is not the first page
    - Handling edge cases for first/last pages correctly

    Args:
        items: List of items for current page
        limit: Items per page limit
        cursor: Current cursor token (None for first page)
        include_total: Whether to include total count in response
        total_count: Total count if include_total is True

    Returns:
        Dictionary with next, prev, and optional total fields

    Examples:
        >>> # from tests.fixtures.mock_base_resource import MockBaseResource
        >>> # mock_items = [MockBaseResource(), MockBaseResource()]
        >>> # generate_response(
        >>> #     items=mock_items,
        >>> #     limit=20,
        >>> #     cursor=None
        >>> # )
        >>> # {"next": "eyJpZCI6InV1aWQifQ==", "prev": None, "total": None}

    """
    response: dict[str, str | int | None] = {}

    # Generate next cursor if more items available (items count equals limit)
    if len(items) >= limit:
        cursor_data = create_cursor_data(
            resource_id=items[-1].id,
            created_at=items[-1].created_at,
            direction=PaginationDirection.NEXT,
        )
        response["next"] = encode_cursor(cursor_data)
    else:
        response["next"] = None

    # Generate prev cursor for bidirectional navigation
    if cursor is None:
        # First page - no previous page
        response["prev"] = None
    elif len(items) > 0:
        # Not the first page and we have items - generate prev cursor from first item
        cursor_data = create_cursor_data(
            resource_id=items[0].id,
            created_at=items[0].created_at,
            direction=PaginationDirection.PREV,
        )
        response["prev"] = encode_cursor(cursor_data)
    else:
        # Empty page - no previous page
        response["prev"] = None

    # Include total count if requested
    if include_total and total_count is not None:
        response["total"] = total_count
    else:
        response["total"] = None

    return response
