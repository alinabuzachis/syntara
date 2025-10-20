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

### In Your Python Code (SQLModel)

Import and extend base SQLModel classes:

```python
from nexus_shared.models import Resource
from sqlmodel import Field

class MyResource(Resource, table=True):
    """My custom resource extending shared Resource SQLModel."""

    __tablename__ = "my_resources"

    custom_field: str = Field(..., description="My custom field")

    # Optional: Custom methods for business logic
    def do_something(self) -> str:
        return f"Processing {self.name}"
```

For API response models (without database table):

```python
from nexus_shared.models import Resource
from sqlmodel import Field

class MyResourceResponse(Resource, table=False):
    """Response model for MyResource (no table=False for API responses)."""

    computed_field: str = Field(..., description="Computed value")
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

5. **Resource** (Recommended): All capabilities combined (Abstract)
   - Use when: Standard resource needing naming, soft deletes, and ownership
   - Note: This is abstract - you must create concrete subclasses with table=True

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
  "next": "eyJpZCI6InV1aWQifQ==",
  "prev": null,
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
    include_total=True,
    total_count=150
)
# Returns: {
#   "next": "eyJpZCI6InV1aWQifQ==",
#   "prev": None,
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

## SQLModel Specific Features

### Database Table Configuration

Base SQLModel classes are abstract - you must create concrete subclasses:

```python
from nexus_shared.models import Resource
from sqlalchemy import create_engine
from sqlmodel import SQLModel, Session

# Create concrete subclass
class MyResource(Resource, table=True):
    __tablename__ = "my_resources"

# Create database engine
engine = create_engine("postgresql://...")

# Create all tables
SQLModel.metadata.create_all(engine)

# Use in database session
with Session(engine) as session:
    resource = MyResource(
        name="Test Resource",
        created_by=user_id,
        labels={"environment": "test"}
    )
    session.add(resource)
    session.commit()
```

### Labels as JSON Column

Labels are stored as JSON in the database for efficient querying:

```python
from sqlalchemy import JSON
from nexus_shared.models import Resource

# Create concrete subclass first
class MyResource(Resource, table=True):
    __tablename__ = "my_resources"

# Query resources by label
with Session(engine) as session:
    # PostgreSQL JSON operator
    resources = session.query(MyResource).filter(
        MyResource.labels["environment"].astext == "production"
    ).all()

    # SQLAlchemy JSON contains
    resources = session.query(MyResource).filter(
        MyResource.labels.op("->>")("environment") == "production"
    ).all()
```

### Soft Delete Patterns

```python
from nexus_shared.models import Resource
from datetime import datetime

# Create concrete subclass first
class MyResource(Resource, table=True):
    __tablename__ = "my_resources"

# Soft delete a resource
resource.soft_delete(user_id)
session.commit()

# Query only active resources
active_resources = session.query(MyResource).filter(
    MyResource.deleted_at.is_(None)
).all()

# Query deleted resources
deleted_resources = session.query(MyResource).filter(
    MyResource.deleted_at.is_not(None)
).all()

# Restore a resource
resource.restore()
session.commit()
```

### Inheritance and Relationships

```python
from nexus_shared.models import Resource, BaseResource
from sqlmodel import Field, Relationship
from typing import List
from uuid import UUID

class Project(Resource, table=True):
    """Project resource with team relationship."""

    __tablename__ = "projects"

    # Custom fields
    budget: float = Field(..., description="Project budget")

    # Relationships to other tables
    team_id: UUID = Field(foreign_key="teams.id")
    team: "Team" = Relationship(back_populates="projects")

class Team(BaseResource, table=True):
    """Team resource."""

    __tablename__ = "teams"

    name: str = Field(..., description="Team name")
    projects: List[Project] = Relationship(back_populates="team")
```

## Example: Complete Resource Endpoint

```python
from fastapi import FastAPI, Query
from typing import Optional
from nexus_shared.models import Resource, ResourcesResponse
from nexus_shared.utils import FilterParser, PaginationHelper, SortParser, LabelFilter

# Create concrete resource class
class MyResource(Resource, table=True):
    __tablename__ = "my_resources"

app = FastAPI()

@app.get("/resources", response_model=ResourcesResponse[MyResource])
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
    query = db.query(MyResource)

    # Apply filters
    for f in filters:
        query = query.filter(f.field, f.operator, f.value)

    # Apply label filters
    if labels:
        # Note: Implementation depends on your database backend
        for key, value in labels.items():
            query = query.filter(MyResource.labels[key].astext == value)

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
        include_total=include_total,
        total_count=len(resources) if include_total else None
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
