# Feature Specification: Shared API Resources and Conventions

**Feature Branch**: `006-create-shared-resources`
**Created**: 2025-10-09
**Status**: Draft
**Input**: User description: "create shared resources following the contents of prompt.txt"

## Execution Flow (main)
```
1. Parse user description from Input
   ✓ Feature scope: shared base models, schemas, and reusable utilities
2. Extract key concepts from description
   ✓ Identified: base schemas, Pydantic models, filtering utilities, pagination, parameter standards
3. For each unclear aspect:
   ✓ Specification updated - labels changed to key-value pairs, added shared code utilities
4. Fill User Scenarios & Testing section
   ✓ User flow: Developers import shared resources to build consistent APIs
5. Generate Functional Requirements
   ✓ Each requirement is testable (36 functional requirements covering schemas, models, and utilities)
6. Identify Key Entities (if data involved)
   ✓ Key entities: OpenAPI schemas, Pydantic models, and shared utility classes
7. Run Review Checklist
   ✓ No [NEEDS CLARIFICATION] markers
   ✓ Balances WHAT (capabilities) without diving into HOW (implementation details)
8. Return: SUCCESS (spec ready for planning)
```

---

## Quick Guidelines
- Focus on WHAT users need and WHY
- Avoid HOW to implement (no tech stack, APIs, code structure)
- Written for business stakeholders, not developers

### Section Requirements
- **Mandatory sections**: Must be completed for every feature
- **Optional sections**: Include only when relevant to the feature
- When a section doesn't apply, remove it entirely (don't leave as "N/A")

---

## User Scenarios & Testing *(mandatory)*

### Primary User Story
As a developer building components in the Nexus system, I need a shared library of base models, schemas, and reusable functionality so that I can build consistent APIs with common resource patterns, filtering, pagination, and validation logic without duplicating code across components.

### Acceptance Scenarios
1. **Given** I'm building a new API component, **When** I import shared base models, **Then** I can inherit from BaseResource, NamedResource, SoftDeletableResource, UserOwnedResource, or Resource to get consistent field definitions and validation
2. **Given** I need to filter resources by labels, **When** I use label filters with key-value pairs (e.g., labels[environment]=production), **Then** the system returns only resources matching those label criteria
3. **Given** an API endpoint that returns resources, **When** I make a GET request with filtering parameters, **Then** the system applies filters using bracket notation operators (eq, contains, gt, gte, lt, lte) and combines multiple filters with logical AND
4. **Given** I need to filter by multiple values for a single field, **When** I provide comma-separated values or repeat the parameter, **Then** the system treats these as a logical OR
5. **Given** an API endpoint returns a paginated list, **When** I request resources using shared pagination logic, **Then** the response includes next/prev links and optionally total count when include_total=true
6. **Given** any resource schema inherits from shared base models, **When** I examine the OpenAPI schema, **Then** backend-managed fields (id, createdAt, updatedAt, deletedAt, createdBy, updatedBy, deletedBy) are marked as readOnly
7. **Given** I query an API endpoint with sort parameters, **When** I specify sort=name or sort=-name, **Then** the system returns resources in ascending or descending order respectively
8. **Given** I'm implementing filtering in my component, **When** I use shared filter parsing utilities, **Then** bracket notation operators are automatically parsed and converted to database queries

### Edge Cases

**Filtering Edge Cases**:
- What happens when invalid operator is used in filter parameter? Shared filter parser must return appropriate validation error
- How does system handle when both comma-separated and repeated parameters are mixed? System should support both methods consistently
- What happens when limit parameter exceeds maximum allowed value? Shared pagination logic must enforce reasonable limits
- How does system handle nullable properties that are explicitly set to null vs. omitted? Base models must explicitly define nullable fields with proper Pydantic/OpenAPI validation
- How are label filters applied when a resource has multiple labels? Each label filter (labels[key]=value) matches if the resource has that specific key-value pair; multiple label filters are AND'd together
- What happens when filtering by non-existent label keys? Should return empty result set (no resources match), not error
- How does system handle filtering by label key without specifying value? Not supported in initial version; label filters must include both key and value
- What happens when a resource has labels not specified in filter? Resource can still match if it has the filtered label key-value pairs (extra labels don't prevent match)

**Pagination Cursor Edge Cases**:
- What happens when cursor is malformed (invalid Base64 or JSON)? Return 400 Bad Request with error code `invalid_cursor` and message "The provided cursor is malformed"
- What happens when filters change between paginated requests (cursor from old filter set)? Return 400 Bad Request with error code `cursor_filter_mismatch` and instruct client to restart pagination
- What happens when sort parameter changes between paginated requests? Return 400 Bad Request with error code `cursor_sort_mismatch` and instruct client to restart pagination
- What happens when cursor points to a deleted resource? Silently continue pagination from next available resource after the cursor's sort value (no error)
- What happens when cursor is beyond the end of results? Return 200 OK with empty resources array and `next: null` (normal end-of-pagination)
- What happens when no cursor is provided (first page request)? Return first page with `prev: null` and generate `next` cursor if more results exist

---

## Requirements *(mandatory)*

### Functional Requirements

**API Conventions**
- **FR-001**: System MUST use camelCase for all schema property names
- **FR-002**: System MUST use snake_case for all query parameter names
- **FR-003**: System MUST provide a title and description for every property in schemas
- **FR-004**: System MUST mark all backend-managed fields (id, createdAt, updatedAt, deletedAt, createdBy, updatedBy, deletedBy) as readOnly
- **FR-005**: System MUST explicitly set nullable: true for any property that can be unset
- **FR-006**: System MUST mark all properties in base resources as required unless specified otherwise

**Filtering Conventions**
- **FR-007**: System MUST support combining multiple different filter parameters with logical AND
- **FR-008**: System MUST support filtering a single field against multiple values using comma-separated list or repeated parameters (logical OR)
- **FR-009**: System MUST support bracket notation for filter operators: eq, contains, starts_with, gt, gte, lt, lte
  - **Equality operator**: eq (exact match)
  - **String matching operators**: contains (substring match), starts_with (prefix match)
  - **Comparison operators**: gt (greater than), gte (greater than or equal), lt (less than), lte (less than or equal)
- **FR-010**: System MUST support shorthand equality filter for all filter parameters (parameter=value equivalent to parameter[eq]=value)
- **FR-011**: System MUST require bracket notation only when using non-equality operators (contains, starts_with, gt, gte, lt, lte)

**Base Schemas (OpenAPI)**
- **FR-012**: System MUST provide BaseResource schema with id (uuid, readOnly), createdAt (date-time, readOnly), updatedAt (date-time, readOnly), and labels (object/dict of key-value string pairs, nullable)
- **FR-013**: System MUST provide NamedResource schema composed with BaseResource via allOf, adding name (string, required) and description (string, nullable)
- **FR-014**: System MUST provide SoftDeletableResource schema composed with BaseResource via allOf, adding deletedAt (date-time, readOnly, nullable) and deletedBy (uuid, readOnly, nullable)
- **FR-015**: System MUST provide UserOwnedResource schema composed with BaseResource via allOf, adding createdBy (uuid, readOnly) and updatedBy (uuid, readOnly, nullable)
- **FR-016**: System MUST provide Resource schema combining NamedResource, SoftDeletableResource, and UserOwnedResource using allOf

**Base Models (Python/Pydantic)**
- **FR-017**: System MUST provide Python Pydantic base model classes corresponding to each OpenAPI schema
- **FR-018**: Base models MUST use Pydantic Field with validation matching OpenAPI constraints (readOnly via exclude in model_dump, nullable via Optional)
- **FR-019**: Base models MUST include proper type hints and docstrings for all fields
- **FR-020**: Labels field MUST be typed as Dict[str, str] (key-value pairs) with validation for non-empty keys and values

**Error Handling**
- **FR-021**: System MUST provide Error schema with error (string, required), message (string, required), and details (string, nullable)
- **FR-022**: System MUST provide corresponding Error Pydantic model for error responses

**Pagination**
- **FR-023**: System MUST provide ResourcesResponseBase schema with next (uri, nullable), prev (uri, nullable), and total (integer, nullable) properties
- **FR-024**: System MUST include total count only when include_total=true is specified
- **FR-025**: System MUST provide ResourcesResponse schema composed with ResourcesResponseBase via allOf, adding resources array
- **FR-026**: System MUST provide reusable pagination utilities for generating next/prev cursor links

**Query Parameters (OpenAPI)**
- **FR-027**: System MUST provide limitParam with default value of 20, min 1, max 100
- **FR-028**: System MUST provide sortParam accepting sort order format (name for ascending, -name for descending)
- **FR-029**: System MUST provide nameFilterParam supporting standard filtering conventions
- **FR-030**: System MUST provide labelsFilterParam supporting label key-value filtering (e.g., labels[environment]=production)
  - Multiple label filters MUST be combined with logical AND (labels[env]=prod&labels[team]=platform matches resources with BOTH labels)
  - Each label filter matches resources where the specified label key has the specified value
- **FR-031**: System MUST provide includeTotalParam with default value of false

**Shared Utilities (Python)**
- **FR-032**: System MUST provide filter parser utility to convert bracket notation query parameters to database filter objects
- **FR-033**: Filter parser MUST support all standard operators (eq, contains, starts_with, gt, gte, lt, lte) for appropriate field types
- **FR-034**: System MUST provide pagination helper to generate cursor-based next/prev links from query results
- **FR-035**: System MUST provide label filtering utility to match resources by label key-value pairs
- **FR-036**: System MUST provide sort parser utility to convert sort parameters (-field syntax) to database order clauses

### Key Entities *(include if feature involves data)*

**OpenAPI Schemas & Pydantic Models**
- **BaseResource**: Foundational schema representing any resource in the system with system-managed metadata (id, timestamps, labels as key-value pairs)
- **NamedResource**: Extension of BaseResource adding user-provided identification (name, description)
- **SoftDeletableResource**: Extension of BaseResource supporting soft deletion tracking (deletedAt, deletedBy)
- **UserOwnedResource**: Extension of BaseResource tracking resource ownership and modifications (createdBy, updatedBy)
- **Resource**: Composite entity combining all base resource capabilities (naming, soft deletion, ownership tracking)
- **Error**: Standardized error response structure providing error categorization, messages, and optional details
- **ResourcesResponseBase**: Pagination metadata structure providing navigation links and optional total count
- **ResourcesResponse**: Complete paginated response combining pagination metadata with resource array

**Shared Utilities**
- **FilterParser**: Utility to parse bracket notation query parameters and convert them to database filter criteria
- **PaginationHelper**: Utility to generate cursor-based pagination links and handle limit/offset logic
- **LabelFilter**: Utility to apply label key-value filtering to resource queries
- **SortParser**: Utility to parse sort parameters and convert to database ordering clauses

---

## Architecture Diagram

```mermaid
graph TB
    subgraph "OpenAPI Schemas"
        BaseSchema[BaseResource<br/>id, createdAt, updatedAt<br/>labels: Dict[str,str]]
        NamedSchema[NamedResource<br/>name, description]
        SoftSchema[SoftDeletableResource<br/>deletedAt, deletedBy]
        UserSchema[UserOwnedResource<br/>createdBy, updatedBy]
        ResourceSchema[Resource<br/>Complete entity]
        ErrorSchema[Error<br/>error, message, details]
        RespBaseSchema[ResourcesResponseBase<br/>next, prev, total]
        RespSchema[ResourcesResponse<br/>resources array]

        BaseSchema -->|allOf| NamedSchema
        BaseSchema -->|allOf| SoftSchema
        BaseSchema -->|allOf| UserSchema
        NamedSchema -->|allOf| ResourceSchema
        SoftSchema -->|allOf| ResourceSchema
        UserSchema -->|allOf| ResourceSchema
        RespBaseSchema -->|allOf| RespSchema
    end

    subgraph "Pydantic Models"
        BaseModel[BaseResource<br/>Pydantic model]
        NamedModel[NamedResource<br/>Pydantic model]
        SoftModel[SoftDeletableResource<br/>Pydantic model]
        UserModel[UserOwnedResource<br/>Pydantic model]
        ResourceModel[Resource<br/>Pydantic model]
        ErrorModel[Error<br/>Pydantic model]

        BaseSchema -.->|generates| BaseModel
        NamedSchema -.->|generates| NamedModel
        ResourceSchema -.->|generates| ResourceModel
    end

    subgraph "Query Parameters"
        LimitParam[limitParam<br/>default: 20, max: 100]
        SortParam[sortParam<br/>±field syntax]
        NameFilter[nameFilterParam<br/>bracket notation]
        LabelFilter[labelsFilterParam<br/>key-value pairs]
        TotalParam[includeTotalParam<br/>default: false]
    end

    subgraph "Shared Utilities"
        FilterParser[FilterParser<br/>Parse bracket notation]
        PaginationHelper[PaginationHelper<br/>Generate cursor links]
        LabelFilterUtil[LabelFilter<br/>Match label key-values]
        SortParser[SortParser<br/>Parse ±field syntax]
    end

    subgraph "Component APIs"
        Component[Component API Endpoint<br/>Uses shared resources]
    end

    BaseModel --> Component
    ResourceModel --> Component
    LimitParam --> Component
    SortParam --> Component
    NameFilter --> Component
    LabelFilter --> Component

    FilterParser --> Component
    PaginationHelper --> Component
    LabelFilterUtil --> Component
    SortParser --> Component
```

---

## Design Decisions

### OpenAPI Schema Location

**Decision**: Store shared OpenAPI schemas in `specs/006-create-shared-resources/contracts/` during specification phase.

**Rationale**:
- Co-locates contracts with feature specification for easier review and versioning
- Other feature specs can reference these schemas using relative paths
- During implementation, schemas can be moved to a centralized location in `src/nexus/schemas/` as package data files if needed

**Alternative Considered**: Place schemas directly in root-level `openapi/` directory for more intuitive cross-component references. This approach can be adopted during implementation if the team prefers centralized schema management.

**Status**: Open for discussion during implementation planning.

---

## Review & Acceptance Checklist
*GATE: Automated checks run during main() execution*

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status
*Updated by main() during processing*

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed
