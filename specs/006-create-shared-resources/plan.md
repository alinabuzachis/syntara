
# Implementation Plan: Shared API Resources and Conventions

**Branch**: `006-create-shared-resources` | **Date**: 2025-10-09 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-create-shared-resources/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, `GEMINI.md` for Gemini CLI, `QWEN.md` for Qwen Code or `AGENTS.md` for opencode).
7. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
Create a comprehensive shared library for the Nexus platform including OpenAPI schemas, Pydantic base models, and reusable utility functions. The library provides foundational base resource models (BaseResource, NamedResource, SoftDeletableResource, UserOwnedResource, Resource) with labels as key-value pairs, standardized filtering conventions with bracket notation operators (eq, contains, starts_with, gt, gte, lt, lte), cursor-based pagination with optional total counts, and shared query parameters. Includes Python utilities for filter parsing, pagination helpers, label filtering, and sort parsing to enable consistent API development across all components without code duplication.

## Implementation Architecture

```mermaid
graph TB
    subgraph "Phase 0: Research"
        Research[research.md<br/>OpenAPI patterns, Pydantic 2.x,<br/>filtering, pagination, labels]
    end

    subgraph "Phase 1: Design Artifacts"
        DataModel[data-model.md<br/>Schemas, Models, Utilities]
        Contracts[contracts/<br/>shared-resources.openapi.yaml]
        ContractsDoc[contracts/README.md<br/>Usage guide]
        Quickstart[quickstart.md<br/>9 test scenarios]
        AgentCtx[CLAUDE.md]
    end

    subgraph "OpenAPI Schemas"
        Base[BaseResource<br/>id, timestamps<br/>labels: Dict[str,str]]
        Named[NamedResource<br/>+ name, description]
        Soft[SoftDeletableResource<br/>+ deletedAt, deletedBy]
        User[UserOwnedResource<br/>+ createdBy, updatedBy]
        Resource[Resource<br/>Composite]
        Error[Error<br/>error, message, details]
        RespBase[ResourcesResponseBase<br/>next, prev, total]
        Resp[ResourcesResponse<br/>+ resources[]]
    end

    subgraph "Pydantic Models"
        BaseModel[BaseResource<br/>Pydantic model]
        NamedModel[NamedResource<br/>Pydantic model]
        ResourceModel[Resource<br/>Pydantic model]
        ErrorModel[Error<br/>Pydantic model]
    end

    subgraph "Shared Utilities"
        FilterP[FilterParser<br/>Bracket notation → Filter[]]
        LabelF[LabelFilter<br/>Match key-value pairs]
        PaginH[PaginationHelper<br/>Cursor encoding/links]
        SortP[SortParser<br/>±field → (field, dir)]
    end

    subgraph "Query Parameters"
        LimitP[limitParam: 20, max 100]
        SortParam[sortParam: ±field]
        LabelsP[labelsFilterParam<br/>labels[key]=value]
        TotalP[includeTotalParam: false]
    end

    Research --> DataModel
    Research --> Contracts

    DataModel --> Contracts
    Contracts --> ContractsDoc
    Contracts --> Quickstart

    Contracts --> Base
    Base --> Named
    Base --> Soft
    Base --> User
    Named --> Resource
    Soft --> Resource
    User --> Resource
    Contracts --> Error
    Contracts --> RespBase
    RespBase --> Resp

    Base -.->|generates| BaseModel
    Named -.->|generates| NamedModel
    Resource -.->|generates| ResourceModel
    Error -.->|generates| ErrorModel

    DataModel --> FilterP
    DataModel --> LabelF
    DataModel --> PaginH
    DataModel --> SortP

    Contracts --> LimitP
    Contracts --> SortParam
    Contracts --> LabelsP
    Contracts --> TotalP

    Quickstart --> AgentCtx

    style Research fill:#e1f5ff
    style DataModel fill:#fff4e1
    style Contracts fill:#fff4e1
    style ContractsDoc fill:#fff4e1
    style Quickstart fill:#fff4e1
    style AgentCtx fill:#fff4e1
    style Base fill:#e8f5e9
    style Named fill:#e8f5e9
    style Soft fill:#e8f5e9
    style User fill:#e8f5e9
    style Resource fill:#c8e6c9
    style Error fill:#e8f5e9
    style BaseModel fill:#fff9c4
    style NamedModel fill:#fff9c4
    style ResourceModel fill:#fff59d
    style FilterP fill:#e1bee7
    style LabelF fill:#e1bee7
    style PaginH fill:#e1bee7
    style SortP fill:#e1bee7
```

**Diagram Key**:
- **Blue**: Research phase
- **Yellow**: Design artifacts (Phase 1)
- **Light Green**: Individual OpenAPI schemas
- **Medium Green**: Composite schemas
- **Light Yellow**: Pydantic models
- **Purple**: Shared utility functions
- **White**: Query parameters

## Technical Context
**Language/Version**: Python 3.12+, OpenAPI 3.0+ (specification format)
**Primary Dependencies**: Pydantic 2.x, FastAPI 0.104+, PyYAML (for OpenAPI spec handling)
**Storage**: N/A (library provides models and utilities, not data storage)
**Testing**: pytest for unit tests, contract tests for OpenAPI validation
**Target Platform**: Python server applications (Linux/macOS)
**Project Type**: single (shared library package)
**Performance Goals**: Filter/sort parsing <1ms per operation, pagination helper <5ms
**Constraints**: Must be framework-agnostic (usable with FastAPI, Flask, Django), zero runtime dependencies beyond Pydantic
**Scale/Scope**: Foundation for all Nexus API components (10+ planned services)

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Modular Architecture
- ✅ **PASS**: Shared library designed as independent, reusable module
- ✅ **PASS**: Clear boundaries between schemas (OpenAPI), models (Pydantic), and utilities (Python functions)
- ✅ **PASS**: Each component (BaseResource, FilterParser, etc.) has well-defined interface and single responsibility

### Test-Driven Development
- ✅ **PASS**: Contract tests will validate OpenAPI schemas first (TDD)
- ✅ **PASS**: Unit tests for Pydantic models will be written before implementation
- ✅ **PASS**: Utility function tests (filter parser, pagination) will follow Red-Green-Refactor cycle

### Explicit Configuration
- ✅ **PASS**: All schema properties explicitly defined with types, constraints, defaults
- ✅ **PASS**: No magic values - defaults documented (limit=20, include_total=false)
- ✅ **PASS**: Pydantic models use explicit Field definitions with validation

### Observability First
- ⚠️ **N/A**: Library code (models and utilities) - observability handled by consuming applications
- Note: Utility functions should be instrumented for logging/tracing when integrated

### API Stability
- ✅ **PASS**: Library will be versioned using semantic versioning
- ✅ **PASS**: Base models designed for extension without breaking changes (inheritance via Pydantic)
- ✅ **PASS**: OpenAPI schemas support deprecation via deprecated field

### Code Quality & Style
- ✅ **PASS**: All classes, functions, properties will have descriptive names and docstrings
- ✅ **PASS**: Naming conventions explicit (camelCase for schemas, snake_case for parameters)
- ✅ **PASS**: Type hints required for all Python code (Pydantic enforces this)
- ✅ **PASS**: No magic numbers - all constants named and documented

**Initial Assessment**: PASS - No violations. Shared library aligns with all constitutional principles.

## Project Structure

### Documentation (this feature)
```
specs/[###-feature]/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure]
```

**Structure Decision**: Option 1 (Single project) - This is a shared library package, not a web or mobile application.

## Filter Parameter Pattern

### Overview
All filterable parameters follow a consistent pattern supporting both simple equality and advanced operator-based filtering using OpenAPI's `deepObject` style with `explode: true`.

### Filter Schema Structure
Each filterable parameter is defined with `allOf` combining two schemas:
1. **Simple string schema**: Direct equality match (`?name=value`)
2. **Object schema**: Operator-based filtering (`?name[operator]=value`)

### Supported Operators

#### String Operators
| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Exact match (case-insensitive) | `?name[eq]=example` |
| `contains` | Substring match (case-insensitive) | `?name[contains]=test` |
| `starts_with` | Prefix match (case-insensitive) | `?name[starts_with]=prod` |
| `gt` | Lexicographical greater than | `?name[gt]=aaa` |
| `gte` | Lexicographical greater than or equal | `?name[gte]=aaa` |
| `lt` | Lexicographical less than | `?name[lt]=zzz` |
| `lte` | Lexicographical less than or equal | `?name[lte]=zzz` |

#### DateTime/Numeric Operators
| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Exact match | `?created_at[eq]=2025-10-09T12:00:00Z` |
| `gt` | Greater than | `?created_at[gt]=2025-10-09T00:00:00Z` |
| `gte` | Greater than or equal | `?created_at[gte]=2025-10-09T00:00:00Z` |
| `lt` | Less than | `?created_at[lt]=2025-10-10T00:00:00Z` |
| `lte` | Less than or equal | `?created_at[lte]=2025-10-10T00:00:00Z` |

### OpenAPI Parameter Template
```yaml
nameFilterParam:
  name: name
  in: query
  required: false
  style: deepObject
  explode: true
  schema:
    allOf:
      - type: string
        description: Exact match of the name (case-insensitive). ?name=<name>
      - type: object
        properties:
          contains:
            title: Contains
            description: Substring to match within the name (case-insensitive). ?name[contains]=<substring>
            type: string
          starts_with:
            title: Starts With
            description: Prefix to match at the start of the name (case-insensitive). ?name[starts_with]=<prefix>
            type: string
          eq:
            title: Equals
            description: Exact match of the name (case-insensitive). ?name[eq]=<name>
            type: string
          gt:
            title: Greater Than
            description: Greater than comparison (lexicographical). ?name[gt]=<name>
            type: string
          gte:
            title: Greater Than Or Equal
            description: Greater than or equal comparison (lexicographical). ?name[gte]=<name>
            type: string
          lt:
            title: Less Than
            description: Less than comparison (lexicographical). ?name[lt]=<name>
            type: string
          lte:
            title: Less Than Or Equal
            description: Less than or equal comparison (lexicographical). ?name[lte]=<name>
            type: string
```

### Usage Examples

**Simple equality** (shorthand):
```
GET /resources?name=example
```

**Substring search**:
```
GET /resources?name[contains]=auth
```

**Prefix match**:
```
GET /resources?name[starts_with]=prod
```

**Range queries**:
```
GET /resources?created_at[gte]=2025-10-01T00:00:00Z&created_at[lt]=2025-11-01T00:00:00Z
```

**Combined filters** (AND logic):
```
GET /resources?name[contains]=service&created_at[gte]=2025-10-01T00:00:00Z
```

**Label filters**:
```
GET /resources?labels[environment]=production&labels[region]=us-east-1
```

### FilterParser Requirements
The `FilterParser` utility must handle:
1. **Simple notation**: `?name=value` → `Filter(field="name", operator="eq", value="value")`
2. **Bracket notation**: `?name[contains]=value` → `Filter(field="name", operator="contains", value="value")`
3. **Type-specific operators**: Validate operator compatibility with field type
4. **Multiple values**: `?name=foo,bar` → Two filters with OR semantics
5. **Validation**: Reject invalid operators and fields not in allowed_fields

## Cursor-Based Pagination Design

### Cursor Format Specification

**Encoding**: Base64-encoded JSON string containing pagination state

**Cursor Structure**:
```json
{
  "last_id": "uuid-string",
  "last_sort_value": "value-of-sort-field",
  "sort_field": "field_name",
  "sort_direction": "asc|desc",
  "filters_hash": "sha256-hash-of-filters"
}
```

**Field Descriptions**:
- `last_id`: UUID of the last item in the current page (required for stable pagination)
- `last_sort_value`: Value of the sort field for the last item (null if unsorted or sort=id)
- `sort_field`: Field name used for sorting (e.g., "created_at", "name")
- `sort_direction`: Sort direction ("asc" or "desc")
- `filters_hash`: SHA-256 hash of applied filters to detect filter changes between requests

**Example Raw Cursor**:
```json
{
  "last_id": "550e8400-e29b-41d4-a716-446655440000",
  "last_sort_value": "2025-10-09T12:00:00Z",
  "sort_field": "created_at",
  "sort_direction": "desc",
  "filters_hash": "a3f5b8c9d2e1f0a7b6c5d4e3f2a1b0c9"
}
```

**Encoded Cursor** (Base64):
```
eyJsYXN0X2lkIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwIiwibGFzdF9zb3J0X3ZhbHVlIjoiMjAyNS0xMC0wOVQxMjowMDowMFoiLCJzb3J0X2ZpZWxkIjoiY3JlYXRlZF9hdCIsInNvcnRfZGlyZWN0aW9uIjoiZGVzYyIsImZpbHRlcnNfaGFzaCI6ImEzZjViOGM5ZDJlMWYwYTdiNmM1ZDRlM2YyYTFiMGM5In0=
```

### Cursor Edge Cases and Error Handling

**Invalid Cursor Format**:
- **Detection**: Base64 decode fails or JSON parse fails
- **Response**: 400 Bad Request with Error response
- **Error Code**: `invalid_cursor`
- **Message**: "The provided cursor is malformed"
- **Behavior**: Client should restart pagination from the beginning (omit cursor parameter)

**Expired/Stale Cursor**:
- **Detection**: `filters_hash` doesn't match current request filters
- **Response**: 400 Bad Request with Error response
- **Error Code**: `cursor_filter_mismatch`
- **Message**: "Cursor is not compatible with current filter parameters"
- **Details**: "Filters have changed since cursor was generated. Please restart pagination."
- **Behavior**: Client must restart pagination with new filters

**Cursor Points to Deleted Resource**:
- **Detection**: `last_id` no longer exists in database
- **Response**: Continue pagination from next available resource after `last_sort_value`
- **Behavior**: Silently skip deleted resource, no error returned
- **Rationale**: Soft-deleted or hard-deleted resources should not break pagination flow

**Cursor Beyond End of Results**:
- **Detection**: No resources found after cursor position
- **Response**: 200 OK with empty `resources` array and `next: null`
- **Behavior**: Normal end-of-pagination response

**Sort Field Changed**:
- **Detection**: `sort_field` or `sort_direction` in cursor doesn't match request `sort` parameter
- **Response**: 400 Bad Request with Error response
- **Error Code**: `cursor_sort_mismatch`
- **Message**: "Cursor is not compatible with current sort parameter"
- **Details**: "Sort order has changed since cursor was generated. Please restart pagination."
- **Behavior**: Client must restart pagination with new sort order

**No Cursor Provided (First Page)**:
- **Detection**: `cursor` parameter is absent or empty
- **Response**: Return first page based on `limit` and other parameters
- **Behavior**: Generate `next` cursor if more results exist, `prev: null`

### PaginationHelper Utility Interface

**Class**: `PaginationHelper`

**Purpose**: Generate cursor-based pagination metadata and query constraints from cursors

**Constructor Parameters**:
```python
PaginationHelper(
    sort_field: str = "created_at",  # Default sort field
    default_limit: int = 20,         # Default page size
    max_limit: int = 100             # Maximum allowed page size
)
```

**Methods**:

#### 1. `decode_cursor(cursor: str) -> CursorData`
Decodes and validates a cursor string.

**Input**: Base64-encoded cursor string
**Output**: `CursorData` object with fields: `last_id`, `last_sort_value`, `sort_field`, `sort_direction`, `filters_hash`
**Raises**:
- `InvalidCursorError` if cursor is malformed
- `CursorFilterMismatchError` if filters_hash doesn't match
- `CursorSortMismatchError` if sort parameters changed

#### 2. `encode_cursor(last_item: dict, sort_field: str, sort_direction: str, filters_hash: str) -> str`
Creates a cursor from the last item in current page.

**Input**:
- `last_item`: Dictionary containing at minimum `id` and the sort field value
- `sort_field`: Field name used for sorting
- `sort_direction`: "asc" or "desc"
- `filters_hash`: SHA-256 hash of applied filters

**Output**: Base64-encoded cursor string
**Returns**: Empty string if `last_item` is None (no results)

#### 3. `compute_filters_hash(filters: List[Filter]) -> str`
Generates stable hash of filter parameters.

**Input**: List of Filter objects (from FilterParser)
**Output**: SHA-256 hash (hexadecimal string)
**Behavior**: Sorts filters by field name before hashing for stability

#### 4. `build_query_constraints(cursor: Optional[str], sort: Optional[str]) -> QueryConstraints`
Converts cursor and sort parameter into database query constraints.

**Input**:
- `cursor`: Optional cursor string from request
- `sort`: Optional sort parameter (e.g., "-created_at", "name")

**Output**: `QueryConstraints` object containing:
```python
{
    "sort_field": str,           # Field to sort by
    "sort_direction": str,       # "asc" or "desc"
    "last_id": Optional[str],    # UUID to paginate after (None for first page)
    "last_sort_value": Optional[Any]  # Sort field value to paginate after
}
```

**Behavior**:
- If cursor is None: Return constraints for first page
- If cursor provided: Validate and extract pagination position
- Parse sort parameter (±field syntax) to determine sort_field and sort_direction

#### 5. `generate_response_metadata(resources: List[dict], limit: int, cursor_data: Optional[CursorData], filters_hash: str, sort_field: str, sort_direction: str, include_total: bool = False, total_count: Optional[int] = None) -> PaginationMetadata`
Generates next/prev cursors and total count for response.

**Input**:
- `resources`: List of resource dictionaries returned by query
- `limit`: Page size limit from request
- `cursor_data`: Decoded cursor from current request (None for first page)
- `filters_hash`: Hash of current filters
- `sort_field`: Current sort field
- `sort_direction`: Current sort direction
- `include_total`: Whether to include total count
- `total_count`: Total count of resources (required if include_total=True)

**Output**: `PaginationMetadata` object:
```python
{
    "next": Optional[str],   # Cursor for next page (None if last page)
    "prev": Optional[str],   # Cursor for previous page (None if first page)
    "total": Optional[int]   # Total count (None if include_total=False)
}
```

**Behavior**:
- Generate `next` cursor from last item if len(resources) == limit (more pages exist)
- Generate `prev` cursor from first item if cursor_data is not None (not first page)
- Include total only if include_total=True

**Example Usage**:
```python
# Initialize helper
pagination = PaginationHelper(sort_field="created_at", default_limit=20, max_limit=100)

# Parse request
cursor = request.query_params.get("cursor")
sort = request.query_params.get("sort", "-created_at")
limit = min(int(request.query_params.get("limit", 20)), 100)

# Get filters and compute hash
filters = filter_parser.parse(request.query_params)
filters_hash = pagination.compute_filters_hash(filters)

# Build query constraints
constraints = pagination.build_query_constraints(cursor, sort)

# Execute query (pseudo-code)
resources = db.query(
    filters=filters,
    sort_field=constraints.sort_field,
    sort_direction=constraints.sort_direction,
    after_id=constraints.last_id,
    after_value=constraints.last_sort_value,
    limit=limit
)

# Generate pagination metadata
cursor_data = pagination.decode_cursor(cursor) if cursor else None
metadata = pagination.generate_response_metadata(
    resources=resources,
    limit=limit,
    cursor_data=cursor_data,
    filters_hash=filters_hash,
    sort_field=constraints.sort_field,
    sort_direction=constraints.sort_direction,
    include_total=request.query_params.get("include_total", False)
)

# Return response
return {
    "resources": resources,
    "next": metadata.next,
    "prev": metadata.prev,
    "total": metadata.total
}
```

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:
   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Generate contract tests** from contracts:
   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `.specify/scripts/bash/update-agent-context.sh claude`
     **IMPORTANT**: Execute it exactly as specified above. Do not add or remove any arguments.
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `.specify/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (contracts/, data-model.md, quickstart.md)
- Follow TDD: Contract tests → Pydantic models → Utility implementations → Integration tests

**Specific Task Categories**:

1. **Contract Test Tasks** (from quickstart.md scenarios):
   - Test OpenAPI schema structure (BaseResource with labels as Dict)
   - Test schema composition via allOf
   - Test label filter parameter definition
   - Test readOnly field definitions
   - Test pagination response structure

2. **Pydantic Model Tasks** (TDD order - tests first):
   - Create BaseResource model with labels: Dict[str, str]
   - Create NamedResource model extending BaseResource
   - Create SoftDeletableResource model
   - Create UserOwnedResource model
   - Create Resource composite model
   - Create Error model
   - Create ResourcesResponseBase and ResourcesResponse models

3. **Utility Implementation Tasks** (TDD order):
   - Implement FilterParser for bracket notation parsing
   - Implement LabelFilter for key-value label matching
   - Implement PaginationHelper for cursor generation
   - Implement SortParser for ±field syntax

4. **Integration Test Tasks** (from spec acceptance scenarios):
   - Test importing and using base models in component
   - Test filter parsing with real query parameters
   - Test label filtering with key-value pairs
   - Test pagination with cursor encoding/decoding
   - Test end-to-end resource filtering and sorting

5. **Documentation Tasks**:
   - Update contracts/README.md with label filtering examples
   - Document utility function usage
   - Create Python module docstrings

**Ordering Strategy**:
- TDD order: Tests before implementation for each component
- Dependency order:
  1. OpenAPI schemas (foundation)
  2. Pydantic models (depend on schemas)
  3. Utility functions (depend on models)
  4. Integration tests (depend on all)
- Mark [P] for parallel execution where independent

**Dependencies**:
- BaseResource schema/model must exist before extensions
- All three extension models before Resource composite
- Models before utilities (utilities use model types)
- Contract tests can run in parallel with model tests

**Estimated Output**: ~30-35 numbered, dependency-ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)
**Phase 4**: Implementation (execute tasks.md following constitutional principles)
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |


## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS - Design maintains all constitutional principles
- [x] All NEEDS CLARIFICATION resolved (no unknowns in Technical Context)
- [x] Complexity deviations documented (none required)

---
*Based on Constitution v1.0.0 - See `.specify/memory/constitution.md`*
