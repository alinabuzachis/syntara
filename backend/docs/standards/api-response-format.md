# API Response Format Standards

This document defines the standard response formats, pagination, filtering, and sorting patterns for Nexus REST API endpoints.

## List Response Shape

All list/collection endpoints return a `ResourcesResponse[T]`:

```json
{
  "resources": [ ... ],
  "next": "eyJpZCI6Ii4uLiIsImNyZWF0ZWRfYXQiOiIuLi4iLCJkaXJlY3Rpb24iOiJuZXh0In0=",
  "prev": null,
  "total": 42
}
```

| Field | Type | Description |
|---|---|---|
| `resources` | `list[T]` | Array of resources (max 100 items) |
| `next` | `str \| null` | Opaque cursor for the next page |
| `prev` | `str \| null` | Opaque cursor for the previous page |
| `total` | `int \| null` | Total count (only present when `include_total=true`) |

The response model is defined generically in `nexus.core.models.pagination`:

```python
class ResourcesResponse[T](ResourcesResponseBase):
    resources: list[T]
    next: str | None
    prev: str | None
    total: int | None
```

## Pagination

### Strategy: Cursor-Based Keyset Pagination

Nexus uses cursor-based pagination, not offset-based. This avoids the consistency problems of offset pagination (duplicates/skips when data changes between requests).

### Query Parameters

Pagination parameters are defined in `BaseListParams`:

```python
class BaseListParams(SQLModel):
    limit: int = Field(default=20, gt=0, le=100)
    cursor: str | None = Field(default=None)
    sort: str | None = Field(default=None)
    include_total: bool = Field(default=False)
```

| Parameter | Default | Constraints | Description |
|---|---|---|---|
| `limit` | 20 | 1–100 | Maximum items to return |
| `cursor` | `null` | Max 1024 bytes | Opaque pagination token |
| `sort` | `-created_at` | Must be in `__sortable_fields__` | Sort field and direction |
| `include_total` | `false` | — | Include total count in response |

### Cursor Format

Cursors are opaque Base64-encoded JSON tokens. Clients must not parse or construct them:

```json
{
    "id": "uuid-of-boundary-item",
    "created_at": "2025-01-01T12:00:00.000000",
    "direction": "next"
}
```

### N+1 Fetch Pattern

The pagination implementation fetches `limit + 1` items to definitively detect whether more pages exist, then trims the response to `limit` items. This avoids an extra count query.

### Stable Ordering

The resource `id` is always appended as a tiebreaker to the sort order. This prevents duplicate or missing items when multiple resources share the same sort value (e.g., identical `created_at` timestamps).

## Constants

Defined in `nexus.core.constants`:

| Constant | Value | Description |
|---|---|---|
| `MAX_ITEMS_PER_PAGE` | 100 | Absolute maximum for `limit` |
| `MAX_CURSOR_SIZE` | 1024 | Maximum cursor token size in bytes |

## Filtering

### Query Parameter Syntax

Two formats are supported:

1. **Shorthand equality:** `?field=value`
2. **Bracket notation:** `?field[operator]=value`

### Supported Operators

| Operator | Description | Example |
|---|---|---|
| `eq` | Exact equality (default) | `?status=ACTIVE` or `?status[eq]=ACTIVE` |
| `contains` | Substring match (case-insensitive) | `?name[contains]=test` |
| `starts_with` | Prefix match (case-insensitive) | `?name[starts_with]=prod` |
| `gt` | Greater than | `?created_at[gt]=2025-01-01` |
| `gte` | Greater than or equal | `?created_at[gte]=2025-01-01` |
| `lt` | Less than | `?size[lt]=1000` |
| `lte` | Less than or equal | `?size[lte]=1000` |

### Label Filters

Labels use bracket notation with the label key:

- `?labels[environment]=production` — filter by label key-value pair
- `?labels[environment]=` — check label key exists (any value)

### Filterable Fields

Each model declares which fields can be filtered via `__filterable_fields__`:

```python
class MyModel(BaseResource, table=True):
    __filterable_fields__: ClassVar[list[str]] = [
        *BaseResource.__filterable_fields__,
        "status",
        "name",
    ]
```

Requests filtering on undeclared fields are ignored (no error).

## Sorting

### Query Parameter Syntax

`?sort=field` for ascending, `?sort=-field` for descending.

**Default sort:** `-created_at` (newest first).

### Sortable Fields

Each model declares sortable fields via `__sortable_fields__`:

```python
class MyModel(BaseResource, table=True):
    __sortable_fields__: ClassVar[list[str]] = [
        *BaseResource.__sortable_fields__,
        "name",
        "status",
    ]
```

## Individual Resource Responses

Single-resource endpoints (`GET /{id}`, `POST`, `PATCH`) return the resource directly — no wrapper:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "my-resource",
  "created_at": "2025-01-01T12:00:00Z",
  "updated_at": "2025-01-01T12:00:00Z",
  "labels": {}
}
```

## URL Path Conventions

Router URL prefixes use **snake_case** (underscores), matching the Python module name:

```
/api/v1/tool_manager     # Correct — matches Python module name
/api/v1/tool-manager     # Wrong — kebab-case not used
```

This applies to all URL path segments. Query parameter names also use snake_case per the constitution.

## Model Naming Conventions

| Purpose | Pattern | Example |
|---|---|---|
| Database table model | `{Resource}` | `Workflow`, `Execution` |
| API creation input | `{Resource}Create` | `WorkflowCreate` |
| API update input | `{Resource}Update` | `WorkflowUpdate` |
| API read response | `{Resource}Read` | `WorkflowRead`, `ApprovalRequestRead` |
| List response alias | `{Resource}ListResponse` | `WorkflowListResponse = ResourcesResponse[WorkflowRead]` |
| Query parameters | `{Resource}ListParams` | `WorkflowListParams(BaseListParams)` |

## Domain-Specific Query Parameters

Extend `BaseListParams` to add domain-specific filters:

```python
class ApprovalListParams(BaseListParams):
    status: ApprovalRequestStatus | None = None
    execution_id: UUID | None = None
```

These fields are injected via `Depends()` in the router:

```python
@router.get("")
async def list_approvals(
    request: Request,
    service: Annotated[ApprovalService, Depends(get_approval_service)],
    params: Annotated[ApprovalListParams, Depends()],
) -> ApprovalListResponse:
    return await service.list(
        limit=params.limit,
        cursor=params.cursor,
        sort=params.sort,
        query_params_items=request.query_params.items(),
        include_total=params.include_total,
    )
```

## Base Resource Model Hierarchy

All database-backed resources inherit from the base model hierarchy:

```
BaseResource
├── id: UUID (auto-generated)
├── created_at: datetime (UTC, auto-set)
├── updated_at: datetime (UTC, auto-updated)
└── labels: dict[str, str] (JSONB)
    │
    ├── NamedResource
    │   ├── name: str (1–255 chars)
    │   └── description: str | None (max 2000 chars)
    │
    ├── SoftDeletableResource
    │   ├── deleted_at: datetime | None
    │   └── deleted_by: UUID | None
    │
    ├── UserOwnedResource
    │   ├── created_by: UUID
    │   └── updated_by: UUID | None
    │
    └── Resource (composite — extends all above)
```

Choose the appropriate base class:

| Base class | Use when |
|---|---|
| `BaseResource` | Minimal: ID, timestamps, labels only |
| `NamedResource` | Resource needs a user-facing name |
| `UserOwnedResource` | Resource tracks who created/modified it |
| `SoftDeletableResource` | Resource supports soft delete |
| `Resource` | Full-featured (name + ownership + soft delete) |

## Soft Delete

Resources inheriting `SoftDeletableResource`:

- Are soft-deleted by setting `deleted_at` and `deleted_by`
- Are automatically filtered from list queries (`WHERE deleted_at IS NULL`)
- Can be restored via `restore()` method (sets both fields to `NULL`)

Methods provided by `SoftDeletableResource`:

```python
resource.soft_delete(user_id=current_user.id)  # sets deleted_at + deleted_by
resource.is_deleted()                           # returns bool
resource.restore()                              # clears deleted_at + deleted_by
```

### cascade_delete Configuration

Relationships to soft-deletable resources use `cascade_delete=False` when the database has `RESTRICT` constraints (prevents deletion if related records exist):

```python
versions: list["WorkflowVersion"] = Relationship(
    back_populates="workflow", cascade_delete=False
)
```

Exception: relationships where parent deletion should remove children (e.g., tool-manager domain) use `cascade_delete=True`.

## Field Validators

### Labels Validation

`BaseResource` validates the `labels` JSONB field before Pydantic coercion:

```python
@field_validator("labels", mode="before")
@classmethod
def validate_labels(cls, v):
    # Must be a dict
    # All keys must be strings
    # All values must be strings
    # Raises SafeValueError with messages from ValidationMessages
```

### Server Defaults

All `BaseResource` fields use PostgreSQL server defaults to ensure consistency for direct SQL inserts:

- `created_at`, `updated_at`: `server_default=text("now()")`
- `labels`: `server_default=text("'{}'::jsonb")`

### JSONB GIN Index

Resources with label filtering should define a GIN index for performance:

```python
class MyModel(Resource, table=True):
    __table_args__ = (
        Index("ix_mymodel_labels", "labels", postgresql_using="gin"),
    )
```

## Tooling vs Convention

**Enforced by tooling:**

- `limit` range validation (Pydantic, 1–100)
- Cursor size validation (max 1024 bytes)
- `__filterable_fields__` / `__sortable_fields__` enforcement in filter/sort utilities

**Convention only:**

- Model naming patterns (`Create`, `Read`, `Update`, `ListParams`, `ListResponse`)
- Extending `__filterable_fields__` / `__sortable_fields__` from parent classes
- Default sort order (`-created_at`)
- Using `BaseListParams` as the base for domain-specific query params

## Compliance Test Suite

The list endpoint compliance test suite (`tests/unit/api/compliance/test_list_endpoint_compliance.py` and `test_list_endpoint_discovery.py`) automatically discovers all list endpoints from the OpenAPI specification and validates each conforms to the standards defined in this document.

### Scope: API Contract, Not Runtime Behavior

**IMPORTANT:** These tests validate the **OpenAPI specification** (the API contract), not runtime behavior. They check:

- ✅ "Does the spec **declare** pagination parameters?" (NOT "Does pagination **work**?")
- ✅ "Does the spec **declare** filter operators?" (NOT "Does filtering **work correctly**?")
- ✅ "Does the response schema **define** required fields?" (NOT "Does the endpoint **return** those fields?")

**Runtime behavior** (does it actually sort/filter/paginate correctly?) is the responsibility of each endpoint's integration/functional tests in `tests/integration/`.

### What it checks

| Test | What it validates |
|------|-------------------|
| `***REMOVED***` | Response schema **declares** all pagination fields from `ResourcesResponse[T]` (`resources`, `next`, `prev`, `total`) |
| `test_declares_pagination_parameters` | Endpoint **declares** `limit`, `cursor`, `sort`, `include_total` query parameters in the spec |
| `test_sort_parameter_constrains_values` | Sort parameter **declares** an `enum` or `pattern` constraint to prevent arbitrary string values |
| `***REMOVED***` | All non-pagination query parameters **declare** allOf schema with type-appropriate operators (string: all 7, datetime: comparison only, boolean/enum/UUID: eq only) |
| `test_exclusions_have_justifications` | All excluded endpoints have meaningful justification (≥20 characters) |
| `test_exclusions_reference_existing_endpoints` | All exclusions reference endpoints that still exist (prevents stale exclusions from deleted endpoints) |
| `test_excluded_endpoints_are_still_noncompliant` | All excluded endpoints still fail at least one compliance check (prevents stale exclusions from fixed endpoints) |

### Exclusion mechanism

Endpoints that return collections but don't follow the standard pattern (e.g., aggregations, batch operations, non-standard legacy endpoints) can be excluded from compliance testing via `tests/unit/api/compliance/list_compliance_exclusions.yaml`.

Each exclusion requires:
- `operation_id` — the OpenAPI operationId
- `reason` — why this endpoint is excluded (minimum 20 characters, should reference a ticket for temporary exclusions)

### Adding a new list endpoint

1. Use `ResourcesResponse[T]` and `BaseListParams` — the test passes automatically
2. If the standard pattern doesn't apply, add the endpoint to `list_compliance_exclusions.yaml` with a justification — this will be reviewed in the PR

### CI integration

The compliance tests run as part of `make test-api-compliance` and `make test-unit`. They are unit tests (no Docker/DB) that validate OpenAPI spec structure.

## Reference

| File | Purpose |
|---|---|
| `src/nexus/core/models/pagination.py` | `ResourcesResponse` and pagination models |
| `src/nexus/core/models/base/query_params.py` | `BaseListParams` |
| `src/nexus/core/models/base/` | Base resource model hierarchy |
| `src/nexus/core/utils/pagination.py` | Cursor pagination implementation |
| `src/nexus/core/utils/filters.py` | Filter parsing and application |
| `src/nexus/core/utils/sorting.py` | Sort parsing and application |
| `src/nexus/core/utils/cursor.py` | Cursor encoding/decoding |
| `src/nexus/core/constants.py` | Pagination constants |
| `src/nexus/core/services/base.py` | `BaseService.list_resources()` |
| `tests/unit/api/compliance/test_list_endpoint_compliance.py` | List endpoint compliance validation tests |
| `tests/unit/api/compliance/test_list_endpoint_discovery.py` | List endpoint discovery mechanism tests |
| `tests/unit/api/compliance/endpoint_discovery.py` | Discovery logic and helpers |
| `tests/unit/api/compliance/list_compliance_exclusions.yaml` | Exclusion registry with justifications |

Generated By: Claude Code
