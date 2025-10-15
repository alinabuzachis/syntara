# Data Model: Shared API Resources

**Feature**: 006-create-shared-resources
**Date**: 2025-10-09

## Overview

This document defines the complete data model for the shared library including OpenAPI schemas, Pydantic base models, and shared utility classes. These components establish foundational patterns used across all API resources in the Nexus platform.

## OpenAPI Schema Definitions

### BaseResource Schema

**Description**: Foundational OpenAPI schema for all API resources with system-managed metadata.

**Properties**:
| Property | Type | Required | Nullable | ReadOnly | Description |
|----------|------|----------|----------|----------|-------------|
| id | uuid | Yes | No | Yes | Unique identifier for the resource |
| createdAt | date-time | Yes | No | Yes | Timestamp when resource was created |
| updatedAt | date-time | Yes | No | Yes | Timestamp when resource was last updated |
| labels | object (Dict[str,str]) | No | Yes | No | Key-value pairs for resource labeling |

**Validation Rules**:
- `id`: Must be valid UUID v4 format
- `createdAt`: Must be ISO 8601 date-time format
- `updatedAt`: Must be ISO 8601 date-time format, >= createdAt
- `labels`: Object with string keys and string values, keys/values non-empty

**OpenAPI Definition**:
```yaml
BaseResource:
  type: object
  required: [id, createdAt, updatedAt]
  properties:
    id:
      type: string
      format: uuid
      readOnly: true
    createdAt:
      type: string
      format: date-time
      readOnly: true
    updatedAt:
      type: string
      format: date-time
      readOnly: true
    labels:
      type: object
      additionalProperties:
        type: string
      nullable: true
```

---

### NamedResource Schema

**Description**: Extension of BaseResource adding user-provided identification.

**Composition**: `allOf: [BaseResource]`

**Additional Properties**:
| Property | Type | Required | Nullable | ReadOnly | Description |
|----------|------|----------|----------|----------|-------------|
| name | string | Yes | No | No | Human-readable name for the resource |
| description | string | No | Yes | No | Detailed description of the resource |

**Validation Rules**:
- `name`: 1-255 characters, unique within resource type
- `description`: Max 2000 characters when present

---

### SoftDeletableResource Schema

**Description**: Extension of BaseResource supporting soft deletion tracking.

**Composition**: `allOf: [BaseResource]`

**Additional Properties**:
| Property | Type | Required | Nullable | ReadOnly | Description |
|----------|------|----------|----------|----------|-------------|
| deletedAt | date-time | No | Yes | Yes | Timestamp when resource was soft deleted |
| deletedBy | uuid | No | Yes | Yes | User who performed the soft delete |

**State Transitions**:
```
[Active] --soft delete--> [Deleted]
         deletedAt = now()
         deletedBy = current_user

[Deleted] --restore--> [Active]
          deletedAt = null
          deletedBy = null
```

---

### UserOwnedResource Schema

**Description**: Extension of BaseResource tracking resource ownership and modifications.

**Composition**: `allOf: [BaseResource]`

**Additional Properties**:
| Property | Type | Required | Nullable | ReadOnly | Description |
|----------|------|----------|----------|----------|-------------|
| createdBy | uuid | Yes | No | Yes | User who created the resource |
| updatedBy | uuid | No | Yes | Yes | User who last updated the resource |

---

### Resource Schema

**Description**: Composite entity combining all base resource capabilities.

**Composition**: `allOf: [NamedResource, SoftDeletableResource, UserOwnedResource]`

**Complete Property Set** (from all composed schemas):
- id, createdAt, updatedAt, labels (from BaseResource)
- name, description (from NamedResource)
- deletedAt, deletedBy (from SoftDeletableResource)
- createdBy, updatedBy (from UserOwnedResource)

---

### Error Schema

**Description**: Standardized error response structure.

**Properties**:
| Property | Type | Required | Nullable | ReadOnly | Description |
|----------|------|----------|----------|----------|-------------|
| error | string | Yes | No | No | Error category/code in snake_case |
| message | string | Yes | No | No | Human-readable error message |
| details | string | No | Yes | No | Additional error details or context |

---

### ResourcesResponseBase Schema

**Description**: Pagination metadata structure.

**Properties**:
| Property | Type | Required | Nullable | ReadOnly | Description |
|----------|------|----------|----------|----------|-------------|
| next | uri | No | Yes | No | URI for next page of results |
| prev | uri | No | Yes | No | URI for previous page of results |
| total | integer | No | Yes | No | Total count (when include_total=true) |

---

### ResourcesResponse Schema

**Description**: Complete paginated response.

**Composition**: `allOf: [ResourcesResponseBase]`

**Additional Properties**:
| Property | Type | Required | Nullable | ReadOnly | Description |
|----------|------|----------|----------|----------|-------------|
| resources | array[Resource] | Yes | No | No | Array of resources in current page |

---

## Pydantic Model Definitions

### BaseResource Model

**Purpose**: Python Pydantic model for BaseResource with validation.

**Implementation**:
```python
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict
from datetime import datetime
from uuid import UUID

class BaseResource(BaseModel):
    """Base model for all API resources with system-managed metadata."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID = Field(
        ...,
        description="Unique identifier for the resource",
        exclude=True  # Excluded from request bodies
    )
    created_at: datetime = Field(
        ...,
        alias="createdAt",
        description="Timestamp when resource was created",
        exclude=True
    )
    updated_at: datetime = Field(
        ...,
        alias="updatedAt",
        description="Timestamp when resource was last updated",
        exclude=True
    )
    labels: Optional[Dict[str, str]] = Field(
        None,
        description="Key-value pairs for resource labeling"
    )
```

**Key Features**:
- `Field(exclude=True)` prevents readOnly fields from being in request validation
- `alias="camelCase"` for JSON serialization
- `ConfigDict(from_attributes=True)` for ORM integration
- Type hints enforce validation

---

### NamedResource Model

**Purpose**: Extension of BaseResource with name and description.

**Implementation**:
```python
class NamedResource(BaseResource):
    """Resource with human-readable name and description."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Human-readable name for the resource"
    )
    description: Optional[str] = Field(
        None,
        max_length=2000,
        description="Detailed description of the resource"
    )
```

---

### SoftDeletableResource Model

**Purpose**: Extension with soft delete tracking.

**Implementation**:
```python
class SoftDeletableResource(BaseResource):
    """Resource supporting soft deletion tracking."""

    deleted_at: Optional[datetime] = Field(
        None,
        alias="deletedAt",
        description="Timestamp when resource was soft deleted",
        exclude=True
    )
    deleted_by: Optional[UUID] = Field(
        None,
        alias="deletedBy",
        description="User who performed the soft delete",
        exclude=True
    )
```

---

### UserOwnedResource Model

**Purpose**: Extension with ownership tracking.

**Implementation**:
```python
class UserOwnedResource(BaseResource):
    """Resource tracking ownership and modifications."""

    created_by: UUID = Field(
        ...,
        alias="createdBy",
        description="User who created the resource",
        exclude=True
    )
    updated_by: Optional[UUID] = Field(
        None,
        alias="updatedBy",
        description="User who last updated the resource",
        exclude=True
    )
```

---

### Resource Model

**Purpose**: Composite model with all capabilities.

**Implementation**:
```python
class Resource(NamedResource, SoftDeletableResource, UserOwnedResource):
    """Complete resource combining all base capabilities."""
    pass  # Inherits all fields from parent classes
```

**Inherited Fields**:
- All BaseResource fields (via all parents)
- name, description (from NamedResource)
- deleted_at, deleted_by (from SoftDeletableResource)
- created_by, updated_by (from UserOwnedResource)

---

### Error Model

**Purpose**: Pydantic model for error responses.

**Implementation**:
```python
class Error(BaseModel):
    """Standardized error response."""

    error: str = Field(..., description="Error category/code in snake_case")
    message: str = Field(..., max_length=500, description="Human-readable error message")
    details: Optional[str] = Field(None, max_length=2000, description="Additional error details")
```

---

### ResourcesResponseBase Model

**Purpose**: Pagination metadata.

**Implementation**:
```python
from pydantic import HttpUrl

class ResourcesResponseBase(BaseModel):
    """Pagination metadata for list responses."""

    next: Optional[HttpUrl] = Field(None, description="URI for next page of results")
    prev: Optional[HttpUrl] = Field(None, description="URI for previous page of results")
    total: Optional[int] = Field(None, ge=0, description="Total count of resources")
```

---

### ResourcesResponse Model

**Purpose**: Complete paginated response.

**Implementation**:
```python
from typing import List, Generic, TypeVar

T = TypeVar('T')

class ResourcesResponse(ResourcesResponseBase, Generic[T]):
    """Complete paginated response with resources."""

    resources: List[T] = Field(..., description="Array of resources in current page")
```

**Usage**:
```python
response = ResourcesResponse[Resource](
    resources=[...],
    next="https://api.example.com/resources?cursor=abc",
    prev=None,
    total=100
)
```

---

## Shared Utility Classes

### FilterParser

**Purpose**: Parse bracket notation query parameters into filter objects.

**Interface**:
```python
from dataclasses import dataclass
from typing import List, Dict, Any
from enum import Enum

class FilterOperator(str, Enum):
    EQ = "eq"
    CONTAINS = "contains"
    STARTS_WITH = "starts_with"
    GT = "gt"
    GTE = "gte"
    LT = "lt"
    LTE = "lte"

@dataclass
class Filter:
    field: str
    operator: FilterOperator
    value: Any

class FilterParser:
    """Parse query parameters into filter objects."""

    @staticmethod
    def parse(params: Dict[str, str], allowed_fields: List[str]) -> List[Filter]:
        """
        Parse query parameters into structured filter objects.

        Args:
            params: Query parameters dict (e.g., {"name[contains]": "test"})
            allowed_fields: List of field names that can be filtered

        Returns:
            List of Filter objects

        Raises:
            ValueError: If invalid operator or field name
        """
        pass  # Implementation in code
```

**Parsing Logic**:
1. Match `field[operator]=value` or `field=value` (shorthand for eq)
2. Validate field in allowed_fields
3. Validate operator in FilterOperator enum (eq, contains, starts_with, gt, gte, lt, lte)
4. Handle comma-separated values (create multiple filters with OR semantics)
5. Return list of Filter objects

**Supported Operators by Type**:
- **String fields**: eq, contains, starts_with, gt, gte, lt, lte
- **DateTime fields**: eq, gt, gte, lt, lte
- **Numeric fields**: eq, gt, gte, lt, lte
- **Label filters**: eq only (implicit in key-value matching)

---

### PaginationHelper

**Purpose**: Generate cursor-based pagination links.

**Interface**:
```python
from typing import Optional, Any

class PaginationHelper:
    """Generate cursor-based pagination responses."""

    @staticmethod
    def generate_response(
        items: List[Any],
        limit: int,
        cursor: Optional[str],
        base_url: str,
        include_total: bool = False,
        total_count: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Generate paginated response with next/prev links.

        Args:
            items: List of items for current page
            limit: Items per page limit
            cursor: Current cursor token (None for first page)
            base_url: Base URL for generating links
            include_total: Whether to include total count
            total_count: Total count if include_total is True

        Returns:
            Dict with next, prev, total fields
        """
        pass  # Implementation in code

    @staticmethod
    def encode_cursor(last_item: Any) -> str:
        """Encode cursor token from last item."""
        pass

    @staticmethod
    def decode_cursor(cursor: str) -> Dict[str, Any]:
        """Decode cursor token to dict."""
        pass
```

**Cursor Format**:
- Base64-encoded JSON: `{"id": "uuid", "created_at": "iso8601"}`
- Includes tie-breaker for consistent ordering

---

### LabelFilter

**Purpose**: Match resources by label key-value pairs.

**Interface**:
```python
class LabelFilter:
    """Filter resources by label key-value pairs."""

    @staticmethod
    def matches(
        resource_labels: Optional[Dict[str, str]],
        filter_labels: Dict[str, str]
    ) -> bool:
        """
        Check if resource labels match filter criteria.

        Args:
            resource_labels: Labels on the resource (can be None)
            filter_labels: Label criteria to match

        Returns:
            True if all filter labels exist in resource labels
        """
        pass  # Implementation in code

    @staticmethod
    def parse_label_filter(params: Dict[str, str]) -> Dict[str, str]:
        """
        Parse label filter parameters from query params.

        Example: {"labels[environment]": "production"} -> {"environment": "production"}
        """
        pass
```

**Matching Logic**:
- All filter label key-value pairs must exist in resource labels
- Resource can have additional labels not in filter
- None/empty resource labels matches only if filter is empty

---

### SortParser

**Purpose**: Parse sort parameters into field and direction.

**Interface**:
```python
from enum import Enum
from typing import Tuple

class SortDirection(str, Enum):
    ASC = "asc"
    DESC = "desc"

class SortParser:
    """Parse sort parameters."""

    @staticmethod
    def parse(
        sort_param: Optional[str],
        allowed_fields: List[str],
        default_field: str = "created_at",
        default_direction: SortDirection = SortDirection.DESC
    ) -> Tuple[str, SortDirection]:
        """
        Parse sort parameter into (field, direction).

        Args:
            sort_param: Sort parameter (e.g., "name" or "-created_at")
            allowed_fields: List of fields that can be sorted
            default_field: Default field if sort_param is None
            default_direction: Default direction if sort_param is None

        Returns:
            Tuple of (field_name, direction)

        Raises:
            ValueError: If invalid field name
        """
        pass  # Implementation in code
```

**Parsing Logic**:
1. If starts with `-`, direction is DESC, remove prefix
2. Otherwise direction is ASC
3. Validate field in allowed_fields
4. Return (field, direction) tuple

---

## Query Parameter Definitions

### limitParam

| Property | Value |
|----------|-------|
| Type | integer |
| Default | 20 |
| Min | 1 |
| Max | 100 |
| Description | Number of resources per page |

---

### sortParam

| Property | Value |
|----------|-------|
| Type | string |
| Format | `field` or `-field` |
| Example | `-created_at` |
| Description | Sort field and direction |

---

### nameFilterParam

| Property | Value |
|----------|-------|
| Type | string or object |
| Operators | eq, contains, starts_with, gt, gte, lt, lte |
| Example (simple) | `name=auth` |
| Example (operator) | `name[contains]=auth` or `name[starts_with]=prod` |
| Description | Filter by name with string operators |

---

### labelsFilterParam

| Property | Value |
|----------|-------|
| Type | object (key-value) |
| Format | `labels[key]=value` |
| Example | `labels[environment]=production` |
| Description | Filter by label key-value |

---

### includeTotalParam

| Property | Value |
|----------|-------|
| Type | boolean |
| Default | false |
| Description | Include total count in response |

---

## Filtering Conventions

### Operator Support

| Operator | Applies To | Example |
|----------|-----------|---------|
| eq | All types | `name=value` or `name[eq]=value` |
| contains | String fields | `name[contains]=substring` |
| starts_with | String fields | `name[starts_with]=prefix` |
| gt | String (lexicographic), numeric, datetime | `created_at[gt]=2025-01-01T00:00:00Z` or `name[gt]=aaa` |
| gte | String (lexicographic), numeric, datetime | `created_at[gte]=2025-01-01T00:00:00Z` or `name[gte]=aaa` |
| lt | String (lexicographic), numeric, datetime | `created_at[lt]=2025-12-31T23:59:59Z` or `name[lt]=zzz` |
| lte | String (lexicographic), numeric, datetime | `created_at[lte]=2025-12-31T23:59:59Z` or `name[lte]=zzz` |

### Combining Filters

- **Multiple parameters**: Combined with AND
  - `name[contains]=example&created_at[gte]=2025-10-01T00:00:00Z`

- **Multiple values**: Combined with OR
  - `name=foo,bar` or `name=foo&name=bar`

### Filter Parameter Structure

All filterable parameters use OpenAPI `deepObject` style with `explode: true` and an `allOf` schema:
1. **Simple form**: Direct string value for equality (`?name=value`)
2. **Object form**: Operator-based filtering (`?name[operator]=value`)

This allows both compact shorthand syntax and explicit operator-based queries.

---

## References

- [Feature Specification](spec.md)
- [Research Document](research.md)
- [Architecture Decision Records](../../decision-records.md)
- [OpenAPI 3.0 Specification](https://spec.openapis.org/oas/v3.0.3)
- [Pydantic 2.x Documentation](https://docs.pydantic.dev/latest/)
