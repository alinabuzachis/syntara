# Research: Shared API Resources and Conventions

**Feature**: 006-create-shared-resources
**Date**: 2025-10-09
**Status**: Complete

## Overview

This document captures research findings and design decisions for implementing a comprehensive shared library including OpenAPI schemas, Pydantic base models, and reusable utility functions for the Nexus platform.

## Research Areas

### 1. OpenAPI Schema Composition Patterns

**Decision**: Use `allOf` for schema composition and inheritance

**Rationale**:
- `allOf` is the standard OpenAPI mechanism for schema composition
- Enables clean inheritance hierarchies (BaseResource → NamedResource → Resource)
- Allows multiple schema composition (Resource combines NamedResource, SoftDeletableResource, UserOwnedResource)
- Better tooling support than `oneOf` or `anyOf` for inheritance patterns
- Type-safe validation across composition boundaries

**Alternatives Considered**:
- **Direct property inclusion**: Would duplicate properties across schemas, violating DRY
- **oneOf/anyOf**: Designed for discriminated unions, not inheritance
- **$ref only**: Would require separate definitions without composition semantics

**References**:
- OpenAPI 3.0 Specification: Schema Composition
- FastAPI documentation on schema inheritance

### 2. Labels as Key-Value Pairs

**Decision**: Define labels as object/dict with string keys and string values (Dict[str, str])

**Rationale**:
- Key-value pairs provide structured metadata more useful than simple tags
- Enables precise filtering (e.g., `labels[environment]=production` vs just `labels=production`)
- Standard pattern used by Kubernetes, AWS tags, and other cloud platforms
- Pydantic Dict[str, str] provides automatic validation
- OpenAPI supports this via `additionalProperties` pattern

**Alternatives Considered**:
- **Array of strings**: Less structured, harder to query specific label types
- **Array of objects {key, value}**: More verbose, harder to work with in code
- **Nested object structure**: Over-engineered for simple key-value use case

**Implementation**:
```yaml
# OpenAPI
labels:
  type: object
  additionalProperties:
    type: string
  nullable: true
```

```python
# Pydantic
labels: Optional[Dict[str, str]] = Field(None, description="Key-value label pairs")
```

**References**:
- Kubernetes Labels and Selectors
- AWS Resource Tags
- Pydantic Dict validation

### 3. Pydantic 2.x Base Models

**Decision**: Create Pydantic models corresponding to each OpenAPI schema

**Rationale**:
- Pydantic 2.x provides significant performance improvements over 1.x
- Native support for `model_dump(exclude={'field'})` for readOnly fields
- ConfigDict for model configuration (replaces old Config class)
- Field() with validation_alias for parameter name mapping
- Automatic JSON schema generation matches OpenAPI patterns

**Key Patterns**:
- Use `Field(exclude=True)` for readOnly fields in requests
- Use `Optional[T]` for nullable fields
- Use `Field(default=...)` for default values
- Use `Field(..., description="...")` for documentation

**Example**:
```python
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime
from uuid import UUID

class BaseResource(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier", exclude=True)
    created_at: datetime = Field(..., description="Creation timestamp", exclude=True)
    updated_at: datetime = Field(..., description="Last update timestamp", exclude=True)
    labels: Optional[Dict[str, str]] = Field(None, description="Key-value label pairs")
```

**Alternatives Considered**:
- **Pydantic 1.x**: Older, slower, less ergonomic
- **dataclasses**: No validation, no JSON schema generation
- **attrs**: Less ecosystem support for FastAPI integration

**References**:
- Pydantic 2.x Documentation
- FastAPI with Pydantic 2.x
- Pydantic Performance Benchmarks

### 4. Naming Conventions

**Decision**:
- Schema properties: camelCase
- Query parameters: snake_case
- Python code: snake_case (PEP 8)

**Rationale**:
- **camelCase for schemas**: Aligns with JSON conventions, JavaScript/TypeScript ecosystems
- **snake_case for parameters**: Standard for URL query strings, improves readability
- **snake_case for Python**: PEP 8 standard for variables, functions, modules
- Separation of concerns: data models vs. API interface vs. Python code

**Implementation**:
- Pydantic `Field(alias="camelCaseName")` for JSON serialization
- FastAPI Query parameters use snake_case naturally
- Python code follows PEP 8

**Alternatives Considered**:
- **All camelCase**: Would violate PEP 8, harder to read in Python
- **All snake_case**: Would conflict with JSON/JS conventions

**References**:
- PEP 8: Style Guide for Python Code
- RESTful API Design Best Practices
- FastAPI query parameter conventions

### 5. Filtering Conventions and Operators

**Decision**: Support bracket notation for operators with shorthand equality

**Syntax**:
- Direct equality: `parameter=value` (shorthand for `parameter[eq]=value`)
- Operators: `parameter[operator]=value` where operator ∈ {eq, contains, gt, gte, lt, lte}
- Multiple values: `parameter=val1,val2` or `parameter=val1&parameter=val2` (OR logic)
- Multiple parameters: Combined with AND logic
- Label filtering: `labels[key]=value` for key-value matching

**Rationale**:
- Bracket notation is explicit and unambiguous for complex operators
- Shorthand equality reduces verbosity for common case
- Comma-separated values provide compact OR syntax
- Industry precedent: Similar to Stripe, GitHub, and other mature APIs
- Easy to parse and validate with regex

**Alternatives Considered**:
- **Query DSL (JSON in query param)**: Complex to read in URLs, requires URL encoding
- **Operator prefix (gt:parameter=value)**: Less readable, harder to parse
- **SQL-like syntax**: Too complex for URL parameters, security concerns
- **GraphQL**: Different paradigm, not appropriate for RESTful APIs

**References**:
- REST API filtering best practices
- Stripe API filter conventions
- GitHub API search syntax

### 6. Filter Parser Utility Design

**Decision**: Create FilterParser class with method to parse query params to filter objects

**Interface**:
```python
class FilterParser:
    @staticmethod
    def parse(params: Dict[str, str], allowed_fields: List[str]) -> List[Filter]:
        """Parse query parameters into filter objects"""
        pass
```

**Rationale**:
- Stateless utility (static methods)
- Validates operators and field names
- Returns structured filter objects for database layer
- Framework-agnostic (works with any query param dict)
- Extensible for custom operators

**Implementation Details**:
- Parse bracket notation using regex: `r"(\w+)\[(\w+)\]"`
- Validate operator against allowed list
- Validate field against allowed_fields
- Handle comma-separated values (split and create multiple filters)
- Return list of Filter dataclass/Pydantic model

**Alternatives Considered**:
- **Direct SQL generation**: Couples to specific database, security risk
- **String-based filters**: Less type-safe, harder to validate
- **Framework-specific (FastAPI only)**: Limits reusability

**References**:
- Python regex patterns
- Filter/Specification pattern

### 7. Pagination Strategy

**Decision**: Cursor-based pagination with optional total count

**Implementation**:
- Response includes `next` and `prev` URI links with cursor tokens
- `total` count included only when `include_total=true`
- Default `limit=20`, max `limit=100`

**Rationale**:
- Cursor links prevent page drift during data changes
- Optional total count allows clients to opt into expensive COUNT queries
- Consistent with REST HATEOAS principles (hypermedia links)
- Scalable to large datasets (unlike offset-based pagination)

**Cursor Format**:
- Base64-encoded JSON: `{"last_id": "uuid", "timestamp": "iso8601"}`
- Opaque to client (implementation detail)
- Includes tie-breaker for consistent ordering

**Alternatives Considered**:
- **Offset-based**: Simple but suffers from page drift and performance issues at scale
- **Always include total**: Forces expensive COUNT queries even when not needed
- **Relay-style connections**: Over-engineered for simple REST pagination

**References**:
- Pagination Best Practices
- Cursor-based pagination patterns
- REST HATEOAS principles

### 8. Pagination Helper Utility Design

**Decision**: Create PaginationHelper class to generate cursor links

**Interface**:
```python
class PaginationHelper:
    @staticmethod
    def generate_links(
        items: List[Any],
        limit: int,
        cursor: Optional[str],
        base_url: str,
        include_total: bool = False
    ) -> Dict[str, Any]:
        """Generate pagination response with next/prev links"""
        pass
```

**Rationale**:
- Encapsulates cursor encoding/decoding logic
- Generates proper next/prev URIs
- Handles total count calculation when requested
- Framework-agnostic (just needs base URL)

**Implementation Details**:
- Encode cursor as base64 JSON
- Generate next link if len(items) == limit
- Generate prev link if cursor provided
- Optionally run COUNT query for total
- Return dict with next, prev, total fields

**Alternatives Considered**:
- **Framework-specific helpers**: Less reusable
- **Manual cursor handling**: Error-prone, duplicated code

**References**:
- Base64 encoding for cursor tokens
- URL generation best practices

### 9. Label Filter Utility Design

**Decision**: Create LabelFilter class for key-value label matching

**Interface**:
```python
class LabelFilter:
    @staticmethod
    def matches(resource_labels: Dict[str, str], filter_labels: Dict[str, str]) -> bool:
        """Check if resource labels match filter criteria"""
        pass
```

**Rationale**:
- Encapsulates label matching logic
- Supports partial matching (filter subset of labels)
- Framework-agnostic (works with any dict)
- Extensible for complex label queries

**Matching Logic**:
- All filter label key-value pairs must exist in resource labels
- Resource can have additional labels not in filter
- Example: filter `{environment: production}` matches resource `{environment: production, region: us-east-1}`

**Alternatives Considered**:
- **Exact match**: Too restrictive
- **SQL-like operators**: Over-complex for key-value matching
- **Label selectors (Kubernetes style)**: More complex than needed for v1

**References**:
- Kubernetes label selectors
- Python dict subset checking

### 10. Sort Parser Utility Design

**Decision**: Create SortParser class to parse sort parameters

**Interface**:
```python
class SortParser:
    @staticmethod
    def parse(sort_param: str, allowed_fields: List[str]) -> Tuple[str, str]:
        """Parse sort parameter into (field, direction)"""
        pass
```

**Rationale**:
- Validates field names against allowed list
- Parses ±field syntax (- prefix for descending)
- Returns tuple for database layer to use
- Framework-agnostic

**Syntax**:
- `sort=name` → ("name", "asc")
- `sort=-created_at` → ("created_at", "desc")

**Alternatives Considered**:
- **Multiple parameters**: More verbose (`sort_by=name&sort_order=asc`)
- **SQL-like**: Too complex for simple use case

**References**:
- REST API sorting conventions
- GitHub API sort syntax

### 11. Soft Delete Pattern

**Decision**: Extend BaseResource with SoftDeletableResource schema

**Implementation**:
- Add `deletedAt` (date-time, nullable, readOnly)
- Add `deletedBy` (uuid, nullable, readOnly)
- Backend-managed fields (never writable by clients)

**Rationale**:
- Aligns with ADR decision to prefer soft deletes
- Enables audit trails and data recovery
- Prevents accidental data loss
- Standard pattern in enterprise systems

**Alternatives Considered**:
- **Hard deletes only**: Irreversible, no audit trail
- **Archive table pattern**: More complex, requires separate schema
- **Status field**: Less explicit than dedicated timestamp fields

**References**:
- Architecture Decision Records (decision-records.md)
- Soft Delete Best Practices

### 12. Backend-Managed Fields

**Decision**: All system-managed fields marked as `readOnly` in OpenAPI, excluded from Pydantic model_dump

**Fields**:
- `id`: UUID generated by backend
- `createdAt`, `updatedAt`, `deletedAt`: Timestamps managed by backend
- `createdBy`, `updatedBy`, `deletedBy`: User references tracked by backend

**Rationale**:
- Prevents client manipulation of system metadata
- OpenAPI `readOnly` provides contract-level validation
- Pydantic `Field(exclude=True)` ensures fields not in requests
- FastAPI automatically enforces readOnly in request validation
- Clear separation between client-writable and system-managed data

**Alternatives Considered**:
- **Runtime validation only**: Less explicit, harder to document
- **Separate read/write schemas**: More boilerplate, harder to maintain

**References**:
- OpenAPI readOnly specification
- Pydantic Field exclude
- FastAPI request validation

## Technology Decisions

### Primary Technologies
- **OpenAPI 3.0+**: Industry-standard API specification format
- **Pydantic 2.x**: Modern Python data validation with performance optimizations
- **FastAPI 0.104+**: Python framework with native OpenAPI/Pydantic support
- **pytest**: Testing framework for unit and contract tests

### Library Structure
```
src/nexus_shared/
├── models/          # Pydantic base models
│   ├── base.py
│   ├── named.py
│   ├── resource.py
│   └── pagination.py
├── schemas/         # OpenAPI schema generation
│   └── openapi.py
├── utils/           # Shared utilities
│   ├── filters.py
│   ├── pagination.py
│   ├── labels.py
│   └── sorting.py
└── __init__.py
```

### Testing Strategy
- Contract tests validate OpenAPI schema structure
- Unit tests for Pydantic models verify validation rules
- Utility function tests verify parsing and filtering logic
- Integration tests verify end-to-end workflows
- TDD approach: Write tests first, then implement

### Performance Considerations
- Pydantic 2.x provides 5-10x speedup over 1.x
- Filter parsing should be <1ms (simple regex + validation)
- Pagination helper should be <5ms (cursor encode/decode)
- Label matching is O(n) where n = number of filter labels

## Implementation Considerations

### File Organization
```
specs/006-create-shared-resources/
├── contracts/
│   ├── shared-resources.openapi.yaml
│   └── README.md
├── data-model.md
├── research.md
└── quickstart.md
```

### Validation Requirements
- All schemas must have title and description for every property
- All backend-managed fields must be marked readOnly
- All nullable properties must explicitly set nullable: true
- Default values must be specified for query parameters
- Pydantic models must use type hints and Field() for all properties

### Documentation Requirements
- Each schema must include description and examples
- Each Pydantic model must have class docstring
- Each utility function must have docstring with params and return
- Filtering conventions documented with examples
- Query parameter usage examples in quickstart guide

## Open Questions
None - all technical context resolved.

## References
1. [OpenAPI 3.0 Specification](https://spec.openapis.org/oas/v3.0.3)
2. [Pydantic 2.x Documentation](https://docs.pydantic.dev/latest/)
3. [FastAPI Documentation](https://fastapi.tiangolo.com/)
4. [PEP 8: Style Guide for Python Code](https://peps.python.org/pep-0008/)
5. [REST API Best Practices](https://restfulapi.net/)
6. Nexus Architecture Decision Records (decision-records.md)
7. Nexus Constitution (v1.0.0)
