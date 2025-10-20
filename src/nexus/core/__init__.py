"""Nexus Shared API Resources and Conventions.

This package provides shared SQLModel base classes, utility functions, and conventions
for building consistent APIs across the Nexus platform.

Key Components:
- BaseResource: Foundation SQLModel with UUID, timestamps, and labels
- NamedResource: Extension with name and description fields
- SoftDeletableResource: Soft deletion tracking capabilities
- UserOwnedResource: User ownership and modification tracking
- Resource: Composite model combining all capabilities
- parse_filters: Parse bracket notation query parameters
- apply_filters: Apply filters to SQLAlchemy Query using Query API
- matches: Check if resource labels match filter criteria
- parse_label_filter: Parse label filters from query parameters
- apply_label_filters: Apply label filters to SQLAlchemy Query using JSON operations
- Label validation and filtering utilities
- Pagination functions: Cursor-based pagination support
- SortParser: Parse ±field syntax for sorting
"""

__version__ = "0.1.0"
__author__ = "Nexus Platform Team"

# SQLModel classes
from nexus.core.models.base import BaseResource
from nexus.core.models.error import Error
from nexus.core.models.named import NamedResource
from nexus.core.models.pagination import ResourcesResponse, ResourcesResponseBase
from nexus.core.models.resource import Resource
from nexus.core.models.soft_deletable import SoftDeletableResource
from nexus.core.models.user_owned import UserOwnedResource
from nexus.core.utils.cursor import (
    CursorData,
    PaginationDirection,
    SortDirection,
    decode_cursor,
    encode_cursor,
    extract_sort_from_cursor,
    get_pagination_direction,
)

# Utility classes and functions
from nexus.core.utils.filters import Filter, FilterOperator, apply_filters, parse_filters
from nexus.core.utils.labels import (
    apply_label_filters,
    filter_resources,
    matches,
    parse_label_filter,
)
from nexus.core.utils.pagination import (
    generate_response,
)
from nexus.core.utils.sorting import (
    apply_sorting,
    parse_multiple_sorts,
    parse_sort,
)

# Public API exports
__all__ = [  # noqa: RUF022
    # SQLModel classes
    "BaseResource",
    "Error",
    "NamedResource",
    "Resource",
    "SoftDeletableResource",
    "UserOwnedResource",
    "ResourcesResponseBase",
    "ResourcesResponse",
    # Filter utilities
    "apply_filters",
    "parse_filters",
    "Filter",
    "FilterOperator",
    # Label utilities
    "apply_label_filters",
    "filter_resources",
    "matches",
    "parse_label_filter",
    # Pagination utilities
    "PaginationDirection",
    "decode_cursor",
    "encode_cursor",
    "generate_response",
    "get_pagination_direction",
    # Sort utilities
    "CursorData",
    "SortDirection",
    "apply_sorting",
    "extract_sort_from_cursor",
    "parse_multiple_sorts",
    "parse_sort",
]
