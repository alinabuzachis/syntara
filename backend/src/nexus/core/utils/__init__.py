"""Shared utility functions for API development.

This module contains utility classes and functions for common API operations
like filtering, pagination, sorting, and label matching.
"""

from nexus.core.utils.cursor import (
    CursorData,
    PaginationDirection,
    SortDirection,
    decode_cursor,
    encode_cursor,
    extract_pagination_from_cursor,
    extract_sort_from_cursor,
    get_pagination_direction,
)
from nexus.core.utils.filters import Filter, FilterOperator, apply_filters, parse_filters
from nexus.core.utils.labels import (
    apply_label_filters,
    matches,
    parse_label_filter,
    parse_labels_query,
)
from nexus.core.utils.pagination import (
    generate_response,
)
from nexus.core.utils.sorting import (
    apply_sorting,
    parse_sort,
)

__all__ = [
    "CursorData",
    "Filter",
    "FilterOperator",
    "PaginationDirection",
    "SortDirection",
    "apply_filters",
    "apply_label_filters",
    "apply_sorting",
    "decode_cursor",
    "encode_cursor",
    "extract_pagination_from_cursor",
    "extract_sort_from_cursor",
    "generate_response",
    "get_pagination_direction",
    "matches",
    "parse_filters",
    "parse_label_filter",
    "parse_labels_query",
    "parse_sort",
]
