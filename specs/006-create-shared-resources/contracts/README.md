# Shared API Resources - OpenAPI Contracts & Pydantic Models

This directory contains the OpenAPI specification and documentation for the shared library of base models, schemas, and utilities used across the Nexus platform.

## Files

- **shared-resources.openapi.yaml**: Complete OpenAPI 3.0 specification defining base schemas, query parameters, and error responses

## Library Components

### 1. OpenAPI Schemas
Reusable schema definitions for API contracts

### 2. Pydantic Models
Python data models with validation (see `src/nexus_shared/models/`)

### 3. Shared Utilities
Helper functions for filtering, pagination, sorting (see `src/nexus_shared/utils/`)

## Using Base Schemas in Your API

### In Your OpenAPI Specifications

Reference shared schemas:

```yaml
components:
  schemas:
    MyResource:
      allOf:
        - $ref: '../shared-resources.openapi.yaml#/components/schemas/Resource'
        - type: object
          required:
            - customField
          properties:
            customField:
              type: string
              description: My custom field
```

### In Your Python Code (Pydantic)

Import and extend base models:

```python
from nexus_shared.models import Resource
from pydantic import Field

class MyResource(Resource):
    """My custom resource extending shared Resource model."""

    custom_field: str = Field(..., description="My custom field")
```

## Schema Hierarchy

Choose the appropriate base schema:

1. **BaseResource**: Minimal (id, timestamps, labels)
   - Use when: Basic system metadata only

2. **NamedResource**: BaseResource + name, description
   - Use when: Resource needs human-readable identification

3. **SoftDeletableResource**: BaseResource + soft delete tracking
   - Use when: Resource should support soft deletion

4. **UserOwnedResource**: BaseResource + ownership tracking
   - Use when: Resource needs audit trail

5. **Resource** (Recommended): All capabilities combined
   - Use when: Standard resource needing naming, soft deletes, and ownership

## Labels (Key-Value Pairs)

Labels are structured metadata as key-value string pairs:

```json
{
  "labels": {
    "environment": "production",
    "region": "us-east-1",
    "team": "platform",
    "cost-center": "engineering"
  }
}
```

### Filtering by Labels

Use bracket notation to filter by specific label keys:

```
GET /resources?labels[environment]=production
GET /resources?labels[environment]=production&labels[region]=us-east-1
```

Multiple label filters use AND logic (all must match).

### Python Example

```python
from nexus_shared.utils import LabelFilter

# Check if resource matches label criteria
matches = LabelFilter.matches(
    resource_labels={"environment": "production", "region": "us-east-1"},
    filter_labels={"environment": "production"}
)
# Returns: True

# Parse label filters from query params
label_filters = LabelFilter.parse_label_filter({
    "labels[environment]": "production",
    "labels[region]": "us-east-1"
})
# Returns: {"environment": "production", "region": "us-east-1"}
```

## Filtering Conventions

All filter parameters support bracket notation operators:

### Operators

| Operator | Description | Example |
|----------|-------------|---------|
| eq | Equals (exact match) | `name=value` or `name[eq]=value` |
| contains | Substring match | `name[contains]=auth` |
| gt | Greater than | `created_at[gt]=2025-01-01T00:00:00Z` |
| gte | Greater than or equal | `created_at[gte]=2025-01-01T00:00:00Z` |
| lt | Less than | `created_at[lt]=2025-12-31T23:59:59Z` |
| lte | Less than or equal | `created_at[lte]=2025-12-31T23:59:59Z` |

### Combining Filters

- **Multiple parameters (AND)**: `?name=example&status=active`
- **Multiple values (OR)**: `?name=foo,bar` or `?name=foo&name=bar`

### Python Example

```python
from nexus_shared.utils import FilterParser

# Parse query parameters
filters = FilterParser.parse(
    params={"name[contains]": "auth", "status": "active"},
    allowed_fields=["name", "status", "created_at"]
)
# Returns: [
#   Filter(field="name", operator=FilterOperator.CONTAINS, value="auth"),
#   Filter(field="status", operator=FilterOperator.EQ, value="active")
# ]
```

## Pagination

Use cursor-based pagination for scalability:

```
GET /resources?limit=20&cursor=eyJpZCI6InV1aWQifQ
```

### Response Format

```json
{
  "resources": [...],
  "next": "https://api.example.com/resources?cursor=next_token&limit=20",
  "prev": "https://api.example.com/resources?cursor=prev_token&limit=20",
  "total": 150
}
```

### Python Example

```python
from nexus_shared.utils import PaginationHelper

# Generate paginated response
response = PaginationHelper.generate_response(
    items=resources,
    limit=20,
    cursor=request_cursor,
    base_url="https://api.example.com/resources",
    include_total=True,
    total_count=150
)
# Returns: {
#   "next": "...",
#   "prev": "...",
#   "total": 150
# }
```

## Sorting

Use simple ±field syntax:

```
GET /resources?sort=name          # Ascending
GET /resources?sort=-created_at   # Descending
```

### Python Example

```python
from nexus_shared.utils import SortParser, SortDirection

# Parse sort parameter
field, direction = SortParser.parse(
    sort_param="-created_at",
    allowed_fields=["name", "created_at"]
)
# Returns: ("created_at", SortDirection.DESC)
```

## Error Responses

Use standardized error schema:

```json
{
  "error": "validation_error",
  "message": "The 'name' field is required",
  "details": "Field 'name' must be between 1 and 255 characters"
}
```

### Python Example

```python
from nexus_shared.models import Error
from fastapi import HTTPException

# Raise standardized error
error = Error(
    error="validation_error",
    message="The 'name' field is required",
    details="Field 'name' must be between 1 and 255 characters"
)
raise HTTPException(status_code=400, detail=error.model_dump())
```

## Naming Conventions

### Schema Properties (camelCase)
```json
{
  "createdAt": "2025-10-09T12:00:00Z",
  "updatedAt": "2025-10-09T12:30:00Z",
  "resourceName": "example"
}
```

### Query Parameters (snake_case)
```
?created_at[gte]=2025-01-01T00:00:00Z&resource_name=example&include_total=true
```

### Python Code (snake_case, PEP 8)
```python
created_at: datetime
updated_at: datetime
resource_name: str
```

## Validation

### Backend-Managed Fields (readOnly)

These fields are automatically managed and excluded from request validation:

- `id` (UUID generated by backend)
- `created_at`, `updated_at`, `deleted_at` (system timestamps)
- `created_by`, `updated_by`, `deleted_by` (from auth context)

Pydantic models use `Field(exclude=True)` to prevent these in request bodies.

### Nullable Fields

Fields marked `nullable: true` can be `null` or omitted:

- `description`, `labels` (optional metadata)
- `deleted_at`, `deleted_by` (null when not deleted)
- `updated_by` (null if never updated)

Use `Optional[T]` in Pydantic models.

## Example: Complete Resource Endpoint

```python
from fastapi import FastAPI, Query
from typing import Optional
from nexus_shared.models import Resource, ResourcesResponse
from nexus_shared.utils import FilterParser, PaginationHelper, SortParser, LabelFilter

app = FastAPI()

@app.get("/resources", response_model=ResourcesResponse[Resource])
async def list_resources(
    limit: int = Query(20, ge=1, le=100),
    sort: Optional[str] = None,
    cursor: Optional[str] = None,
    name: Optional[str] = None,
    labels: Optional[dict[str, str]] = None,
    include_total: bool = Query(False)
):
    # Parse filters
    filter_params = {}
    if name:
        filter_params["name"] = name
    filters = FilterParser.parse(filter_params, allowed_fields=["name", "created_at"])

    # Parse sort
    sort_field, sort_direction = SortParser.parse(
        sort,
        allowed_fields=["name", "created_at"]
    )

    # Query database (pseudo-code)
    query = db.query(Resource)

    # Apply filters
    for f in filters:
        query = query.filter(f.field, f.operator, f.value)

    # Apply label filters
    if labels:
        query = query.filter(LabelFilter.sql_condition(labels))

    # Apply sort
    query = query.order_by(sort_field, sort_direction)

    # Apply pagination
    query = query.limit(limit + 1)  # +1 to check if there's a next page

    resources = query.all()

    # Generate paginated response
    return PaginationHelper.generate_response(
        items=resources[:limit],
        limit=limit,
        cursor=cursor,
        base_url="https://api.example.com/resources",
        include_total=include_total
    )
```

## Testing

See [quickstart.md](../quickstart.md) for test examples validating:
- Schema structure and composition
- ReadOnly field enforcement
- Nullable property handling
- Query parameter definitions
- Pagination response structure
- Error response format

## References

- [OpenAPI 3.0 Specification](https://spec.openapis.org/oas/v3.0.3)
- [Pydantic 2.x Documentation](https://docs.pydantic.dev/latest/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Feature Specification](../spec.md)
- [Data Model](../data-model.md)
- [Research Document](../research.md)
