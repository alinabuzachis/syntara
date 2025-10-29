<!-- Sync Impact Report
Version Change: 1.1.0 → 1.2.0 (API Specification Standards added)
Modified Principles: Development Standards (added API Specification Standards section)
Added Sections: API Specification Standards (OpenAPI, AsyncAPI, error handling, versioning, path structure, pagination, security)
Removed Sections: N/A
Templates Updated:
  ✅ .specify/templates/plan-template.md (added API Specification Standards checklist with 11 checks including path structure /api/v1/[component]/[resource], updated pagination to limit/cursor, corrected schema paths to [project root]/schemas/[component]/)
  ✅ .specify/templates/spec-template.md (no changes needed - business-focused document)
  ✅ .specify/templates/tasks-template.md (added API specification reminders including path structure, updated pagination to limit/cursor, corrected schema paths to [project root]/schemas/[component]/)
  ✅ .specify/templates/agent-file-template.md (no changes needed - auto-generated file)
Follow-up TODOs:
  - Review existing OpenAPI/AsyncAPI specs for compliance with new standards
  - Update API documentation to include RFC 9457 error response format
  - Audit all endpoints to ensure they follow /api/v1/[component]/[resource] path pattern
  - Audit endpoints for pagination (limit/cursor), filtering, and security scheme documentation
  - Migrate any existing /contracts/ directories to [project root]/schemas/[component]/ structure
-->

# Nexus System Constitution

## Core Principles

### I. Modular Architecture

Every component MUST be designed as an independent, reusable module with clear
boundaries and well-defined interfaces. No component shall have hidden dependencies
or undocumented side effects. This ensures maintainability, testability, and the
ability to evolve individual components without cascading changes.

Every top-level component should be in its own sub-folder of `/src/`; e.g. `/src/nexus/api`, `/src/nexus/agents`, `/src/nexus/tool_manager`.

### II. Test-Driven Development

All new features and bug fixes MUST follow test-driven development practices. Tests
must be written first, fail initially, then pass after implementation. The
Red-Green-Refactor cycle is mandatory. This principle is NON-NEGOTIABLE and ensures
code quality, regression prevention, and living documentation through tests.

### III. Explicit Configuration

All configuration MUST be explicit, versioned, and environment-agnostic. No magic
values, no hardcoded assumptions about runtime environments. Configuration changes
must be traceable and auditable. Environment-specific values must be injected at
runtime, never compiled into the codebase.

### IV. Observability First

Every component MUST emit structured logs, metrics, and traces. Observability is
not an afterthought but a primary design concern. All critical paths must have
appropriate instrumentation. Debug information must be available without code
changes, configurable via log levels.

### V. API Stability

Public APIs MUST follow semantic versioning strictly. Breaking changes require
major version bumps and migration guides. Deprecation notices must be provided at
least one minor version before removal. Internal APIs should be clearly marked and
may change without notice.

## Development Standards

### Code Architecture Principles

- **DRY Principle**: Code duplication MUST be avoided through proper abstraction and encapsulation. Repeated logic must be extracted into reusable functions, classes, or modules. Each piece of knowledge should have a single, unambiguous representation.
- **SOLID Principles**: All code MUST adhere to SOLID design principles:
  - Single Responsibility: Each class/module has one reason to change
  - Open/Closed: Open for extension, closed for modification
  - Liskov Substitution: Subtypes must be substitutable for base types
  - Interface Segregation: Clients should not depend on interfaces they don't use
  - Dependency Inversion: Depend on abstractions, not concretions
- **Separation of Concerns**: Clear boundaries MUST exist between different layers (presentation, business logic, data access). No layer should have knowledge of implementation details of other layers.
- **Dependency Injection**: Dependencies MUST be explicitly injected rather than instantiated within classes. Use constructor injection as the primary pattern. This enables testability, flexibility, and loose coupling.
- **Composition vs Inheritance**: Favor composition over inheritance. Use inheritance only when there is a clear "is-a" relationship and shared behavior. Analyze carefully:
  - Use composition when components need to be reused independently
  - Use inheritance when extending behavior of a base class with shared contract
  - Prefer interfaces/protocols over abstract base classes when defining contracts

### API Specification Standards

All APIs MUST be formally specified and compliant with industry standards to ensure
consistency, maintainability, and interoperability.

#### Specification Formats

- **REST APIs**: MUST be defined and compliant with the latest version of the OpenAPI Specification (https://swagger.io/specification/)
- **WebSocket and Async APIs**: MUST be defined and compliant with the latest version of AsyncAPI Specification v3.0.0 or later (https://www.asyncapi.com/docs/reference/specification/v3.0.0)
- **Naming Convention**: All OpenAPI and AsyncAPI specifications MUST follow snake_case pattern for parameter names, property names, and schema names
- **Documentation Completeness**: Specifications MUST provide full documentation for every endpoint and operation including:
  - Description of the endpoint/operation purpose
  - Description for all parameters (path, query, header, body)
  - Realistic examples for request and response payloads
  - Expected response codes and their meanings

#### Error Handling

- **Error Format**: All error responses MUST follow RFC 9457 Problem Details standard with consistent structure including:
  - `type`: URI reference identifying the problem type
  - `title`: Short, human-readable summary
  - `status`: HTTP status code
  - `detail`: Human-readable explanation specific to this occurrence
  - `instance`: Optional URI reference identifying the specific occurrence
- **Error Messages**: MUST be actionable and MUST NOT expose internal implementation details (e.g., stack traces, database schemas, internal paths)
- **Error Codes**: Use consistent, documented error codes across all APIs

#### Versioning

- **Semantic Versioning**: APIs MUST implement semantic versioning (major.minor.patch)
- **Breaking Changes**: Require major version increment and deprecation notices at least one minor version before removal
- **Version Communication**: API version MUST be communicated via URL path (e.g., `/api/v1/users`) or header (e.g., `API-Version: 1.0`)
- **API Path Structure**: All API endpoints MUST follow the pattern `/api/v1/[component]/[resource]` (e.g., `/api/v1/agents/some_resource`, `/api/v1/workflows/some_resource`). This convention ensures consistency across the monolithic service and can be revisited when breaking down into multiple microservices.

#### Pagination and Filtering

- **Pagination**: All list/collection endpoints MUST support pagination with consistent parameters:
  - `limit`: Maximum number of items to return (with documented default and maximum)
  - `cursor`: Position in the collection
  - Response MUST include supporting for total count and next/previous page indicators
- **Filtering**: Filtering parameters MUST follow consistent patterns across all endpoints (e.g., `filter[field]=value`)
- **Sorting**: Sorting parameters MUST follow consistent patterns (e.g., `sort=field` or `sort=-field` for descending)

#### Security

- **Security Schemes**: All authenticated endpoints MUST document security schemes in the specification (e.g., Bearer token, API key, OAuth2)
- **Authentication Requirements**: Each endpoint MUST clearly indicate whether authentication is required
- **Scope Documentation**: For OAuth2 or similar schemes, required scopes MUST be documented per endpoint

#### Schema Management

- **Backward Compatibility**: Schema changes MUST be validated for backward compatibility before release
- **Breaking Schema Changes**: Require major version increment and must be documented in migration guides
- **Deprecation**: Deprecated fields MUST be marked as deprecated in the specification with removal timeline

### Code Quality Requirements

- All code MUST pass linting, formatters, type checking and tests before merge
- When ignoring a rule for linters or typecheckers a justification must be provided.
- Code coverage must maintain a minimum of 90% for tests
- Integration tests required for all inter-service communication
- Security scanning must pass without high/critical vulnerabilities
- CI checks must pass.

### Code Style Standards

- All variable, function, class, and module names MUST be self-descriptive
- Single letter variables are NOT allowed (except for standard loop counters: i, j, k in simple iterations)
- Constants must be UPPER_CASE_WITH_UNDERSCORES
- No magic numbers - all numeric literals must be named constants or have inline comments
- Consistent naming conventions per language (camelCase for JS/TS, snake_case for Python, etc.)

### Documentation Standards

- Every class MUST have a docstring describing its purpose and responsibilities
- Every public function/method MUST have documentation including:
  - Description of what the function does
  - Parameters with types and descriptions
  - Return value description
  - Exceptions that may be raised
  - Usage examples for complex functions
- Private methods should have documentation for non-trivial implementations
- README files required at project root and for major subsystems/packages
- System Design Plans (SDPs) and/or Proposals for significant design choices
- Inline documentation for complex algorithms or business logic
- API changes must update corresponding documentation in same PR

## Workflow & Process

### Development Workflow

- Feature branches created from main
- Pull requests required for all changes
- Minimum one approval required before merge
- CI/CD pipeline must pass all checks
- Squash and merge preferred for clean history

### Review Process

- Code reviews focus on: correctness, performance, security, maintainability
- Automated checks must pass before human review
- Constructive feedback with suggested improvements
- Approval indicates shared responsibility for the change

## Governance

### Constitution Authority

This constitution supersedes all other development practices and guidelines. Any
deviation requires explicit documentation and approval through the amendment
process. All team members are responsible for upholding these principles.

### Amendment Process

- Proposed amendments must be documented with rationale
- Review period of minimum 48 hours for team feedback
- Requires consensus or majority approval depending on scope
- Major changes require migration plan and grace period
- All amendments tracked with version history

### Compliance & Enforcement

- All pull requests must verify constitution compliance
- Violations must be addressed before merge
- Repeated violations trigger process review
- Exceptions require explicit documentation and time bounds
- Regular audits to ensure ongoing compliance

**Version**: 1.2.0 | **Ratified**: 2025-09-23 | **Last Amended**: 2025-10-24
