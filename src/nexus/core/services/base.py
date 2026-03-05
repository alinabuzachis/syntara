"""Base service class for standardized data operations.

This module provides a single base class that ALL services must inherit from to ensure
consistent filtering, sorting, pagination, and label handling across the entire system.
"""

from collections.abc import Awaitable, Callable, Iterable
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import Select, func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from nexus.core.exceptions import SafeValueError
from nexus.core.models import User
from nexus.core.services.extensions import ConvertResourceMixin, EnrichQueryMixin, PostProcessingMixin
from nexus.core.services.types import TModel, TResponse

# Import individual utilities to avoid circular imports
from nexus.core.utils.cursor import (
    PaginationDirection,
    SortDirection,
    decode_cursor,
    extract_pagination_from_cursor,
)
from nexus.core.utils.filters import Filter, apply_filters, parse_filters
from nexus.core.utils.labels import apply_label_filters, parse_label_filter, parse_labels_query
from nexus.core.utils.pagination import generate_response
from nexus.core.utils.sorting import apply_sorting, parse_sort


class DefaultEnrichQueryMixin(EnrichQueryMixin):
    """Default implementation of EnrichQueryMixin that performs no query enrichment."""

    def enrich(
        self, query: Select[tuple[TModel]] | SelectOfScalar[tuple[TModel]]
    ) -> Select[tuple[TModel]] | SelectOfScalar[tuple[TModel]]:
        """Extend the query with custom options before execution.

        This is a no-op implementation that returns the query unchanged.
        Subclasses can override this method to add query options like selectinload.

        Args:
            query: The SQLAlchemy query to extend

        Returns:
            Extended query (by default, returns the query unchanged)

        """
        return query


class DefaultConvertResourceMixin(ConvertResourceMixin):
    """Default implementation of ConvertResourceMixin that performs no conversion."""

    def convert_resource(self, resource: TModel) -> Any:  # noqa: ANN401
        """Convert database resource to response format.

        This is a no-op implementation that returns the resource as-is.
        Subclasses can override this method to provide custom conversion logic.

        Args:
            resource: Database resource to convert

        Returns:
            Converted resource (by default, returns the resource unchanged)

        """
        return resource


class DefaultPostProcessingMixin(PostProcessingMixin):
    """Default implementation of PostProcessingMixin that performs no post-processing."""

    async def post_process(self, resources: list[TModel]) -> None:
        """Process resources after database query but before response conversion.

        This is a no-op implementation that does nothing.
        Subclasses can override this method to provide custom processing logic.

        Args:
            resources: List of database resources to process

        """


class BaseService:
    """Base service class for ALL data operations.

    This class provides the ONLY way to handle filtering, sorting, pagination,
    and label filtering across all services. All services MUST inherit from this
    class and use these methods to ensure consistency.
    """

    def __init__(
        self,
        session: AsyncSession,
        user: User,
        enrich_query_mixin: EnrichQueryMixin | None = None,
        convert_resource_mixin: ConvertResourceMixin | None = None,
        post_processing_mixin: PostProcessingMixin | None = None,
    ) -> None:
        """Initialize service with database session and current user.

        Args:
            session: Async database session for operations
            user: Current authenticated user for audit tracking
            enrich_query_mixin: Mixin to support extending database queries before execution
            convert_resource_mixin: Mixin to support converting database objects to response objects
            post_processing_mixin: Mixin to support post-processing of database objects

        """
        self.session = session
        self.user = user
        self.enrich_query_mixin = enrich_query_mixin if enrich_query_mixin is not None else DefaultEnrichQueryMixin()
        self.convert_resource_mixin = (
            convert_resource_mixin if convert_resource_mixin is not None else DefaultConvertResourceMixin()
        )
        self.post_processing_mixin = (
            post_processing_mixin if post_processing_mixin is not None else DefaultPostProcessingMixin()
        )

    def _apply_standard_filters(
        self,
        query: Select[tuple[TModel]] | SelectOfScalar[tuple[TModel]],
        query_params: dict[str, str],
        model: type[TModel],
        special_field_handlers: dict[str, Any] | None = None,
    ) -> tuple[Select[tuple[TModel]] | SelectOfScalar[tuple[TModel]], list[Filter]]:
        """Apply standard filters to query.

        Args:
            query: SQLAlchemy query to filter
            query_params: Query parameters for filtering
            model: BaseResource class to apply filters to (reads __filterable_fields__)
            special_field_handlers: Dict mapping field names to custom handler functions

        Returns:
            Tuple of (filtered_query, filter_objects)

        """
        filters = parse_filters(query_params, model.__filterable_fields__)

        # Separate regular filters from special filters
        special_fields = set(special_field_handlers.keys()) if special_field_handlers else set()
        regular_filters = [f for f in filters if f.field not in special_fields]

        # Apply only regular filters here; special filters are handled separately
        filtered_query = apply_filters(query, regular_filters, model) if regular_filters else query

        return filtered_query, filters

    def _apply_label_filters(
        self,
        query: Select[tuple[TModel]] | SelectOfScalar[tuple[TModel]],
        query_params: dict[str, str],
        model: type[TModel],
    ) -> tuple[Select[tuple[TModel]] | SelectOfScalar[tuple[TModel]], dict[str, str]]:
        """Apply label filters to query using both bracket notation and labels param.

        Args:
            query: SQLAlchemy query to filter
            query_params: Query parameters for filtering
            model: BaseResource class to apply filters to

        Returns:
            Tuple of (filtered_query, label_filters_dict)

        """
        # Parse label filters from bracket notation (labels[key]=value)
        label_filters = parse_label_filter(query_params)

        # Apply label filters if any were found
        if label_filters:
            # Handle empty values (key existence checks) differently than PostgreSQL JSONB
            existence_filters = {k: v for k, v in label_filters.items() if v == ""}
            value_filters = {k: v for k, v in label_filters.items() if v != ""}

            # Apply exact value filters using JSONB contains
            if value_filters:
                query = apply_label_filters(query, value_filters, model)

            # Apply existence filters using has_key
            if existence_filters and hasattr(model, "labels"):
                for key in existence_filters:
                    query = query.filter(model.labels.has_key(key))  # type: ignore[attr-defined]

        return query, label_filters

    def _apply_special_filters(
        self,
        query: Select[tuple[TModel]] | SelectOfScalar[tuple[TModel]],
        filters: list[Filter],
        model: type[TModel],
        special_field_handlers: dict[str, Any] | None = None,
    ) -> Select[tuple[TModel]] | SelectOfScalar[tuple[TModel]]:
        """Apply special filters that require custom handling (e.g., JSON fields).

        Args:
            query: SQLAlchemy query to filter
            filters: List of filter objects to apply
            model: BaseResource class to get field attributes from
            special_field_handlers: Dict mapping field names to custom handler functions

        Returns:
            Query with special filters applied

        """
        if not special_field_handlers:
            return query

        for filter_obj in filters:
            if filter_obj.field in special_field_handlers:
                handler = special_field_handlers[filter_obj.field]
                query = handler(query, filter_obj, model)

        return query

    def _apply_sorting(
        self,
        query: Select[tuple[TModel]] | SelectOfScalar[tuple[TModel]],
        sort: str | None,
        model: type[TModel],
        *,
        reverse_for_backward: bool = False,
    ) -> tuple[Select[tuple[TModel]] | SelectOfScalar[tuple[TModel]], SortDirection]:
        """Apply sorting to query with automatic ID tiebreaker.

        This method ensures stable, deterministic ordering by:
        1. Applying the requested sort field (e.g., created_at DESC)
        2. Adding ID as a tiebreaker to prevent non-deterministic ordering when
           multiple items have identical values for the sort field

        The ID tiebreaker is CRITICAL for cursor-based pagination to prevent:
        - Duplicate items appearing across pages
        - Items being skipped during pagination
        - Inconsistent ordering between forward and backward navigation

        For backward pagination, the sort direction is reversed to fetch items
        in the opposite order, which are then reversed in memory to maintain
        display consistency.

        Args:
            query: SQLAlchemy query to sort
            sort: Sort parameter (e.g., "-created_at" for DESC, "name" for ASC)
            model: BaseResource class to apply sorting to (reads __sortable_fields__)
            reverse_for_backward: If True, reverse the sort direction for backward pagination

        Returns:
            Tuple of (sorted_query, original_sort_direction)

        Example:
            For sort="-created_at":
            - Forward: ORDER BY created_at DESC, id DESC
            - Backward: ORDER BY created_at ASC, id ASC (reversed for fetching)
                       Results are then reversed in memory to display as DESC

        """
        sort_field, sort_direction = parse_sort(sort, model.__sortable_fields__)

        # Reverse sort direction if doing backward pagination
        actual_sort_direction = sort_direction
        if reverse_for_backward:
            actual_sort_direction = SortDirection.ASC if sort_direction == SortDirection.DESC else SortDirection.DESC

        # Always add id as a tiebreaker to ensure stable ordering
        # This is critical for cursor-based pagination when multiple items have the same sort field value
        sort_tuples = [(sort_field, actual_sort_direction), ("id", actual_sort_direction)]
        sorted_query = apply_sorting(query, sort_tuples, model)
        return sorted_query, sort_direction  # Return original direction for cursor logic

    def _apply_cursor_pagination(
        self,
        query: Select[tuple[TModel]] | SelectOfScalar[tuple[TModel]],
        cursor: str | None,
        sort_direction: SortDirection,
        model: type[TModel],
    ) -> tuple[Select[tuple[TModel]] | SelectOfScalar[tuple[TModel]], bool]:
        """Apply cursor-based pagination using keyset pagination technique.

        This is the ONLY pagination method that should be used across all services.
        It implements the "keyset pagination" or "seek method" pattern, which:
        - Uses indexed columns (created_at + id) to mark position
        - Avoids OFFSET for consistent performance at any depth
        - Handles real-time data changes gracefully

        Cursor Format:
            {
                "id": "uuid-of-boundary-item",
                "created_at": "2025-11-12T14:30:00+00:00",
                "direction": "next" or "prev"
            }

        Forward Pagination (direction="next"):
            WHERE (created_at < cursor_timestamp)
               OR (created_at = cursor_timestamp AND id < cursor_id)
            ORDER BY created_at DESC, id DESC

        Backward Pagination (direction="prev"):
            WHERE (created_at > cursor_timestamp)
               OR (created_at = cursor_timestamp AND id > cursor_id)
            ORDER BY created_at ASC, id ASC  (reversed)
            Results reversed in memory afterward

        The compound WHERE clause handles the tiebreaker case where multiple
        items have identical timestamps by also comparing UUIDs.

        Args:
            query: SQLAlchemy query to paginate
            cursor: Cursor token for pagination (None for first page)
            sort_direction: Sort direction from sorting step
            model: BaseResource class to get field attributes from

        Returns:
            Tuple of (query with cursor-based pagination applied, needs_reverse flag)
            The needs_reverse flag indicates if results need to be reversed after fetching

        """
        if not cursor:
            return query, False

        needs_reverse = False

        cursor_data = decode_cursor(cursor)
        resource_id, created_at, direction = extract_pagination_from_cursor(cursor_data)

        try:
            if resource_id and created_at:
                # Convert cursor data to proper types
                cursor_id = UUID(resource_id)
                cursor_timestamp = datetime.fromisoformat(created_at)

                # Apply cursor-based filtering based on sort direction and pagination direction
                if direction == PaginationDirection.NEXT:
                    # Forward pagination - standard behavior
                    if sort_direction.value == "desc":
                        query = query.filter(
                            (model.created_at < cursor_timestamp)  # type: ignore[arg-type]
                            | ((model.created_at == cursor_timestamp) & (model.id < cursor_id))
                        )
                    else:  # asc
                        query = query.filter(
                            (model.created_at > cursor_timestamp)  # type: ignore[arg-type]
                            | ((model.created_at == cursor_timestamp) & (model.id > cursor_id))
                        )
                # Backward pagination - reverse comparison and will need to reverse results
                elif sort_direction.value == "desc":
                    query = query.filter(
                        (model.created_at > cursor_timestamp)  # type: ignore[arg-type]
                        | ((model.created_at == cursor_timestamp) & (model.id > cursor_id))
                    )
                    # Note: Results will come back in wrong order, need to reverse after limit
                    needs_reverse = True
                else:  # asc
                    query = query.filter(
                        (model.created_at < cursor_timestamp)  # type: ignore[arg-type]
                        | ((model.created_at == cursor_timestamp) & (model.id < cursor_id))
                    )
                    # Note: Results will come back in wrong order, need to reverse after limit
                    needs_reverse = True
        except (ValueError, KeyError):
            # Invalid cursor - ignore and continue without cursor filtering
            pass

        return query, needs_reverse

    async def _check_has_items_before(
        self,
        first_item: TModel,
        query_params: dict[str, str],
        filters: list[Filter],
        sort: str | None,
        model: type[TModel],
        special_field_handlers: dict[str, Any] | None = None,
    ) -> bool:
        """Check if any items exist before the given item (toward first page).

        This method is used during backward pagination to determine if we've reached
        the first page. It executes a separate query to check for items that would
        appear BEFORE the first item in the current result set.

        During backward pagination with DESC sort:
        - "Before" means items with created_at > first_item.created_at
        - These are newer items (toward the first page)

        During backward pagination with ASC sort:
        - "Before" means items with created_at < first_item.created_at
        - These are older items (toward the first page)

        Args:
            first_item: The first item in the current result set
            query_params: Query parameters for filtering
            filters: List of filter objects to apply
            sort: Sort parameter (e.g., "-created_at")
            model: BaseResource class to query
            special_field_handlers: Dict mapping field names to custom handler functions

        Returns:
            True if items exist before first_item (not on first page)
            False if no items exist before first_item (on first page)

        """
        # Build query with same filters as main query
        check_query: Select[tuple[TModel]] | SelectOfScalar[tuple[TModel]] = select(model)
        if hasattr(model, "deleted_at"):
            check_query = check_query.filter(model.deleted_at.is_(None))  # type: ignore[attr-defined]

        # Apply same filters as main query
        check_query, _ = self._apply_standard_filters(check_query, query_params, model, special_field_handlers)
        check_query, _ = self._apply_label_filters(check_query, query_params, model)
        if special_field_handlers:
            check_query = self._apply_special_filters(check_query, filters, model, special_field_handlers)

        # Check if any items exist before first_item (using original sort direction, not reversed)
        _, original_sort_direction = parse_sort(sort or "-created_at", model.__sortable_fields__)
        if original_sort_direction.value == "desc":
            # DESC: check if any items have created_at > first_item (newer items toward first page)
            check_query = check_query.filter(
                (model.created_at > first_item.created_at)  # type: ignore[arg-type]
                | ((model.created_at == first_item.created_at) & (model.id > first_item.id))
            )
        else:
            # ASC: check if any items have created_at < first_item (older items toward first page)
            check_query = check_query.filter(
                (model.created_at < first_item.created_at)  # type: ignore[arg-type]
                | ((model.created_at == first_item.created_at) & (model.id < first_item.id))
            )

        check_result = await self.session.exec(check_query.limit(1))  # type: ignore[arg-type]
        return check_result.one_or_none() is not None

    async def _get_total_count(
        self,
        filters: list[Filter],
        model: type[TModel],
        special_field_handlers: dict[str, Any] | None = None,
        label_filters: dict[str, str] | None = None,
    ) -> int:
        """Get total count of resources matching filters.

        Args:
            filters: List of filter objects to apply
            model: BaseResource class to count
            special_field_handlers: Dict mapping field names to custom handler functions
            label_filters: Dict of label filters to apply

        Returns:
            Total count of matching resources

        """
        count_query = select(func.count()).select_from(model)
        # Only apply soft delete filter if model has deleted_at field
        if hasattr(model, "deleted_at"):
            count_query = count_query.filter(model.deleted_at.is_(None))  # type: ignore[attr-defined]

        # Apply regular filters
        regular_filters = [f for f in filters if not special_field_handlers or f.field not in special_field_handlers]
        if regular_filters:
            count_query = apply_filters(count_query, regular_filters, model)  # type: ignore[assignment]

        # Apply special filters
        if special_field_handlers:
            special_filters = [f for f in filters if f.field in special_field_handlers]
            for filter_obj in special_filters:
                handler = special_field_handlers[filter_obj.field]
                count_query = handler(count_query, filter_obj, model)

        # Apply label filters
        if label_filters:
            # Handle empty values (key existence checks) differently than PostgreSQL JSONB
            existence_filters = {k: v for k, v in label_filters.items() if v == ""}
            value_filters = {k: v for k, v in label_filters.items() if v != ""}

            # Apply exact value filters using JSONB contains
            if value_filters:
                count_query = apply_label_filters(count_query, value_filters, model)  # type: ignore[assignment]

            # Apply existence filters using has_key
            if existence_filters and hasattr(model, "labels"):
                for key in existence_filters:
                    count_query = count_query.filter(model.labels.has_key(key))  # type: ignore[attr-defined]

        total_result = await self.session.exec(count_query)
        return total_result.one() or 0

    def _validate_query_params(
        self,
        query_params: dict[str, str],
        model: type[TModel],
    ) -> None:
        """Validate query parameters against model field types using Pydantic.

        Args:
            query_params: Raw query parameters from request
            model: BaseResource class to validate against (reads __filterable_fields__)

        Raises:
            ValueError: If validation fails for any parameter

        """
        for field_name, string_value in query_params.items():
            # Skip validation for fields not in allowed list
            if field_name not in model.__filterable_fields__:
                continue

            # Get field info from model
            field_info = model.model_fields.get(field_name)
            if field_info:
                try:
                    # Just validate, don't store the converted value
                    adapter: TypeAdapter[Any] = TypeAdapter(field_info.annotation)
                    adapter.validate_python(string_value)
                except ValidationError as e:
                    # Extract the first error message for cleaner output
                    error_detail = str(e.errors()[0]["msg"]) if e.errors() else str(e)
                    error_message = f"Invalid value for field '{field_name}': {error_detail}"
                    raise SafeValueError(error_message) from e

    async def list_resources(  # noqa: C901, PLR0912, PLR0915
        self,
        model: type[TModel],
        response_type: type[TResponse],
        response_type_converter: Callable[[TModel], Any] | None = None,
        post_query_callback: Callable[[list[TModel]], Awaitable[None]] | None = None,
        limit: int = 100,
        cursor: str | None = None,
        sort: str | None = None,
        special_field_handlers: dict[str, Any] | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
    ) -> TResponse:
        """List resources with unified filtering, sorting, and cursor-based pagination.

        This method provides the unified way to handle filtering, sorting, pagination,
        and label filtering. ALL services MUST use this method for consistency.

        Pagination Strategy:
            Uses industry-standard "Fetch N+1" pattern for cursor-based pagination:
            1. Fetches limit+1 items to detect if more pages exist
            2. Trims to limit items for response
            3. Generates cursors based on boundary items
            4. For backward pagination, requires second query to detect first page

            Benefits:
            - Consistent performance at any page depth (no OFFSET)
            - Handles real-time data changes gracefully
            - Prevents duplicate/missing items with identical timestamps
            - Aligns with Stripe, GitHub, Shopify, GraphQL Relay standards

        Cursor Format:
            Opaque base64-encoded JSON containing:
            - id: UUID of boundary item
            - created_at: Timestamp of boundary item
            - direction: "next" or "prev"

        Filtering:
            Filterable fields are read from model's __filterable_fields__ attribute.
            Supports:
            - Standard field filters (e.g., ?status=active)
            - Label filters (e.g., ?labels[env]=prod)
            - Special field handlers for complex types (JSON, arrays, etc.)

        Sorting:
            Sortable fields are read from model's __sortable_fields__ attribute.
            Always includes ID as tiebreaker for stable ordering.

        Services can override _handle_response_conversion(), _handle_post_processing() and
        _handle_query_enrichment() methods to provide custom response conversion and post-query processing logic.

        Args:
            model: BaseResource class to query (e.g., Workflow)
            response_type: ResourcesResponse subclass to return (e.g., WorkflowListResponse)
            response_type_converter: Optional function to convert database objects to response objects
            post_query_callback: Optional async callback to process database objects before conversion
            limit: Maximum number of resources to return (fetches limit+1 for N+1 pattern)
            cursor: Cursor token for pagination (None for first page)
            sort: Sort parameter (e.g., "name", "-created_at")
            special_field_handlers: Dict mapping field names to custom handler functions
            query_params_items: Raw query parameter items from request (for filtering)
            include_total: Whether to include total count in response (requires extra COUNT query)

        Returns:
            Typed response object containing:
            - resources: List of items (length <= limit)
            - next: Cursor for next page (null if last page)
            - prev: Cursor for previous page (null if first page)
            - total: Total count (only if include_total=True)

        Example:
            response = await service.list_resources(
                model=Workflow,
                response_type=WorkflowListResponse,
                limit=10,
                cursor=None,
                sort="-created_at",
                query_params_items=[("status", "active")],
            )

        """
        # Extract filtering parameters from query params, excluding pagination/sorting params
        excluded_params = {"limit", "cursor", "sort", "include_total"}
        query_params: dict[str, str] = {}

        if query_params_items:
            query_params = {key: value for key, value in query_params_items if key not in excluded_params}

        # Validate query parameters against model field types
        self._validate_query_params(query_params, model)

        # Build base query with optional soft delete filter
        query: Select[tuple[TModel]] | SelectOfScalar[tuple[TModel]] = select(model)
        # Only apply soft delete filter if model has deleted_at field
        if hasattr(model, "deleted_at"):
            query = query.filter(model.deleted_at.is_(None))  # type: ignore[attr-defined]

        # Apply standard filters
        query, filters = self._apply_standard_filters(query, query_params, model, special_field_handlers)

        # Apply label filters
        query, label_filters = self._apply_label_filters(query, query_params, model)

        # Apply special filters if provided
        if special_field_handlers:
            query = self._apply_special_filters(query, filters, model, special_field_handlers)

        # Detect if this is backward pagination before applying sorting
        is_backward_pagination = False
        if cursor:
            try:
                cursor_data = decode_cursor(cursor)
                direction_str = cursor_data.get("direction", "next")
                is_backward_pagination = direction_str == PaginationDirection.PREV.value
            except (ValueError, KeyError):
                pass

        # Apply sorting (reversed if backward pagination) and pagination
        query, sort_direction = self._apply_sorting(query, sort, model, reverse_for_backward=is_backward_pagination)
        query, needs_reverse = self._apply_cursor_pagination(query, cursor, sort_direction, model)

        # Apply limit+1 for N+1 pattern (fetch one extra to detect if more pages exist)
        query = query.limit(limit + 1)

        # Allow subclasses to extend the query with additional options
        query = self.enrich_query_mixin.enrich(query)

        # Execute query
        result = await self.session.exec(query)  # type: ignore[arg-type]
        resources_list = list(result.all())

        # Reverse results if backward pagination requires it
        if needs_reverse:
            resources_list.reverse()

        resources = resources_list

        # Get total count if requested
        total_count = None
        if include_total:
            total_count = await self._get_total_count(filters, model, special_field_handlers, label_filters)

        # Detect if we're on the first page during backward pagination
        # N+1 pattern can detect "has more" in fetch direction, but during backward pagination
        # we need to check if there are items BEFORE (newer than) the current page
        is_first_page = False
        if is_backward_pagination and len(resources) > 0:
            # Check if any items exist before the first item in our results
            has_items_before = await self._check_has_items_before(  # type: ignore[type-var]
                first_item=resources[0],
                query_params=query_params,
                filters=filters,
                sort=sort,
                model=model,
                special_field_handlers=special_field_handlers,
            )
            is_first_page = not has_items_before

        # Generate pagination response using N+1 pattern
        # The generate_response function will trim items and detect edges
        pagination_metadata = generate_response(
            items=resources,  # type: ignore[arg-type]
            limit=limit,
            cursor=cursor,
            include_total=include_total,
            total_count=total_count,
            is_first_page=is_first_page,
        )

        # Extract trimmed items from pagination response
        trimmed_items = pagination_metadata["trimmed_items"]
        if not isinstance(trimmed_items, list):
            trimmed_resources: list[TModel] = []
        else:
            trimmed_resources = trimmed_items  # type: ignore[assignment]

        # Call post-query callback with TRIMMED database objects
        # Use parameter callback if provided, otherwise use mixin method
        if post_query_callback:
            await post_query_callback(trimmed_resources)
        else:
            await self.post_processing_mixin.post_process(trimmed_resources)

        # Convert database objects to response objects
        # Use parameter converter if provided, otherwise use mixin method
        if response_type_converter:
            converted_resources = [response_type_converter(resource) for resource in trimmed_resources]
        else:
            converted_resources = [
                self.convert_resource_mixin.convert_resource(resource) for resource in trimmed_resources
            ]

        # Construct and return typed response object
        return response_type(
            resources=converted_resources,
            next=pagination_metadata["next"],
            prev=pagination_metadata["prev"],
            total=pagination_metadata["total"],
        )

    async def count_resources(
        self,
        model: type[TModel],
        *,
        special_field_handlers: dict[str, Any] | None = None,
        labels_param: str | None = None,
        **query_params: Any,  # noqa: ANN401
    ) -> int:
        """Count resources with unified filtering across all services.

        Args:
            model: BaseResource class to count (reads __filterable_fields__)
            special_field_handlers: Dict mapping field names to custom handler functions
            labels_param: Optional labels query string parameter
            **query_params: Additional query parameters for filtering

        Returns:
            Total count of matching resources

        """
        # Parse filters
        filters = parse_filters(query_params, model.__filterable_fields__)

        # Parse label filters
        label_filters = parse_label_filter(query_params)
        if labels_param:
            additional_labels = parse_labels_query(labels_param)
            label_filters.update(additional_labels)

        return await self._get_total_count(filters, model, special_field_handlers, label_filters)
