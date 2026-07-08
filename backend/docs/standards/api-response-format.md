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

Cursors are opaque Base64-encoded JSON tokens. Clients must not parse or construct them.

**Default sort** (sorting by `created_at`):

```json
{
    "id": "uuid-of-boundary-item",
    "created_at": "2025-01-01T12:00:00.000000",
    "direction": "next"
}
```

**Custom sort** (sorting by a non-default field, e.g., `?sort=name`):

```json
{
    "id": "uuid-of-boundary-item",
    "created_at": "2025-01-01T12:00:00.000000",
    "direction": "next",
    "sort_field": "name",
    "sort_direction": "asc",
    "sort_value": "my-resource"
}
```

The `sort_field`, `sort_direction`, and `sort_value` fields are only present when the client requests a non-default sort. They store the boundary item's sort column value so the next page fetch can use keyset comparison on the custom sort field.

### N+1 Fetch Pattern

The pagination implementation fetches `limit + 1` items to definitively detect whether more pages exist, then trims the response to `limit` items. This avoids an extra count query.

### Stable Ordering

The resource `id` is always appended as a tiebreaker to the sort order. This prevents duplicate or missing items when multiple resources share the same sort value (e.g., identical `created_at` timestamps). Without a deterministic tiebreaker, cursor boundaries between items sharing the same sort value would be ambiguous, causing items to appear on multiple pages or be skipped entirely.

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

Requests filtering on undeclared fields return a `422` error (`SafeValueError`).

### Filter Combination Logic

Filters are combined using AND/OR semantics based on how they are specified:

| Pattern | Logic | Example | Effect |
|---|---|---|---|
| Same field, same operator, comma-separated values | **OR** | `?status=active,pending` | `status='active' OR status='pending'` |
| Same field, different operators | **AND** | `?created_at[gte]=2025-01-01&created_at[lte]=2025-06-01` | Range filter (both conditions must match) |
| Different fields | **AND** | `?name[contains]=test&status=active` | Both conditions must match |
| Multiple label filters | **AND** | `?labels[env]=prod&labels[team]=platform` | All label conditions must match |

Comma-separated values on the same parameter create multiple `Filter` objects with the same `(field, operator)` tuple, which are grouped and combined with `or_()`. All other filter groups are combined with `and_()`.

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

## Error Responses for Invalid List Parameters

All invalid list parameter errors return HTTP `422 Unprocessable Content` with an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) Problem Details response body and `Content-Type: application/problem+json`.

### Response Format

The error body uses the `ErrorData` model:

| Field | Type | Description |
|---|---|---|
| `type` | `str` (URI) | Problem type identifier (e.g., `https://api.nexus.com/errors/validation-error`) |
| `title` | `str` | Human-readable error category |
| `detail` | `str` | Specific error message (safe to display to end users) |
| `code` | `str` | Machine-readable error code (e.g., `VALIDATION_ERROR`) |
| `retryable` | `bool` | Whether the client should retry the request |
| `instance` | `str \| null` | The request path that triggered the error |

### Error Scenarios

All list parameter validation errors are raised as `SafeValueError` (messages are safe to expose to clients) and handled by `safe_value_error_handler()`:

| Scenario | Example Detail Message |
|---|---|
| Invalid filter field | `"Invalid field: bogus_field"` |
| Invalid filter operator | `"Invalid operator: like"` |
| Invalid sort field | `"Invalid field: bogus_field"` |
| Malformed cursor | `"Invalid cursor format: ..."` |
| Cursor too large | `"Cursor too large (max 1024 bytes)"` |
| Invalid datetime value | `"Invalid datetime format: not-a-date..."` |
| Invalid boolean value | `"Invalid boolean value: maybe..."` |
| Invalid enum value | `"Invalid value 'bogus' for field 'status'. Valid values are: ..."` |

### Example Error Response

```json
{
  "type": "https://api.nexus.com/errors/validation-error",
  "title": "Validation Error",
  "detail": "Invalid field: bogus_field",
  "code": "VALIDATION_ERROR",
  "retryable": false,
  "instance": "/api/v1/workflows"
}
```

### Error Handling Exceptions

Not all validation errors follow the exact pattern above:

| Case | Behavior | Rationale |
|---|---|---|
| AAP proxy endpoints | Upstream validation errors are forwarded as-is | Pass-through proxies to AAP Controller API v2 |
| Generic `ValueError` (not `SafeValueError`) | Returns generic `"Invalid input value"` message | Prevents information leakage — only `SafeValueError` messages are safe to expose |
| Pydantic `RequestValidationError` | Returns 422 with field-level error details (`loc`/`msg`/`type`) | Standard Pydantic validation structure for malformed request parameters |

## Known Exceptions

### AAP Proxy Endpoints

Endpoints under `/api/v1/aap/` are pure HTTP proxies to AAP Controller API v2. They do not use cursor-based pagination or the standard query parameter conventions:

| Aspect | Standard Pattern | AAP Proxy |
|---|---|---|
| Pagination | Cursor-based keyset (N+1) | Offset-based (`page_size`) |
| Response type | `ResourcesResponse[T]` (`resources`, `next`, `prev`, `total`) | `AAPListResponse[T]` (`count`, `results`) |
| Query params | `BaseListParams` (`limit`, `cursor`, `sort`, `include_total`) | `AAPBaseQuery` (`search`, `page_size`, `credential_id`) |
| Filtering | Bracket notation with 7 operators + label filters | `search` string only |
| Sorting | `-field` prefix notation with ID tiebreaker | None (upstream order) |
| Default page size | 20 (max 100) | 50 (max 200) |

**Rationale:** These endpoints proxy an external system (AAP Controller) that has its own pagination contract. Conforming to cursor-based pagination would require caching the upstream result set. AAP proxy endpoints are excluded from compliance testing by the `"aap"` tag in the OpenAPI spec, not via `list_compliance_exclusions.yaml`.

### Custom List Implementations

Some services bypass `BaseService.list_resources()` when they need to sort by joined columns, merge in-memory builtins with database results, or evaluate authorization per-row via OPA. These include `RoleAssignmentService`, `RoleService`, `PolicyService`, `GroupService` (member/group listing), and the `who_can` endpoint. They follow cursor-based keyset pagination conceptually but with custom implementations. Non-compliant spec-level details (e.g., missing filter operators) are tracked in the exclusions YAML below.

### Other Exclusions

All other endpoints that do not conform to the list operation standards are tracked in `tests/unit/api/compliance/list_compliance_exclusions.yaml`. This YAML file is the canonical registry and is enforced by the compliance test suite (stale exclusions are detected automatically). Exclusions fall into two categories:

- **Permanent (by design):** Endpoints that return non-list shapes (metrics aggregations, batch operations, validation results) and will never conform.
- **Temporary (tech debt):** Endpoints that use simple value filters instead of the operator-based pattern, or have non-standard response shapes. These should be migrated over time.

## Tooling vs Convention

**Enforced by tooling:**

- `limit` range validation (Pydantic, 1–100)
- Cursor size validation (max 1024 bytes)
- `__filterable_fields__` / `__sortable_fields__` enforcement in filter/sort utilities
- `SafeValueError` for invalid filter fields, operators, and sort fields (HTTP 422)
- RFC 9457 error response format for all validation errors (`application/problem+json`)

**Convention only:**

- Model naming patterns (`Create`, `Read`, `Update`, `ListParams`, `ListResponse`)
- Extending `__filterable_fields__` / `__sortable_fields__` from parent classes
- Default sort order (`-created_at`)
- Using `BaseListParams` as the base for domain-specific query params
- AND/OR filter combination semantics (enforced at runtime, not by static tooling)

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

### CI integration

The compliance tests run as part of `make test-api-compliance` and `make test-unit`. They are unit tests (no Docker/DB) that validate OpenAPI spec structure.

## Adding a New List Endpoint

1. **Define filterable and sortable fields** on your model:

   ```python
   class MyResource(Resource, table=True):
       __filterable_fields__: ClassVar[list[str]] = [
           *Resource.__filterable_fields__,
           "status",
       ]
       __sortable_fields__: ClassVar[list[str]] = [
           *Resource.__sortable_fields__,
           "name",
       ]
   ```

2. **Create a ListParams class** if your endpoint has domain-specific filters (otherwise use `BaseListParams` directly):

   ```python
   class MyResourceListParams(BaseListParams):
       status: MyStatus | None = None
   ```

3. **Define the read model and response type** (see [Model Naming Conventions](#model-naming-conventions)):

   ```python
   class MyResourceRead(SQLModel):
       """API read response for my resource."""
       id: UUID
       name: str
       status: MyStatus
       created_at: datetime
       updated_at: datetime

   class MyResourceListResponse(ResourcesResponse[MyResourceRead]):
       """Paginated list response for my resources."""
   ```

4. **Wire the router** — inject `Request` to pass raw query params for filter parsing:

   ```python
   @router.get("", operation_id="get_my_resources")
   async def get_my_resources(
       request: Request,
       service: Annotated[MyResourceService, Depends(get_my_resource_service)],
       params: Annotated[MyResourceListParams, Query()],
   ) -> MyResourceListResponse:
       """List my resources with filtering, sorting, and pagination."""
       return await service.list_my_resources(
           limit=params.limit,
           cursor=params.cursor,
           sort=params.sort,
           query_params_items=request.query_params.items(),
           include_total=params.include_total,
       )
   ```

5. **Call `list_resources()` in your service** — pagination, filtering, sorting, and error handling are automatic:

   ```python
   async def list_my_resources(
       self,
       limit: int = 100,
       cursor: str | None = None,
       sort: str | None = None,
       query_params_items: Iterable[tuple[str, str]] | None = None,
       *,
       include_total: bool = False,
   ) -> MyResourceListResponse:
       return await self.list_resources(
           model=MyResource,
           response_type=MyResourceListResponse,
           limit=limit,
           cursor=cursor,
           sort=sort,
           query_params_items=query_params_items,
           include_total=include_total,
       )
   ```

6. **Run `make test-api-compliance`** — if you used `ResourcesResponse[T]` and `BaseListParams`, the compliance tests pass automatically. If the standard pattern doesn't apply, add the endpoint to `list_compliance_exclusions.yaml` with a justification.

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
| `src/nexus/core/models/error.py` | `ErrorData` model (RFC 9457 Problem Details) |
| `src/nexus/core/error_handlers.py` | Error handler functions and `PROBLEM_TYPES` registry |
| `src/nexus/core/exceptions.py` | `SafeValueError` definition |
| `src/nexus/aap/router.py` | AAP proxy endpoints (known exception) |
| `src/nexus/aap/models/responses.py` | `AAPListResponse` model (known exception) |
| `src/nexus/authz/services/role_assignment_service.py` | Custom sorting/pagination (known exception — joined columns) |
| `tests/unit/api/compliance/test_list_endpoint_compliance.py` | List endpoint compliance validation tests |
| `tests/unit/api/compliance/test_list_endpoint_discovery.py` | List endpoint discovery mechanism tests |
| `tests/unit/api/compliance/endpoint_discovery.py` | Discovery logic and helpers |
| `tests/unit/api/compliance/list_compliance_exclusions.yaml` | Exclusion registry with justifications |

Generated By: Claude Code
