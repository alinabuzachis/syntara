"""Base service class for standardized data operations.

This module provides a single base class that ALL services must inherit from to ensure
consistent filtering, sorting, pagination, and label handling across the entire system.
"""

from collections.abc import Iterable
from datetime import datetime
from typing import Any, TypeVar
from uuid import UUID

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from nexus.core.models import User
from nexus.core.models.base import BaseResource, ResourcesResponse

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

# Type variables for BaseResource types and ResourcesResponse types
TModel = TypeVar("TModel", bound=BaseResource)
TResponse = TypeVar("TResponse", bound="ResourcesResponse[Any]")


class BaseService:
    """Base service class for ALL data operations.

    This class provides the ONLY way to handle filtering, sorting, pagination,
    and label filtering across all services. All services MUST inherit from this
    class and use these methods to ensure consistency.
    """

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize service with database session and current user.

        Args:
            session: Async database session for operations
            user: Current authenticated user for audit tracking

        """
        self.session = session
        self.user = user

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
    ) -> tuple[Select[tuple[TModel]] | SelectOfScalar[tuple[TModel]], SortDirection]:
        """Apply sorting to query.

        Args:
            query: SQLAlchemy query to sort
            sort: Sort parameter
            model: BaseResource class to apply sorting to (reads __sortable_fields__)

        Returns:
            Tuple of (sorted_query, sort_direction)

        """
        sort_field, sort_direction = parse_sort(sort, model.__sortable_fields__)
        sorted_query = apply_sorting(query, [(sort_field, sort_direction)], model)
        return sorted_query, sort_direction

    def _apply_cursor_pagination(
        self,
        query: Select[tuple[TModel]] | SelectOfScalar[tuple[TModel]],
        cursor: str | None,
        sort_direction: SortDirection,
        model: type[TModel],
    ) -> Select[tuple[TModel]] | SelectOfScalar[tuple[TModel]]:
        """Apply standard cursor-based pagination to query.

        This is the ONLY pagination method that should be used across all services.

        Args:
            query: SQLAlchemy query to paginate
            cursor: Cursor token for pagination
            sort_direction: Sort direction from sorting step
            model: BaseResource class to get field attributes from

        Returns:
            Query with cursor-based pagination applied

        """
        if not cursor:
            return query

        try:
            cursor_data = decode_cursor(cursor)
            resource_id, created_at, direction = extract_pagination_from_cursor(cursor_data)

            if resource_id and created_at:
                # Convert cursor data to proper types
                cursor_id = UUID(resource_id)
                cursor_timestamp = datetime.fromisoformat(created_at)

                # Apply cursor-based filtering based on sort direction and pagination direction
                if direction == PaginationDirection.NEXT:
                    if sort_direction.value == "desc":
                        query = query.filter(
                            (model.created_at < cursor_timestamp)  # type: ignore[arg-type]
                            | ((model.created_at == cursor_timestamp) & (model.id < cursor_id))
                        )
                    else:
                        query = query.filter(
                            (model.created_at > cursor_timestamp)  # type: ignore[arg-type]
                            | ((model.created_at == cursor_timestamp) & (model.id > cursor_id))
                        )
                elif sort_direction.value == "desc":
                    query = query.filter(
                        (model.created_at > cursor_timestamp)  # type: ignore[arg-type]
                        | ((model.created_at == cursor_timestamp) & (model.id > cursor_id))
                    )
                else:
                    query = query.filter(
                        (model.created_at < cursor_timestamp)  # type: ignore[arg-type]
                        | ((model.created_at == cursor_timestamp) & (model.id < cursor_id))
                    )
        except (ValueError, KeyError):
            # Invalid cursor - ignore and continue without cursor filtering
            pass

        return query

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

        total_result = await self.session.execute(count_query)
        return total_result.scalar() or 0

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
                    raise ValueError(error_message) from e

    def _convert_response_type(self, resource: TModel) -> Any:  # noqa: ANN401
        """Convert database resource to response format.

        This is a no-op implementation that returns the resource as-is.
        Subclasses can override this method to provide custom conversion logic.

        Args:
            resource: Database resource to convert

        Returns:
            Converted resource (by default, returns the resource unchanged)

        """
        return resource

    async def _post_query_callback(self, resources: list[TModel]) -> None:
        """Process resources after database query but before response conversion.

        This is a no-op implementation that does nothing.
        Subclasses can override this method to provide custom processing logic.

        Args:
            resources: List of database resources to process

        """

    async def list_resources(
        self,
        model: type[TModel],
        response_type: type[TResponse],
        limit: int = 100,
        cursor: str | None = None,
        sort: str | None = None,
        special_field_handlers: dict[str, Any] | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
    ) -> TResponse:
        """List resources with unified filtering, sorting, and pagination.

        This method provides the unified way to handle filtering, sorting, pagination,
        and label filtering. ALL services MUST use this method for consistency.

        Filterable and sortable fields are automatically read from the model's
        __filterable_fields__ and __sortable_fields__ class attributes.

        Services can override _convert_response_type() and _post_query_callback() methods
        to provide custom response conversion and post-query processing logic.

        Args:
            model: BaseResource class to query (e.g., Workflow)
            response_type: ResourcesResponse subclass to return (e.g., WorkflowListResponse)
            limit: Maximum number of resources to return
            cursor: Cursor token for pagination
            sort: Sort parameter (e.g., "name", "-created_at")
            special_field_handlers: Dict mapping field names to custom handler functions
            query_params_items: Raw query parameter items from request (for filtering)
            include_total: Whether to include total count in response

        Returns:
            Typed response object (e.g., WorkflowListResponse, ToolProviderListResponse)

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

        # Apply sorting and pagination
        query, sort_direction = self._apply_sorting(query, sort, model)
        query = self._apply_cursor_pagination(query, cursor, sort_direction, model)

        # Apply limit and execute query
        query = query.limit(limit)
        result = await self.session.execute(query)
        resources = result.scalars().all()

        # Call post-query callback with database objects
        await self._post_query_callback(list(resources))

        # Get total count if requested
        total_count = None
        if include_total:
            total_count = await self._get_total_count(filters, model, special_field_handlers, label_filters)

        # Generate pagination response
        pagination_metadata = generate_response(
            items=resources,
            limit=limit,
            cursor=cursor,
            include_total=include_total,
            total_count=total_count,
        )

        # Convert database objects to response objects
        converted_resources = [self._convert_response_type(resource) for resource in resources]

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
