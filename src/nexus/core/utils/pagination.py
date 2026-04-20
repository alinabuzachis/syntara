"""Pagination utilities for cursor-based pagination.

This module provides functions for generating cursor-based pagination
responses with next/prev cursors and optional total counts.

Cursor Format:
    Base64-encoded JSON containing pagination state:
    {"id": "uuid", "created_at": "iso8601", "direction": "next", ...}
"""

from collections.abc import Sequence
from typing import TypedDict

from nexus.core.models.base import BaseResource
from nexus.core.utils.cursor import (
    PaginationDirection,
    create_cursor_data,
    decode_cursor,
    encode_cursor,
)


class PaginationResult(TypedDict):
    """Typed return value of a Paginated response."""

    trimmed_items: list[BaseResource]
    next: str | None
    prev: str | None
    total: int | None


def generate_response(
    items: Sequence[BaseResource],
    limit: int,
    cursor: str | None,
    *,
    include_total: bool = False,
    total_count: int | None = None,
    is_first_page: bool = False,
) -> PaginationResult:
    """Generate paginated response with next/prev cursor tokens using N+1 pattern.

    This implementation uses the industry-standard "Fetch N+1" pattern where the caller
    fetches limit+1 items to definitively detect if more pages exist in the fetch direction.

    Key behaviors:
    - Trims items to requested limit if more than limit items provided
    - Generates next cursor only when items were trimmed (definitive "has more" forward)
    - Generates prev cursor based on cursor presence and is_first_page flag
    - Uses N+1 pattern to avoid generating next cursors that point to empty pages

    Note: For backward pagination first-page detection, the caller must provide is_first_page
    flag (typically determined via a separate query) since N+1 pattern alone cannot detect
    first page during backward navigation.

    The N+1 pattern is used by Stripe, GitHub, Shopify, and GraphQL Relay specification.

    Args:
        items: List of items for current page (may contain limit+1 items)
        limit: Items per page limit (caller should fetch limit+1)
        cursor: Current cursor token (None for first page)
        include_total: Whether to include total count in response
        total_count: Total count if include_total is True
        is_first_page: Explicit flag indicating this is the first page (for backward navigation)

    Returns:
        Dictionary with trimmed_items, next, prev, and optional total fields

    Examples:
        >>> # from tests.fixtures.mock_base_resource import MockBaseResource
        >>> # Fetch limit+1 items (11 items when limit=10)
        >>> # mock_items = [MockBaseResource() for _ in range(11)]
        >>> # generate_response(
        >>> #     items=mock_items,
        >>> #     limit=10,
        >>> #     cursor=None
        >>> # )
        >>> # {
        >>> #   "trimmed_items": [... 10 items ...],
        >>> #   "next": "eyJpZCI6InV1aWQifQ==",
        >>> #   "prev": None,
        >>> #   "total": None
        >>> # }

    """
    response: PaginationResult = {"trimmed_items": [], "next": None, "prev": None, "total": None}

    # Detect if this was backward pagination by checking cursor direction
    is_backward_pagination = False
    if cursor is not None:
        try:
            cursor_data = decode_cursor(cursor)
            direction_str = cursor_data.get("direction", "next")
            is_backward_pagination = direction_str == PaginationDirection.PREV.value
        except (ValueError, KeyError):
            pass

    # N+1 Pattern: Trim items if we got more than requested
    # This definitively tells us if there are more pages
    has_more = len(items) > limit

    # IMPORTANT: For backward pagination, after reversing results in the service layer,
    # we have [oldest...newest] but the extra item is at the START (oldest), not the end.
    # So we trim from the beginning [1:] instead of the end [:limit]
    trimmed_items = (
        (list(items[1 : limit + 1]) if is_backward_pagination else list(items[:limit])) if has_more else list(items)
    )

    response["trimmed_items"] = trimmed_items

    # Generate next cursor only if we trimmed items (definitive "has more")
    if has_more and len(trimmed_items) > 0:
        cursor_data = create_cursor_data(
            resource_id=trimmed_items[-1].id,
            created_at=trimmed_items[-1].created_at,
            direction=PaginationDirection.NEXT,
        )
        response["next"] = encode_cursor(cursor_data)
    else:
        response["next"] = None

    # Generate prev cursor for bidirectional navigation
    if cursor is None or is_first_page:
        # First page - no previous page
        response["prev"] = None
    elif len(trimmed_items) > 0:
        # Not the first page and we have items - generate prev cursor from first item
        cursor_data = create_cursor_data(
            resource_id=trimmed_items[0].id,
            created_at=trimmed_items[0].created_at,
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
