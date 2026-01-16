# Tool Provider Integration and Tool Management - JIRA Epic and Stories

## Jira Epic
**Epic ID**: AAP-54305
**Epic Title**: Tool Provider Integration and Tool Management

## Overview
This feature enables administrators to register external Tool Providers (starting with MCP servers), discover and manage tools, control tool availability through enablement flags, and monitor tool usage through comprehensive metrics and rate limiting.

**Implementation Strategy:**
- **Vertical Slicing**: Each ticket delivers a complete, working feature from models to API endpoints
- **Feature-First Organization**: Tickets organized by business capabilities, not technical layers
- **Independent Value Delivery**: Each ticket can be tested, merged, and used independently
- **Progressive Enhancement**: Later tickets build on earlier ones without breaking functionality

This approach mirrors the successful workflow engine implementation pattern, enabling early value delivery and reducing complex technical dependencies.

**Key Capabilities:**
- Provider-agnostic tool management core with pluggable adapters
- MCP server integration supporting remote protocols (SSE and Streaming HTTP)
- Tool enablement control separate from registration status
- Keyset pagination with bracket filter notation for efficient queries
- Comprehensive metrics collection and rate limiting system

**Current Implementation Status (January 2026):**
- ✅ **API Consolidation Complete**: Separate `/tools` and `/tool-providers` APIs unified under `/tool_manager` namespace
- ✅ **Schema Consolidation**: Multiple OpenAPI specifications consolidated into single `openapi.yaml`
- ✅ **Endpoint Migration**: All endpoints now use underscore convention (e.g., `/tool_providers` instead of `/tool-providers`)
- ✅ **Router Unification**: Consolidated from separate routers into single `tool_manager/router.py`

## Project Infrastructure
- **Package Namespace**: `nexus.tool_manager`
- **Source Directory**: `./src/nexus/tool_manager/`
- **API Routers**: `./src/nexus/api/v1`
- **Services**: `./src/nexus/tool_manager/services/`
- **Models**: `./src/nexus/tool_manager/models/`
- **Lib/Shared**: `./src/nexus/tool_manager/lib/`
- **Tests Root**: `./tests/`
- **OpenAPI Schemas**: `./src/nexus/schemas/tool_manager/` (**Updated**: Consolidated from `tool_management`)

**Existing Tooling**:
- Linting: ruff
- Type checking: mypy
- Testing: pytest, pytest-asyncio
- Web framework: FastAPI
- Database: SQLAlchemy 2.0 with asyncpg

**Key Dependencies to Add**:
- MCP Python SDK (mcp library)
- FastMCP 2.0 (optional for testing)
- Valkey (for caching and rate limiting)
- httpx (for HTTP client operations)

---

# Part 1: Core Features

## Ticket: Core Abstractions and Domain Logic
**Jira Story ID**: AAP-55729
**Story Points**: 5

### Description
Establish the provider-agnostic architecture for tool management. This ticket delivers the foundational abstraction layer that enables pluggable tool providers, creates the core tool management domain logic, and validates the design with a mock provider implementation. All functionality includes passing tests.

**Note**: This ticket establishes the core architecture without any specific provider implementation. The provider-agnostic design ensures future providers can be added without modifying core logic. Infrastructure setup (FastAPI, database, dependencies, etc.) is handled in separate tickets.

### Scope

**Package Setup and Configuration**:
- Create new package entry in `pyproject.toml` for `src/nexus/tool_manager`
  - Ensure hatch build includes `src/nexus/tool_manager`
  - Ensure proper Python package structure with `__init__.py` files
  - Include package in build configuration and dependency management
  - Verify package can be imported and installed correctly

**Core Abstractions (Provider-agnostic foundation)**:
- Define `ToolProviderAdapter` Protocol in `./src/nexus/tool_manager/lib/providers/base.py`
  - Methods: `validate_connection`, `refresh_tools`, `get_tool_schema`, `test_tool`
  - Clear documentation for each method's contract
  - Type hints for all method signatures
- Implement provider factory in `./src/nexus/tool_manager/lib/providers/factory.py`
  - Registry pattern for provider type registration
  - Factory method to instantiate providers by type
  - Thread-safe registration
  - Type validation
- Create domain types in `./src/nexus/tool_manager/lib/tool_core.py`:
  - Domain models (dataclasses): `Provider`, `Tool`, `ToolParameter`, `ToolExecution`
  - Exceptions: `ProviderError`, `ToolNotFoundError`, `ValidationError`, `ProviderNotFoundError`
  - Repository interfaces (protocols) for data persistence abstraction
  - Cache adapter interfaces for future Valkey integration
- Implement core provider management functions in `./src/nexus/tool_manager/lib/tool_core.py`:
  - `register_provider`: Add new provider with validation
  - `list_providers`: Query providers with filters and pagination
  - `get_provider_detail`: Retrieve single provider with configuration
  - `update_provider`: Modify provider settings
  - `delete_provider`: Soft delete provider
  - `validate_provider_connection`: Test provider connectivity
- Implement core tool management functions in `./src/nexus/tool_manager/lib/tool_core.py`:
  - `refresh_tools`: Discover/update tools from provider
  - `list_tools`: Query tools with filters and pagination
  - `get_tool_detail`: Retrieve single tool with schema
  - `update_tool_enabled`: Enable/disable tool
  - `bulk_update_tools`: Batch enable/disable operations
  - `get_tool_metrics_summary`: Aggregate usage statistics (mock implementation)
  - `list_executions`: Query execution history (mock implementation)
- Add structured logging hooks and provider timeout handling

**Mock Provider for Testing**:
- Create `MockProvider` in `./tests/fixtures/mock_provider.py`
  - Implements `ToolProviderAdapter` Protocol
  - Returns predefined test tools and schemas
  - Simulates successful and error scenarios (timeouts, auth failures, connection errors)
  - Configurable response delays for timeout testing
  - Used to validate core abstractions work correctly

**Testing Suite (with passing tests)**:
- Unit tests for core abstractions in `./tests/unit/tool_core/`:
  - `test_provider_factory.py` - Test provider factory registration and retrieval
  - `test_provider_functions.py` - Test all provider core functions with mock provider
  - `test_tool_functions.py` - Test all tool core functions with mock provider
  - `test_domain_models.py` - Test domain model validation and serialization
  - `test_error_handling.py` - Test error handling and timeout scenarios
  - `test_pagination_logic.py` - Validate pagination and filtering logic
  - Achieve ≥80% coverage for tool_core.py
- Contract YAML templates in `./src/nexus/schemas/tool_management/`:
  - Define expected API contracts (will be implemented in later tickets)
  - Include keyset pagination patterns
  - Document bracket filter syntax
  - Specify error response formats

### Acceptance Criteria
- ✅ New package `nexus.tool_manager` properly configured in pyproject.toml
- ✅ Hatch build includes `src/nexus/tool_manager`
- ✅ All necessary `__init__.py` files created for proper Python package structure
- ✅ Package can be imported and installed correctly (validated with basic import test)
- ✅ `ToolProviderAdapter` Protocol exists with all 4 required methods documented
- ✅ All Protocol methods have complete type hints and docstrings
- ✅ Provider factory can register and retrieve adapters by type string
- ✅ Provider factory registration is thread-safe
- ✅ Factory validates provider types and raises errors for invalid types
- ✅ Mock provider successfully registered in factory for testing
- ✅ Mock provider implements all `ToolProviderAdapter` methods correctly
- ✅ Domain models (Provider, Tool, ToolParameter, ToolExecution) defined with complete type hints
- ✅ All domain exceptions defined (ProviderError, ToolNotFoundError, ValidationError, ProviderNotFoundError)
- ✅ Repository interface protocols defined for data persistence abstraction
- ✅ Cache adapter interfaces defined for future Valkey integration
- ✅ `tool_core.py` exports complete provider management API (6 functions) with docstrings
- ✅ `tool_core.py` exports complete tool management API (7 functions) with docstrings
- ✅ All tool_core provider functions work with mock provider
- ✅ All tool_core tool functions work with mock provider
- ✅ Core functions implement keyset pagination with bracket filters
- ✅ Pagination logic returns next_cursor and has_more correctly
- ✅ Filter logic supports: eq, ne, contains, gt, gte, lt, lte, in operators
- ✅ Structured logging integrated with proper log levels
- ✅ Provider timeout handling works correctly (configurable timeout)
- ✅ Error scenarios properly handled (timeout, connection error, auth failure)
- ✅ Mock provider can simulate all error scenarios
- ✅ Contract YAML templates created for API contracts
- ✅ Contract templates include keyset pagination patterns
- ✅ Contract templates document bracket filter syntax
- ✅ Contract templates specify error response formats (RFC 7807)
- ✅ **ALL TESTS PASS** - zero test failures allowed
- ✅ Test coverage ≥80% for tool_core.py
- ✅ All unit tests properly isolated (no database, no external services)
- ✅ Can register mock provider → validate connection → refresh tools → list tools → enable tool using pure domain logic

---

## Ticket: Refactor Tool Manager to use SQLModel and Base Resources
**Jira Story ID**: AAP-56027
**Story Points**: 13

### Description
Refactor the existing Tool Manager system to use SQLModel for unified database tables and API schemas, migrate models to use shared Resource and BaseResource base classes, eliminate the ToolDetail model in favor of a unified Tool model, and ensure proper foreign key relationships with cascade delete rules. This ticket modernizes the Tool Manager architecture while maintaining full functionality and improving data integrity.

**Note**: This ticket refactors the existing Tool Manager foundation established in previous tickets. It migrates from a custom model approach to SQLModel best practices, consolidates the Tool/ToolDetail separation, and establishes proper relationship management. All existing functionality is preserved while improving maintainability and consistency.

### Scope

**Base Infrastructure Migration**:
- Create shared base models in `src/nexus/core/models/base/base_resource.py`
- Update nexus package structure for Resource base class usage
- Copy OpenAPI schemas to standardized `/schemas` directory structure
- Update build configuration and dependency management

**Model Refactoring to SQLModel**:
- Refactor `ToolProvider` to extend Resource base class in `src/nexus/tool_manager/models/tool_provider.py`
  - Inherit common fields (id, name, description, timestamps, audit fields) from Resource
  - Maintain provider-specific fields (configuration, enabled, status, validation fields)
  - Ensure proper table name and SQLModel configuration
- Refactor `Tool` to extend Resource base class in `src/nexus/tool_manager/models/tool.py`
  - Inherit common fields from Resource base class
  - Add tool-specific fields (provider_id FK, namespaced_name, status, execution tracking)
  - Include parameters relationship directly in Tool model
- Refactor `ToolParameter` to extend BaseResource in same file
  - Inherit common audit fields from BaseResource
  - Maintain parameter-specific fields (tool_id FK, name, type, validation rules)
- Refactor `ToolExecution` to extend BaseResource in `src/nexus/tool_manager/models/tool_metrics.py`
  - Inherit audit fields from BaseResource
  - Maintain execution-specific fields (tool_id FK, provider_id FK, user_id FK, execution data)
- Create additional models (RateLimitConfig, UsageCounter) using proper base classes
- Update all supporting models (BulkUpdate, validation, refresh, schema models)

**ToolDetail Model Elimination**:
- Remove ToolDetail class entirely from Tool model file
- Move parameters relationship directly to Tool model
- Update Tool model to serve both list and detail API endpoints
- Remove ToolDetail imports and references from model exports
- Remove obsolete fields (tool_schema, validation_schema) that don't match OpenAPI specs

**OpenAPI Specification Updates**:
- Update `tools.yaml` to remove ToolDetail schema references
- Update `tool-providers.yaml` to use Resource schema inheritance
- Update `metrics.yaml` for new model structure alignment
- Copy all schemas to standardized `/src/nexus/schemas/tool_management/` directory
- Create base `shared-resources.openapi.yaml` schema for Resource definitions
- Ensure contract-implementation alignment throughout

**Relationship and Foreign Key Improvements**:
- Add proper foreign key relationships with back_populates between models
- Implement cascade delete rules: ToolProvider → Tool → ToolParameter
- Implement cascade delete rules: ToolProvider → ToolExecution, Tool → ToolExecution  
- Add proper SQLModel relationship configurations with selectinload support
- Ensure referential integrity across all model relationships

**Test Infrastructure Modernization**:
- Restructure test organization under `tests/unit/tool_manager/` following new model hierarchy
- Create comprehensive model relationship tests demonstrating foreign keys work correctly
- Create cascade delete tests verifying data integrity rules
- Update mock fixtures and adapters for new SQLModel structure
- Remove obsolete test structures and update conftest.py for new fixtures
- Achieve comprehensive test coverage for all model relationships

**Documentation Alignment**:
- Update `data-model.md` to reflect unified Tool model without ToolDetail
- Update `plan.md` mermaid diagrams to show correct model relationships
- Remove validation_schema and tool_schema references from all documentation
- Update `quickstart.md` to reflect new unified API structure
- Ensure all specification documents match the refactored implementation

### Acceptance Criteria
- ✅ All Tool Manager models successfully migrated to SQLModel with unified DB/API schemas
- ✅ All models properly extend Resource or BaseResource base classes with inherited fields
- ✅ ToolProvider model uses Resource base class with provider-specific fields
- ✅ Tool model uses Resource base class with tool-specific fields and parameters relationship
- ✅ ToolParameter and ToolExecution models use BaseResource with proper audit fields
- ✅ ToolDetail model completely removed with Tool serving both list and detail endpoints
- ✅ All obsolete fields (tool_schema, validation_schema) removed from models
- ✅ Foreign key relationships properly configured with back_populates between all models
- ✅ Cascade delete rules working correctly: ToolProvider → Tool → ToolParameter → ToolExecution
- ✅ OpenAPI specifications updated and copied to `/schemas` directory structure
- ✅ Base shared-resources.openapi.yaml schema created for Resource definitions
- ✅ Contract-implementation alignment verified across all schemas
- ✅ Test structure reorganized under `tests/unit/tool_manager/` hierarchy
- ✅ Comprehensive relationship tests demonstrate foreign key functionality (78 model tests passing)
- ✅ Cascade delete tests verify data integrity rules (26 provider tests passing)
- ✅ Mock fixtures and adapters updated for SQLModel structure
- ✅ All documentation updated to reflect unified Tool model structure
- ✅ Plan.md mermaid diagrams updated to show correct relationships
- ✅ Data-model.md aligned with implementation (no ToolDetail references)
- ✅ **ALL TESTS PASS** - zero test failures allowed across 104 total tests
- ✅ Test coverage maintained at ≥80% for all refactored modules
- ✅ All existing functionality preserved during refactor (no breaking changes)
- ✅ Can complete full workflow: register provider → refresh tools → list tools → manage relationships → verify cascade deletes

---

## Ticket: Tool Provider Management (Service + API + Database)
**Jira Story ID**: AAP-55730
**Story Points**: 8

### Description
Implement complete Tool Provider management including database persistence, service layer, and REST API endpoints for provider registration, configuration, validation, and tool discovery. This ticket bridges the gap between core abstractions (ticket AAP-55729) and tool management (ticket AAP-55731) by delivering the REST API layer that allows administrators to register and manage external Tool Providers through HTTP endpoints.

**Note**: This ticket depends on ticket AAP-55729 (Core Abstractions and Domain Logic). It implements the database layer, service layer, and REST API for tool provider operations, following the OpenAPI contract defined in `tool-providers.yaml`. After this ticket, administrators can register MCP providers via REST API, validate connections, and refresh tools from providers.

### Scope

**Database Models** (`./src/nexus/tool_manager/models/`):
- Create `ToolProvider` model in `./src/nexus/tool_manager/models/tool_provider.py`
  - Fields: id (UUID), name, description, provider_type, configuration (JSONB), enabled, status (enum: available/error/validating)
  - Audit fields: created_at, created_by, updated_at, updated_by, deleted_at, deleted_by
  - Validation: unique name, provider_type must be valid
  - Indexes: (name), (provider_type), (status), (created_at, id) for pagination
- Create `Tool` model in `./src/nexus/tool_manager/models/tool.py`
  - Fields: id (UUID), provider_id (FK), name, namespaced_name, description, input_schema (JSONB), enabled
  - Audit fields: created_at, created_by, updated_at, updated_by, deleted_at, deleted_by
  - Validation: unique namespaced_name, FK to ToolProvider with CASCADE
  - Indexes: (provider_id, name), (namespaced_name), (enabled), (created_at, id) for pagination
- Create alembic migrations for both models

**Service Layer**:
- Implement `ToolProviderService` in `./src/nexus/tool_manager/services/tool_provider_service.py`
  - Wrap tool_core provider functions with DB persistence
  - Handle provider registration with validation
  - Support provider updates (full and partial)
  - Implement soft delete for providers
  - Handle provider validation with status tracking
  - Handle tool refresh from providers with DB upsert logic
  - Apply basic filters to list queries (field[operator]=value syntax)
  - Support keyset pagination (id[gt]/id[lt] cursors)
  - Transaction management for multi-step operations

**REST API - Tool Providers Router** (`./src/nexus/tool_manager/api/tool_providers.py`):
- GET /api/v1/tool-providers - List all registered Tool Providers
  - Query params: limit, cursor, include_total, field[operator] filters (status[eq], name[contains], etc.)
  - Response: 200 OK with providers array, pagination metadata
  - Filtering: supports bracket notation with operators (eq, ne, in, contains, startswith, endswith, gt, gte, lt, lte, between)
- POST /api/v1/tool-providers - Register new Tool Provider
  - Request: name, description, provider_type, configuration
  - Response: 201 Created with provider details
  - Validation: unique name, valid provider_type, valid configuration
  - Error: 400 if invalid, 409 if name exists
- GET /api/v1/tool-providers/{provider_id} - Get Tool Provider details
  - Response: 200 OK with full provider data
  - Error: 404 if not found
- PUT /api/v1/tool-providers/{provider_id} - Update Tool Provider configuration
  - Request: full provider data (name, description, configuration with provider_type, enabled, status)
  - Response: 200 OK with updated provider
  - Validation: valid configuration, positive values
  - Error: 400 if invalid, 404 if not found
- PATCH /api/v1/tool-providers/{provider_id} - Partially update Tool Provider
  - Content-Type: application/merge-patch+json
  - Request: partial provider data
  - Response: 200 OK with updated provider
  - Merges configuration changes with existing config
- DELETE /api/v1/tool-providers/{provider_id} - Remove Tool Provider
  - Response: 204 No Content
  - Soft delete: sets deleted_by and deleted_at
  - Cascades to associated tools
- POST /api/v1/tool-providers/{provider_id}/validate - Validate Tool Provider connection
  - Response: 200 OK with validation result (valid, provider_type, protocol_version, capabilities, validated_at)
  - Response: 400 if validation fails (valid=false, error message)
  - Updates provider status and last_validated_at
- POST /api/v1/tool-providers/{provider_id}/refresh-tools - Refresh tools from Tool Provider
  - Response: 200 OK with refresh stats (refreshed_count, updated_count, disabled_count, refreshed_at)
  - Connects to provider, fetches tools, upserts to database
  - Error: 400 if refresh fails

**Request/Response Models** (`./src/nexus/tool_manager/api/models/tool_provider_models.py`):
- `ToolProviderCreate`, `ToolProviderUpdate`, `ToolProviderPatch`
- `ToolProviderResponse`, `ToolProviderListResponse`
- `ValidationResultResponse`, `RefreshResultResponse`
- All models use Pydantic v2 with validation

**Infrastructure Setup**:
- Configure FastAPI application in `./src/nexus/tool_manager/api/app.py`
  - Mount tool_providers router at /api/v1
  - Configure CORS, middleware, exception handlers
  - Setup OpenAPI documentation
- Database connection management
  - AsyncSession factory with asyncpg
  - Connection pooling configuration
  - Transaction handling utilities
- Admin authentication middleware (basic implementation for testing)

**Testing Suite (with passing tests)**:
- Unit tests in `./tests/unit/`:
  - `test_models.py` - Test validation rules, FK relationships, cascade behavior for both models
  - `test_services.py` - Test ToolProviderService with focus on DB operations, transactions
  - Achieve ≥80% coverage for models and ToolProviderService
- Contract tests in `./tests/contract/test_tool_providers_contract.py`:
  - Test all 7 provider endpoints match OpenAPI schema from tool-providers.yaml
  - Test request/response validation
  - Test error responses (400, 403, 404, 409, 500)
  - Test pagination response format
  - Test filtering with bracket notation
- Integration tests in `./tests/integration/`:
  - `test_tool_providers_api.py` - Test provider CRUD operations, validation, tool refresh
  - `test_s01_provider_registration.py` - S01: Complete provider registration workflow
  - `test_s02_tool_discovery.py` - S02: Tool discovery and refresh workflow

### Acceptance Criteria
- ✅ Both database models created with proper SQLAlchemy 2.0 async syntax
- ✅ ToolProvider model has all fields including JSONB configuration
- ✅ Tool model has FK to ToolProvider with CASCADE delete
- ✅ All indexes exist for efficient queries and pagination
- ✅ Database migrations created and run successfully
- ✅ ToolProviderService properly wraps tool_core functions with DB persistence
- ✅ ToolProviderService handles transactions correctly (commit/rollback)
- ✅ ToolProviderService implements soft delete (sets deleted_at, deleted_by)
- ✅ All 7 provider endpoints implemented with correct HTTP methods
- ✅ All endpoints require admin authentication
- ✅ List endpoint supports bracket filter notation with all specified operators
- ✅ List endpoint supports keyset pagination (cursor, limit, has_more, next_cursor)
- ✅ List endpoint supports optional include_total parameter
- ✅ Create endpoint validates unique name and returns 409 on conflict
- ✅ PUT endpoint requires full provider data update
- ✅ PATCH endpoint updates configuration changes correctly
- ✅ Validate endpoint updates provider status and last_validated_at
- ✅ Validate endpoint returns validation details (provider_type, capabilities, etc.)
- ✅ Refresh-tools endpoint connects to provider and upserts tools to DB
- ✅ Refresh-tools endpoint returns accurate counts (refreshed, updated, disabled)
- ✅ All responses follow Pydantic v2 models
- ✅ Error responses follow RFC 7807 Problem Details format
- ✅ OpenAPI schema accurate and matches tool-providers.yaml contract
- ✅ FastAPI application properly configured with routers mounted
- ✅ Database connection pool configured and working
- ✅ Admin authentication middleware implemented
- ✅ Router properly mounted at /api/v1/tool-providers
- ✅ Contract tests pass for all 7 endpoints
- ✅ Integration tests S01 and S02 pass
- ✅ **ALL TESTS PASS** - zero test failures allowed
- ✅ Test coverage ≥80% for models, service, and router modules
- ✅ Can complete end-to-end workflow: register provider → validate → refresh tools → list providers with filters → update provider → delete provider

---

## Ticket: Tool Management & Control (Service + API)
**Jira Story ID**: AAP-55731
**Story Points**: 6

### Description
Implement complete tool management and testing functionality including service layer for tool operations, REST API endpoints for tool CRUD and testing. This ticket delivers end-to-end capabilities for managing discovered tools, controlling their enablement, and testing their functionality without actually invoking them.

**Note**: This ticket depends on ticket AAP-55730 (Tool Provider Management Service + API). It adds the tool-specific business logic and API endpoints to work with tools discovered from providers. Tools are tested to validate connectivity and functionality, but not invoked for actual execution. Filtering and pagination use basic implementations; advanced utilities come in ticket AAP-55736.

### Scope

**Core Functions Extension** (`./src/nexus/tool_manager/lib/tool_core.py`):
- `list_tools`: Query tools with filters and pagination
- `get_tool_detail`: Retrieve single tool with full schema
- `update_tool_enabled`: Enable/disable tool
- `bulk_update_tools`: Batch enable/disable operations
- `test_tool`: Test tool functionality and validate server communication

**Service Layer**:
- Implement `ToolService` in `./src/nexus/tool_manager/services/tool_service.py`
  - Wrap tool_core tool functions
  - Handle tool enablement logic
  - Support bulk update operations with transaction management
  - Apply basic filters to list queries
  - Handle tool testing with proper error mapping

**REST API - Tools Router** (`./src/nexus/tool_manager/api/tools.py`):
- GET /api/v1/tools - List all tools with basic filters
  - Query params: limit, id[gt]/id[lt] (cursor), name[contains], enabled[eq], provider_id[eq], namespaced_name[eq]
  - Response: 200 OK with tools array, next_cursor, has_more
- GET /api/v1/tools/{tool_id} - Get tool details with full schema
  - Response: 200 OK with tool data including parameters
  - Error: 404 if tool not found
- PUT /api/v1/tools/{tool_id} - Update tool (mainly enablement flag)
  - Request: enabled flag, optional description override
  - Response: 200 OK with updated tool
- PATCH /api/v1/tools/bulk-update - Bulk enable/disable multiple tools
  - Request: tool_ids array, enabled flag
  - Response: 200 OK with update count and results
  - Handles partial failures gracefully
- POST /api/v1/tools/{tool_id}/test - Test tool functionality
  - Request: optional minimal parameters for testing
  - Response: 200 OK with test result (success/failure, duration, status, message)
  - Error: 404 if tool not found, 503 if tool server unavailable

**Request/Response Models** (`./src/nexus/tool_manager/api/models/tool_models.py`):
- `ToolResponse`, `ToolListResponse`
- `ToolUpdateRequest`, `BulkUpdateRequest`
- `ToolTestRequest`, `ToolTestResponse`
- All models use Pydantic v2 with validation

**Testing Suite (with passing tests)**:
- Unit tests in `./tests/unit/`:
  - `tool_core/test_tool_functions.py` - Test all tool-related core functions
  - `test_services.py` - Test ToolService with focus on bulk operations and testing
  - Achieve ≥80% coverage for tool_core and ToolService
- Contract tests in `./tests/contract/test_tools_contract.py`:
  - Test all 5 tool endpoints match OpenAPI schema
  - Test request/response validation
  - Test error responses (400, 404, 503, 500)
- Integration tests in `./tests/integration/`:
  - `test_tools_api.py` - Test tool management workflows, testing, bulk updates
  - `test_s03_tool_enablement.py` - S03: Tool Enablement Control with discovered tools

### Acceptance Criteria
- ✅ All tool core functions implemented in tool_core.py
- ✅ ToolService properly wraps tool_core functions with DB persistence
- ✅ ToolService handles bulk updates with proper transaction management
- ✅ All 5 tool endpoints implemented with proper HTTP methods
- ✅ All endpoints require admin authentication
- ✅ List endpoint supports basic cursor pagination (id[gt]/id[lt] and limit)
- ✅ List endpoint supports basic filters: name[contains], enabled[eq], provider_id[eq], namespaced_name[eq]
- ✅ Tool test endpoint validates tool functionality and server communication
- ✅ Tool test endpoint returns test results with duration and status
- ✅ Bulk update processes all tool_ids and returns results
- ✅ Bulk update handles partial failures gracefully
- ✅ All responses follow Pydantic v2 models
- ✅ Error responses follow RFC 7807 Problem Details format
- ✅ OpenAPI schema accurate for all 5 endpoints
- ✅ Router properly mounted at /api/v1/tools
- ✅ Contract tests pass for all endpoints
- ✅ Integration test S03 passes
- ✅ **ALL TESTS PASS** - zero test failures allowed
- ✅ Test coverage ≥80% for tool modules (tool_core functions, ToolService, tools router)
- ✅ Can complete end-to-end workflow: list tools → enable tool → test tool → verify connectivity

---

## Ticket: SSE Transport & Protocol Negotiation
**Jira Story ID**: AAP-55732
**Story Points**: 5

### Description
Add SSE (Server-Sent Events) transport support to the MCP provider and implement the foundation for protocol negotiation. This ticket delivers the first MCP transport implementation, enabling the system to work with MCP servers using SSE, and establishes the architecture for future transport support.

**Note**: This ticket depends on ticket AAP-55730 (Tool Provider Management Service + API). It implements the first MCP transport protocol and establishes the transport architecture. Comprehensive integration and E2E testing validates SSE transport works correctly.

### Scope

**SSE Transport Implementation**:
- Implement SSE transport in `./src/nexus/tool_manager/lib/providers/mcp/sse_transport.py`:
  - Server-sent events via HTTP streaming
  - Long-lived connection management
  - Event stream parsing
  - Error handling specific to SSE protocol
- Transport architecture foundation:
  - Transport abstraction for future protocol support
  - SSE-specific connection management
  - Protocol preference configuration in provider settings
- Streaming response support for long-running operations
- Update MCPProvider to support protocol selection

**Enhanced Test Infrastructure**:
- Enhance test MCP server to support SSE in `./tests/fixtures/test_mcp_server.py`:
  - Add SSE endpoint support
  - Event stream generation
  - Protocol switching capabilities
- FastMCP integration for testing:
  - Use FastMCP 2.0 to create test servers
  - Test server lifecycle management in fixtures
  - Support SSE protocol

**Comprehensive Testing Suite (with passing tests)**:
- Unit tests in `./tests/unit/providers/test_sse_transport.py`:
  - Test SSE-specific functionality
  - Test protocol negotiation and fallback
  - Test streaming response handling
  - Achieve ≥80% coverage for sse_transport.py
- Integration tests in `./tests/integration/`:
  - Update existing S01/S02 tests to validate SSE protocol
  - `test_s06_provider_lifecycle.py` - S06: Provider lifecycle (connect, refresh, disconnect)
  - `test_s07_error_scenarios.py` - S07: Error scenarios (server down, auth failure, network issues)
- E2E test in `./tests/e2e/test_mcp_provider_e2e.py`:
  - Full workflow: register → validate → refresh → test → verify
  - Test with SSE protocol
  - Verify tool testing produces expected results
  - Test concurrent tool tests
  - Test SSE-specific scenarios

### Acceptance Criteria
- ✅ SSE transport fully implemented in sse_transport.py
- ✅ MCP provider supports SSE remote protocol
- ✅ Transport architecture established for future protocol support
- ✅ Streaming response support works for long-running operations
- ✅ Provider configuration allows protocol preference specification
- ✅ Test MCP server fixture supports SSE
- ✅ FastMCP 2.0 integration works for test server creation
- ✅ Integration test scenarios S01, S02, S06, S07 pass with SSE protocol
- ✅ E2E test passes for SSE remote protocol
- ✅ Concurrent tool tests handled correctly
- ✅ SSE transport error handling works correctly
- ✅ No API changes required (protocol selection transparent to API consumers)
- ✅ **ALL TESTS PASS** - zero test failures allowed
- ✅ Test coverage ≥80% for sse_transport.py and transport modules
- ✅ Can complete end-to-end workflow using SSE protocol: register → validate → refresh → test tool

---

## Ticket: Streaming HTTP Transport & Protocol Negotiation
**Jira Story ID**: AAP-55733
**Story Points**: 5

### Description
Add Streaming HTTP transport support to the MCP provider and implement comprehensive protocol negotiation with automatic fallback. This ticket delivers complete multi-protocol support enabling the system to work with MCP servers using either SSE or Streaming HTTP, with automatic protocol selection and fallback capabilities.

**Note**: This ticket depends on ticket AAP-55730 (Tool Provider Management Service + API) and ticket AAP-55732 (SSE Transport). It extends the MCP provider to support a second transport protocol and adds full protocol negotiation. Comprehensive integration and E2E testing validates both protocols work correctly with automatic fallback.

### Scope

**Streaming HTTP Transport Implementation**:
- Implement Streaming HTTP transport in `./src/nexus/tool_manager/lib/providers/mcp/streaming_http_transport.py`:
  - HTTP chunked transfer encoding with streaming responses
  - Persistent connection management with keep-alive
  - Streaming request/response handling
  - Error handling specific to Streaming HTTP protocol
- Enhanced protocol negotiation and fallback logic:
  - Automatic detection of both supported protocols (SSE and Streaming HTTP)
  - Fallback chain: Streaming HTTP → SSE on failure
  - Protocol preference configuration in provider settings
  - Capability detection and negotiation handshake
- Streaming request support for large payloads
- Update MCPProvider to support dual-protocol selection

**Enhanced Test Infrastructure**:
- Enhance test MCP server to support Streaming HTTP in `./tests/fixtures/test_mcp_server.py`:
  - Add Streaming HTTP endpoint support
  - Chunked response generation
  - Protocol switching capabilities for both transports
- FastMCP integration for testing:
  - Use FastMCP 2.0 to create test servers with Streaming HTTP support
  - Test server lifecycle management in fixtures
  - Support both protocols (SSE and Streaming HTTP)

**Comprehensive Testing Suite (with passing tests)**:
- Unit tests in `./tests/unit/providers/test_streaming_http_transport.py`:
  - Test Streaming HTTP-specific functionality
  - Test enhanced protocol negotiation and fallback chain
  - Test streaming request/response handling
  - Test chunked transfer encoding
  - Achieve ≥80% coverage for streaming_http_transport.py
- Unit tests in `./tests/unit/providers/test_protocol_negotiation.py`:
  - Test protocol capability detection
  - Test fallback logic (Streaming HTTP → SSE)
  - Test protocol preference handling
- Integration tests in `./tests/integration/`:
  - Update existing S01/S02 tests to validate both protocols
  - Update `test_s06_provider_lifecycle.py` - S06: Provider lifecycle with both protocols
  - Update `test_s07_error_scenarios.py` - S07: Error scenarios with enhanced fallback chain
- E2E test in `./tests/e2e/test_mcp_provider_e2e.py`:
  - Full workflow: register → validate → refresh → test → verify
  - Test with both remote protocols (SSE and Streaming HTTP)
  - Verify tool testing produces expected results across both protocols
  - Test concurrent tool tests with mixed protocols
  - Test enhanced protocol fallback scenarios (Streaming HTTP → SSE)

### Acceptance Criteria
- ✅ Streaming HTTP transport fully implemented in streaming_http_transport.py
- ✅ MCP provider supports both remote protocols: SSE and Streaming HTTP
- ✅ Enhanced protocol negotiation works with automatic fallback chain (Streaming HTTP → SSE)
- ✅ Streaming request/response support works for large payloads and long-running operations
- ✅ Chunked transfer encoding implemented correctly
- ✅ Persistent connection management with keep-alive works correctly
- ✅ Provider configuration allows protocol preference specification for both protocols
- ✅ Protocol capability detection and negotiation handshake works correctly
- ✅ Test MCP server fixture supports both protocols (SSE and Streaming HTTP)
- ✅ FastMCP 2.0 integration works for test server creation with Streaming HTTP
- ✅ Integration test scenarios S01, S02, S06, S07 pass with both protocols
- ✅ E2E test passes for both remote protocols (SSE and Streaming HTTP)
- ✅ Concurrent tool tests handled correctly across mixed protocols
- ✅ Enhanced protocol fallback works correctly (Streaming HTTP → SSE on failure)
- ✅ No API changes required (protocol selection transparent to API consumers)
- ✅ **ALL TESTS PASS** - zero test failures allowed
- ✅ Test coverage ≥80% for streaming_http_transport.py and protocol negotiation modules
- ✅ Can complete end-to-end workflow using Streaming HTTP protocol: register → validate → refresh → test tool

---

# Part 2: Observability & Control

## Ticket: Usage Metrics & Analytics (Models + API)
**Jira Story ID**: AAP-55734
**Story Points**: 8

### Description
Implement comprehensive usage tracking and analytics including database models for metrics, aggregation service layer, and REST API endpoints for querying usage statistics. This ticket delivers complete observability into tool testing patterns, test execution history, and performance characteristics.

**Note**: This ticket depends on ticket AAP-55730 (Tool Provider Management Service + API) and ticket AAP-55731 (Tool Management & Control). It adds a parallel feature for tracking and analyzing tool test executions without modifying existing tool functionality.

### Scope

**Database Models**:
- Create `ToolMetric` model in `./src/nexus/tool_manager/models/tool_metric.py`
  - Fields: id, tool_id (FK), provider_id (FK), user_id (FK), execution timestamps, duration_ms, status, input/output JSON
  - Audit fields and timestamps
  - Composite indexes: (created_at, id), (tool_id, created_at, id), (user_id, created_at, id)
- Create `UsageCounter` model in `./src/nexus/tool_manager/models/usage_counter.py`
  - Fields: id, counter_type, provider_id (FK), tool_id (FK), user_id (FK), time_window, counters
  - Audit fields and timestamps
  - Indexes for efficient counter queries
- Create alembic migrations for these 2 metrics models

**Core Functions** (`./src/nexus/tool_manager/lib/tool_core.py`):
- `record_tool_execution`: Record individual tool execution with metrics
- `get_tool_metrics_summary`: Aggregate usage statistics by provider/tool/user
- `list_executions`: Query execution history with filtering

**Service Layer**:
- Implement `MetricsService` in `./src/nexus/tool_manager/services/metrics_service.py`
  - Wrap tool_core metrics functions
  - Handle metrics aggregation queries with time-based filtering
  - Apply basic filters for execution logs
  - Support pagination for execution history
  - Calculate aggregated statistics (count, avg duration, success rate, etc.)
- Update ToolService to record metrics on tool testing

**REST API - Metrics Router** (`./src/nexus/tool_manager/api/metrics.py`):
- GET /api/v1/metrics/summary - Get aggregated usage metrics
  - Query params: time_window (hour/day/week/month), provider_id, tool_id, user_id
  - Response: 200 OK with aggregated counts and statistics
  - Groups by: provider, tool, user (configurable)
  - Includes: total_executions, success_count, failure_count, avg_duration, p95_duration
- GET /api/v1/metrics/executions - List execution history with filters
  - Query params: limit, id[gt]/id[lt] (cursor), tool_id[eq], user_id[eq], status[eq], created_at[gt]/[lt]
  - Response: 200 OK with executions array, next_cursor, has_more
  - Includes: tool info, duration, status, timestamps, input/output summaries

**Request/Response Models** (`./src/nexus/tool_manager/api/models/metrics_models.py`):
- `MetricsSummaryResponse`, `MetricsSummaryItem`
- `ExecutionResponse`, `ExecutionListResponse`
- All models use Pydantic v2 with validation

**Testing Suite (with passing tests)**:
- Unit tests in `./tests/unit/`:
  - `test_models_metrics.py` - Test validation rules, FK relationships, cascade behavior for metrics models
  - `tool_core/test_metrics_functions.py` - Test metrics recording and aggregation
  - `test_services.py` - Test MetricsService aggregation logic and filtering
  - Achieve ≥80% coverage for metrics modules
- Contract tests in `./tests/contract/test_metrics_contract.py`:
  - Test all 2 metrics endpoints match OpenAPI schema
  - Test request/response validation
  - Test error responses (400, 404, 500)
- Integration tests in `./tests/integration/`:
  - `test_metrics_api.py` - Test metrics querying, aggregation, time-based filtering
  - `test_s05_usage_metrics.py` - S05: Usage Metrics Collection for MCP tools

### Acceptance Criteria
- ✅ Both metrics models created with proper SQLAlchemy 2.0 syntax
- ✅ ToolMetric model has FKs to Tool, Provider, and User with proper cascade rules
- ✅ UsageCounter model has FKs to Tool, Provider, and User with proper cascade rules
- ✅ All composite indexes exist for efficient time-based queries
- ✅ Database migrations created and run successfully
- ✅ All metrics core functions implemented in tool_core.py
- ✅ MetricsService properly wraps tool_core functions with DB persistence
- ✅ MetricsService handles metrics aggregation queries efficiently
- ✅ ToolService records metrics on every tool test execution
- ✅ All 2 metrics endpoints implemented with proper HTTP methods
- ✅ All endpoints require admin authentication
- ✅ Summary endpoint aggregates by time window correctly
- ✅ Summary endpoint supports grouping by provider, tool, user
- ✅ Summary endpoint calculates aggregated statistics (count, avg, p95)
- ✅ Executions endpoint supports basic cursor pagination
- ✅ Executions endpoint supports filters: tool_id[eq], user_id[eq], status[eq], created_at[gt]/[lt]
- ✅ Execution history includes complete execution details
- ✅ All responses follow Pydantic v2 models
- ✅ Error responses follow RFC 7807 Problem Details format
- ✅ OpenAPI schema accurate for all 2 endpoints
- ✅ Router properly mounted at /api/v1/metrics
- ✅ Contract tests pass for all endpoints
- ✅ Integration test S05 passes
- ✅ Time-based queries perform efficiently with proper index usage
- ✅ **ALL TESTS PASS** - zero test failures allowed
- ✅ Test coverage ≥80% for metrics modules (models, tool_core functions, MetricsService, metrics router)
- ✅ Can complete end-to-end workflow: test tool → record metrics → query summary → view execution history

---

## Ticket: Rate Limiting System (Models + Core + API)
**Jira Story ID**: AAP-55735
**Story Points**: 8

### Description
Implement comprehensive rate limiting system including database models for rate limit configurations, Valkey-backed sliding window enforcement, service layer for rate limit management, and REST API endpoints for administrators to configure rate limits. This ticket delivers complete rate limiting capabilities at provider, tool, and user levels.

**Note**: This ticket depends on ticket AAP-55730 (Tool Provider Management Service + API) and ticket AAP-55731 (Tool Management & Control). It adds rate limiting enforcement to tool testing and provides administrative controls for configuring limits.

### Scope

**Database Model**:
- Create `RateLimitConfig` model in `./src/nexus/tool_manager/models/rate_limit_config.py`
  - Fields: id, target_type (enum: provider/tool/user), target_id (UUID), requests_per_window, window_duration_seconds, burst_allowance, enabled
  - Audit fields: created_by, updated_by, deleted_by, timestamps
  - Indexes for efficient queries by target_type and target_id
  - Validation: requests_per_window > 0, window_duration_seconds > 0, burst_allowance >= 0
- Create alembic migration for rate limit model

**Core Functions** (`./src/nexus/tool_manager/lib/tool_core.py`):
- `create_rate_limit`: Create rate limit configuration
- `update_rate_limit`: Update rate limit settings
- `delete_rate_limit`: Remove rate limit configuration (soft delete)
- `list_rate_limits`: Query rate limits with filtering
- `get_rate_limit`: Retrieve single rate limit configuration
- `enforce_rate_limit`: Check and increment counter, return allowed/denied
- `get_rate_limit_status`: Query current usage without incrementing

**Service Layer**:
- Implement `RateLimitService` in `./src/nexus/tool_manager/services/rate_limit_service.py`
  - Wrap tool_core rate limit functions with DB persistence
  - Handle Valkey counter operations with sliding window algorithm
  - Use Valkey sorted sets to track requests within time window
  - Implement automatic expiration of old entries
  - Handle multiple rate limits (check all applicable limits, enforce most restrictive)
  - Graceful degradation if Valkey unavailable (configurable fail-open or fail-closed)
- Update ToolService to enforce rate limits before tool testing
  - Check applicable rate limits (provider-level, tool-level, user-level)
  - Return 429 with Retry-After header when rate limit exceeded

**REST API - Rate Limits Router** (`./src/nexus/tool_manager/api/rate_limits.py`):
- GET /api/v1/rate-limits - List rate limit configurations
  - Query params: limit, id[gt]/id[lt] (cursor), target_type[eq], enabled[eq]
  - Response: 200 OK with rate limits array, next_cursor, has_more
- POST /api/v1/rate-limits - Create rate limit configuration
  - Request: target_type, target_id, requests_per_window, window_duration_seconds, burst_allowance, enabled
  - Response: 201 Created with rate limit details
  - Validation: target exists, positive values
- GET /api/v1/rate-limits/{limit_id} - Get rate limit details
  - Response: 200 OK with full rate limit data including current usage stats
  - Error: 404 if not found
- PUT /api/v1/rate-limits/{limit_id} - Update rate limit configuration
  - Request: partial update (requests_per_window, window_duration_seconds, burst_allowance, enabled)
  - Response: 200 OK with updated rate limit
  - Validation: positive values if provided
- DELETE /api/v1/rate-limits/{limit_id} - Remove rate limit configuration
  - Response: 204 No Content
  - Soft delete: sets deleted_by and deleted_at

**Request/Response Models** (`./src/nexus/tool_manager/api/models/rate_limit_models.py`):
- `RateLimitCreateRequest`, `RateLimitUpdateRequest`
- `RateLimitResponse`, `RateLimitListResponse`
- `RateLimitStatusResponse` (includes current usage)
- All models use Pydantic v2 with proper validation

**Testing Suite (with passing tests)**:
- Unit tests in `./tests/unit/`:
  - `test_models_rate_limit.py` - Test validation rules for rate limit model
  - `tool_core/test_rate_limit.py` - Test rate limit CRUD and enforcement logic with various configurations
  - `test_rate_limit_service.py` - Test Valkey sorted set operations, sliding window, cleanup, failure scenarios
  - Achieve ≥80% coverage for rate limiting code
- Contract tests in `./tests/contract/test_rate_limits_contract.py`:
  - Test all 5 endpoints match OpenAPI schema
  - Test request/response validation
  - Test error responses (400, 404, 500)
- Integration tests in `./tests/integration/`:
  - `test_rate_limits_api.py` - Test rate limit CRUD operations
  - `test_s04_rate_limits.py` - S04: Full workflow (create limit → test tool → verify 429 when exceeded)
  - Test multiple limits interaction (provider + tool limits)
  - Test burst allowance in practice
  - Test enable/disable limit

### Acceptance Criteria
- ✅ RateLimitConfig model created with proper fields and indexes
- ✅ Database migration created and runs successfully
- ✅ All 7 rate limit core functions implemented in tool_core.py
- ✅ RateLimitService implements sliding window algorithm with Valkey sorted sets
- ✅ Rate limit enforcement correctly calculates window usage
- ✅ Burst allowance works correctly (allows N extra requests beyond limit)
- ✅ Sliding window implementation prevents edge-case bypasses
- ✅ Rate limits configurable at 3 levels: provider, tool, user
- ✅ Multiple rate limits apply to single request (most restrictive wins)
- ✅ Valkey counters expire automatically after window duration
- ✅ Old entries removed from sorted sets automatically
- ✅ Rate limit enforcement handles Valkey failures gracefully
- ✅ ToolService enforces rate limits before tool testing
- ✅ All 5 rate limit endpoints implemented with proper HTTP methods
- ✅ All endpoints require admin authentication
- ✅ List endpoint supports basic cursor pagination
- ✅ List endpoint supports filters: target_type[eq], enabled[eq]
- ✅ Create endpoint validates target exists and positive values
- ✅ Update endpoint validates positive values if provided
- ✅ Delete endpoint performs soft delete
- ✅ Get endpoint includes current usage statistics
- ✅ All responses follow Pydantic v2 models
- ✅ Error responses follow RFC 7807 Problem Details format
- ✅ OpenAPI schema accurate for all 5 endpoints
- ✅ Router properly mounted at /api/v1/rate-limits
- ✅ Tool test endpoint returns 429 when rate limit exceeded
- ✅ 429 response includes Retry-After header
- ✅ Contract tests pass for all endpoints
- ✅ Integration test S04 passes (full rate limit workflow)
- ✅ **ALL TESTS PASS** - zero test failures allowed
- ✅ Test coverage ≥80% for rate limiting modules (model, tool_core functions, RateLimitService, rate_limits router)
- ✅ Can complete end-to-end workflow: create rate limit → test tool repeatedly → verify enforcement → check status

---

# Part 3: Developer Experience

## Ticket: Filtering & Pagination Framework
**Jira Story ID**: AAP-55736
**Story Points**: 3

### Description
Implement advanced filtering and pagination utilities and integrate them across all existing API endpoints. This ticket enhances the developer experience by providing powerful, consistent query capabilities across all list operations with bracket filter notation and efficient keyset pagination.

**Note**: This ticket depends on tickets AAP-55730, AAP-55731, AAP-55734, and AAP-55735. It enhances existing endpoints with advanced filtering and pagination without breaking existing functionality. This is a cross-cutting utility feature that improves all list endpoints.

### Scope

**Filtering Utility** (`./src/nexus/tool_manager/lib/filters.py`):
- Implement bracket filter parser
  - Support 8 operators: eq, ne, contains, gt, gte, lt, lte, in
  - Parse filter syntax: `field[operator]=value`
  - Generate SQLAlchemy filter expressions
  - Handle type coercion (strings, integers, dates, UUIDs)
  - Validate operator compatibility with field types
  - Support multiple filters combined (AND logic)

**Pagination Utility** (`./src/nexus/tool_manager/lib/pagination.py`):
- Implement advanced keyset pagination helper
  - Support `id[gt]`/`id[lt]` cursors with `limit` parameter
  - Generate SQLAlchemy order_by and filter clauses
  - Return next_cursor and has_more flags
  - Optional total count with `include_total` parameter
  - Efficient cursor-based pagination (no OFFSET)

**Service Layer Updates**:
- Update all services (ToolProviderService, ToolService, MetricsService, RateLimitService):
  - Replace basic filtering with advanced bracket filter parser
  - Replace basic pagination with advanced keyset pagination
  - Support `include_total` parameter for total count queries

**API Router Updates**:
- Update all routers to support enhanced filtering and pagination:
  - Tool Providers: Additional filters with more operators
  - Tools: Additional filters with more operators
  - Metrics: Additional filters for executions
  - Rate Limits: Additional filters
  - All list endpoints support `include_total=true` parameter

**Testing Suite (with passing tests)**:
- Unit tests in `./tests/unit/`:
  - `test_filters.py` - Test all 8 operators with various data types, multiple filters, validation, errors
  - `test_pagination.py` - Test cursor-based pagination, next_cursor, has_more, total count, edge cases
  - Achieve ≥80% coverage for filters.py and pagination.py
- Integration tests in `./tests/integration/`:
  - Update all existing integration tests to validate enhanced filtering
  - Test complex filter combinations across all list endpoints
  - Test pagination consistency and performance
  - Test include_total parameter

### Acceptance Criteria
- ✅ Bracket filter parser supports all 8 operators with proper type handling
- ✅ Filter parser handles multiple filters on same query (AND logic)
- ✅ Filter parser validates operator compatibility with field types
- ✅ Filter parser generates correct SQLAlchemy filter expressions
- ✅ Advanced keyset pagination works with `id[gt]`/`id[lt]` and `limit` parameters
- ✅ Pagination returns correct next_cursor and has_more values
- ✅ Optional `include_total=true` triggers COUNT query and returns total
- ✅ Pagination handles edge cases correctly (empty results, single page)
- ✅ All utilities work with SQLAlchemy 2.0 async syntax
- ✅ All services updated to use advanced filtering and pagination
- ✅ All list endpoints support enhanced bracket filters
- ✅ All list endpoints support `include_total` parameter
- ✅ No breaking changes to existing API contracts
- ✅ Type hints and docstrings complete for all public functions
- ✅ All existing integration tests still pass
- ✅ New integration tests validate enhanced filtering
- ✅ **ALL TESTS PASS** - zero test failures allowed
- ✅ Test coverage ≥80% for filters.py and pagination.py
- ✅ Can use complex filters across all endpoints: `name[contains]=test&enabled[eq]=true&created_at[gt]=2024-01-01`

---

## Ticket: Performance Validation & Documentation
**Jira Story ID**: AAP-55737
**Story Points**: 5

### Description
Validate system performance against targets, optimize database queries, and complete comprehensive documentation. This ticket ensures the system is production-ready by validating performance benchmarks, documenting all features, and providing operational guides for deployment and troubleshooting.

**Note**: This is the final ticket that validates all completed features meet production requirements. It depends on all previous tickets being complete. This ticket does not add new features but ensures existing features are performant, well-documented, and ready for production use.

### Scope

**Performance Testing Suite**:
- Create performance tests in `./tests/integration/test_performance.py`:
  - Test list endpoints pagination performance: <200ms p95 latency
  - Test tool refresh operation: <5s for 100 tools from test MCP server
  - Test metrics aggregation queries: <200ms p95 latency
  - Test concurrent tool operations: 10 parallel requests without blocking
  - Test rate limit enforcement overhead: adds <100ms latency per request
  - Test database connection pool under load
  - Generate performance report with actual measurements

**Database Optimization Validation**:
- Verify query performance with `EXPLAIN ANALYZE` for:
  - List endpoints with pagination (keyset cursor queries)
  - Filtered queries (bracket filter syntax)
  - Metrics aggregation queries
  - Rate limit enforcement queries
- Ensure all queries use indexes (no sequential scans on large tables)
- Document query plans in performance report
- Add missing indexes if performance targets not met

**Comprehensive Documentation**:
- Update `./README.md` with complete feature documentation:
  - **Overview**: Tool management capabilities and architecture
  - **Quick Start**: Tutorial for registering first MCP provider
  - **API Reference**: All 19 endpoints with curl examples
  - **Tool Providers**: Configuration guide for MCP servers (SSE and Streaming HTTP)
  - **Rate Limiting**: Configuration guide with examples (provider/tool/user levels)
  - **Filtering & Pagination**: Guide to bracket filter syntax and keyset pagination
  - **Performance**: Characteristics and benchmark results
  - **Troubleshooting**: Common issues and solutions
  - **Development**: Setup, testing, and contribution guide
- Ensure OpenAPI schema complete and accurate:
  - All 19 endpoints documented
  - Request/response models with examples
  - Authentication requirements
  - Error responses documented
  - Filter and pagination parameter documentation

**Final Validation**:
- Run complete end-to-end workflow:
  - Register MCP provider → validate → refresh tools → list tools with filters → enable tools → test tool → check metrics → configure rate limit → verify enforcement
- Verify all acceptance criteria from all tickets (AAP-55729 through AAP-55736)
- Confirm test coverage ≥80% for entire codebase
- Validate all tests pass with zero failures
- Generate final coverage report

### Acceptance Criteria
- ✅ Performance tests implemented and passing
- ✅ List endpoints achieve <200ms p95 latency
- ✅ Tool refresh completes in <5s for 100 tools
- ✅ Metrics queries achieve <200ms p95 latency
- ✅ Concurrent operations (10 parallel) don't block or deadlock
- ✅ Rate limit check adds <100ms latency overhead
- ✅ Database queries use indexes (verified with EXPLAIN ANALYZE)
- ✅ No sequential scans on large tables
- ✅ Performance report generated with actual measurements
- ✅ All missing indexes added if performance targets not met
- ✅ README.md updated with comprehensive documentation
- ✅ README includes overview and architecture explanation
- ✅ README includes quick start tutorial with working example
- ✅ README includes curl examples for all major workflows
- ✅ README includes rate limiting configuration examples
- ✅ README includes filtering and pagination guide
- ✅ README includes troubleshooting section
- ✅ README includes performance characteristics
- ✅ OpenAPI schema complete and accurate for all 19 endpoints
- ✅ API documentation accessible at `/docs` with working examples
- ✅ Full end-to-end workflow validated and documented
- ✅ All acceptance criteria from tickets AAP-55729 through AAP-55736 verified
- ✅ Test coverage ≥80% for entire codebase
- ✅ Coverage report generated and reviewed
- ✅ **ALL TESTS PASS** - zero test failures allowed
- ✅ System is production-ready with complete documentation

---

## Summary

**Jira Epic**: AAP-54305 - Tool Provider Integration and Tool Management
**Total Tickets**: 9 tickets (includes AAP-55730 for Tool Provider REST API)
**Total Story Points**: 63 points

### Comparison: Vertical vs Horizontal Slicing

| Aspect | Previous (Horizontal) | New (Vertical) |
|--------|----------------------|----------------|
| **Organization** | By technical layer | By business feature |
| **First Working Feature** | Phase 9 (after 8 phases) | Ticket 1 (immediate) |
| **Testing Approach** | Heavy mocking across layers | End-to-end with real components |
| **Value Delivery** | Delayed until multiple phases complete | Each ticket delivers usable functionality |
| **Dependencies** | Long critical path | Short, clear dependencies |
| **Risk** | Integration issues discovered late | Integration validated early |

### Tickets Overview:

**Part 1: Core Features**
1. **AAP-55729: Core Abstractions and Domain Logic** (5 points)
   - Provider-agnostic architecture foundation
   - Includes: Abstractions, domain models, mock provider, core functions (pure logic, no DB/API)
   - **Delivers**: Working domain logic with testable abstractions

2. **AAP-55730: Tool Provider Management (Service + API + Database)** (8 points)
   - Complete provider REST API implementation
   - Includes: Database models, service layer, FastAPI infrastructure, API (7 endpoints)
   - **Delivers**: Working Tool Provider REST API for registration and management

3. **AAP-55731: Tool Management & Control** (6 points)
   - Complete tool management, enablement, and testing
   - Includes: Tool core functions, service layer, API (5 endpoints)
   - **Delivers**: Working tool management and testing system

4. **AAP-55732: SSE Transport & Foundation** (5 points)
   - First MCP transport implementation and architecture foundation
   - Includes: SSE transport, transport abstraction, comprehensive testing
   - **Delivers**: Working SSE transport for MCP

5. **AAP-55733: Streaming HTTP Transport & Protocol Negotiation** (5 points)
   - Complete multi-protocol support with auto-negotiation
   - Includes: Streaming HTTP transport, protocol fallback, comprehensive testing
   - **Delivers**: Complete dual-protocol support for MCP

**Part 2: Observability & Control**
6. **AAP-55734: Usage Metrics & Analytics** (8 points)
   - Complete usage tracking and analytics
   - Includes: Metrics models, service layer, API (2 endpoints)
   - **Delivers**: Working metrics and analytics system

7. **AAP-55735: Rate Limiting System** (8 points)
   - Complete rate limiting with Valkey-backed enforcement
   - Includes: Rate limit model, sliding window algorithm, service layer, API (5 endpoints)
   - **Delivers**: Working rate limiting system

**Part 3: Developer Experience**
8. **AAP-55736: Filtering & Pagination Framework** (3 points)
   - Advanced query capabilities across all endpoints
   - Includes: Bracket filters, keyset pagination, integration across all APIs
   - **Delivers**: Enhanced developer experience

9. **AAP-55737: Performance & Documentation** (5 points)
   - Production readiness validation
   - Includes: Performance tests, optimization, comprehensive documentation
   - **Delivers**: Production-ready system

### Critical Path:
```
AAP-55729 (Core) → AAP-55730 (Provider API) → AAP-55731 (Tool Mgmt) → AAP-55732 (SSE) → AAP-55733 (Streaming HTTP)
                                              ↓                                              ↓
                                              AAP-55734 (Metrics) → AAP-55736 (Filters)
                                              ↓                           ↓
                                              AAP-55735 (Rate Limiting) → AAP-55737 (Performance)
```

### Key Benefits:
- ✅ **Early Value**: Working REST API after second ticket (AAP-55730)
- ✅ **Reduced Risk**: Integration validated incrementally with clear separation of concerns
- ✅ **Clear Priorities**: Business features over technical layers
- ✅ **Faster Feedback**: Working software enables user feedback early
- ✅ **Simpler Testing**: End-to-end tests with real components
- ✅ **Better Increments**: Each ticket is a potentially shippable increment
- ✅ **Proper Layering**: Clean separation between domain logic (AAP-55729) and infrastructure (AAP-55730)

### Sprint Planning Suggestion:
- **Sprint 1**: AAP-55729 (Core Abstractions) - 5 points
- **Sprint 2**: AAP-55730 (Provider API) - 8 points
- **Sprint 3**: AAP-55731 (Tool Management & Control) - 6 points
- **Sprint 4**: AAP-55732 (SSE Transport) + AAP-55733 (Streaming HTTP) - 5 + 5 = 10 points
- **Sprint 5**: AAP-55734 (Metrics) - 8 points
- **Sprint 6**: AAP-55735 (Rate Limiting) - 8 points
- **Sprint 7**: AAP-55736 (Filtering) + AAP-55737 (Performance) - 3 + 5 = 8 points

### Key Milestones:
1. **Core Architecture**: After AAP-55729 (provider-agnostic abstractions and domain logic)
2. **Working Provider REST API**: After AAP-55730 (can register and manage providers via HTTP)
3. **Working Tool System**: After AAP-55731 (can discover, manage, and test tools)
4. **First Protocol**: After AAP-55732 (SSE transport working)
5. **Complete Protocols**: After AAP-55733 (full dual-protocol support for enterprise deployments)
6. **Complete Observability**: After AAP-55734 (full usage tracking and analytics)
7. **Complete Control**: After AAP-55735 (rate limiting enforcement operational)
8. **Enhanced UX**: After AAP-55736 (powerful filtering and pagination)
9. **Production Ready**: After AAP-55737 (validated performance, complete documentation)
