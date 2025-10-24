# Workflow Engine - JIRA Issues

## Overview
This document breaks down the Workflow Engine implementation plan into self-contained tickets. Each ticket represents a complete, testable unit of work that can be merged independently.

**Implementation Strategy**: Each ticket includes both data models and API endpoints for a cohesive feature delivery. This approach ensures each PR delivers working, end-to-end functionality.

## Project Infrastructure

**Package Namespace**: `nexus` (Python 3.12+)
**Source Directory**: `src/nexus/api/` (configured in `pyproject.toml` with hatchling)
**Database Migrations**: All alembic migration code must be located at `src/nexus/api/alembic/` as a subpackage of `nexus.api`

**Existing Tooling** (already configured, use via Makefile):
- **Package Manager**: `uv` for fast dependency management and virtual environments
- **Formatting**: Ruff (`make format`) + yamlfmt for YAML files
- **Linting**: Ruff (`make lint`) + yamllint
- **Type Checking**: MyPy with strict mode (`make typecheck`)
- **Testing**: pytest with coverage, asyncio, xdist (`make test`, `make test-unit`, `make test-integration`, `make test-coverage`)
- **Pre-commit Hooks**: Configured in `.pre-commit-config.yaml` (ruff, mypy, conventional commits)

**Key Dependencies to Add**:
- Temporal Python SDK (workflow orchestration)
- FastAPI + uvicorn (REST API)
- SQLAlchemy 2.0 + asyncpg (async PostgreSQL)
- Pydantic v2 (validation)
- PyYAML (workflow definitions)
- OpenTelemetry (observability)

---

# Part 1

## Ticket: Workflow Management (Models + API)
**Epic**: [AAP-54306 - Spec out, plan, and implement an initial workflow engine feature](AAP-54306)
**Story Points**: 13

### Description
Implement complete workflow management functionality including database models, REST API endpoints, and basic YAML validation for workflows and versions.

**Note**: This project uses the `nexus` package namespace with source code in `src/nexus/api/`. Leverage existing tooling:
- **Package Manager**: `uv` for dependency management
- **Formatting/Linting**: `make format` and `make lint` (Ruff configured)
- **Type Checking**: `make typecheck` (MyPy with strict mode)
- **Testing**: `make test`, `make test-unit`, `make test-integration`
- **Pre-commit Hooks**: Already configured in `.pre-commit-config.yaml`

### Scope

**Data Models:**
- User, Workflow, and WorkflowVersion models
- PostgreSQL database schema with SQLAlchemy 2.0
- Soft delete implementation (deleted_at, deleted_by fields)
- Database migrations using Alembic (setup at `src/nexus/api/alembic/` as a subpackage of `nexus.api`)
- Soft delete query middleware/interceptor
- Unit tests for all models

**REST API:**
- POST /api/v1/workflows - Create workflow with YAML
- GET /api/v1/workflows - List workflows (exclude soft-deleted)
- GET /api/v1/workflows/{id} - Get workflow details
- PATCH /api/v1/workflows/{id} - Update workflow metadata
- DELETE /api/v1/workflows/{id} - Soft delete workflow
- POST /api/v1/workflows/{id}/versions - Create new version
- GET /api/v1/workflows/{id}/versions - List versions
- GET /api/v1/workflows/{id}/versions/{version} - Get specific version
- OpenAPI contract specification
- Contract tests for all endpoints
- Basic YAML structure validation

### Acceptance Criteria
- ✅ User, Workflow, WorkflowVersion models created with proper relationships
- ✅ Soft delete fields and middleware work correctly
- ✅ Database migrations run successfully
- ✅ All workflow CRUD endpoints implemented
- ✅ Soft delete filters applied to GET endpoints
- ✅ DELETE sets deleted_at/deleted_by, not hard delete
- ✅ Version history tracking works correctly
- ✅ Basic YAML structure validation works
- ✅ OpenAPI spec generated and accurate
- ✅ All tests passing (unit + contract)
- ✅ 80%+ test coverage on models and APIs
- ✅ <200ms API response time
- ✅ Successful e2e API tests

---

## Ticket: Refactor models to use SQLModel
**Epic**: [AAP-54306 - Spec out, plan, and implement an initial workflow engine feature](AAP-56320)
**Story Points**: 5

### Description
Refactor models User, Workflow, WorkflowVersion to use SQLModels

**Data Models:**
- User, Workflow, and WorkflowVersion models

### Acceptance Criteria
- ✅ All existing Workflow Engine database models are updated to subclass from the shared base models
- ✅ All existing Workflow Engine database models are converted to use SQLModel instead of SQLAlchemy
- ✅ All existing Workflow Engine API models are also converted to use the same SQLModel models instead of Pydantic models
- ✅ Any completed Workflow Engine API specs are added to the top-level schema directory

--

## Ticket: YAML Workflow Execution Engine - Bash Script Activities
**Epic**: [AAP-54306 - Spec out, plan, and implement an initial workflow engine feature](AAP-54306)
**Story Points**: 8

### Description
Implement the foundational workflow execution engine that reads YAML workflow definitions and executes them through Temporal, focusing on bash script activities as the initial activity type. Includes support for parallel execution, loops, and conditionals to establish complete workflow control flow capabilities.

### Scope

**YAML Workflow Parser:**
- Parse workflow YAML into executable Temporal workflow
- Support for bash script activities only (executor: script, language: bash)
- Sequential and parallel activity execution
- Loop support (repeat/forEach)
- Conditional execution (conditions)
- Input/output parameter mapping
- Activity timeout and retry configuration

**Temporal Workflow Implementation:**
- Dynamic workflow generation from YAML
- Activity execution for bash script activities
- Parallel activity execution
- Loop and conditional logic
- Workflow state persistence to PostgreSQL
- ActivityExecution tracking in database
- Error handling and retry logic per activity
- Workflow cancellation support
- Integration tests with Temporal testserver

**Execution Service Integration:**
- Execution Management (Models + API) can connect to YAML execution engine
- Start workflow execution from YAML definition
- Track execution progress and update database
- Handle workflow lifecycle events
- Error recovery and retry coordination

### Acceptance Criteria
- ✅ YAML workflows parsed and converted to Temporal workflows
- ✅ Bash script activities execute correctly
- ✅ Sequential and parallel activity execution works
- ✅ Loops (repeat/forEach) work correctly
- ✅ Conditionals evaluated and branches executed
- ✅ Input/output parameters mapped between activities
- ✅ Activity timeouts and retries work per YAML config
- ✅ Workflow state persisted to PostgreSQL
- ✅ Activity execution tracked in ActivityExecution table
- ✅ Errors handled gracefully with retry logic
- ✅ Workflow cancellation stops execution
- ✅ Integration tests cover all workflow features with bash scripts
- ✅ 80%+ test coverage

---

## Ticket: YAML Workflow Execution Engine - Additional Activity Types
**Epic**: [AAP-54306 - Spec out, plan, and implement an initial workflow engine feature](AAP-54306)
**Story Points**: 5

### Description
Extend the workflow execution engine to support additional activity types (REST API calls).

### Scope

**Extended Activity Types:**
- Python script activities (executor: script, language: python)
- REST API activities (executor: api, HTTP requests)

### Acceptance Criteria
- ✅ Python script activities execute correctly
- ✅ REST API activities execute HTTP requests correctly
- ✅ All activity types share common retry/timeout logic
- ✅ Integration tests cover all activity types and features
- ✅ 80%+ test coverage

---

# Part 2

## Ticket: Execution Management (Models + API)
**Epic**: [AAP-54306 - Spec out, plan, and implement an initial workflow engine feature](AAP-54306)
**Story Points**: 13

### Description
Implement execution tracking infrastructure including data models, Temporal setup, and REST API for managing workflow executions.

### Scope

**Data Models:**
- Execution, ActivityExecution, Approval, and AuditLog models
- Database migrations for execution tables
- Relationships with Workflow and WorkflowVersion models
- Status enum state machines
- Unit tests for execution models

**Temporal Infrastructure:**
- Temporal client configuration and connection
- Basic Temporal worker setup
- Connection pooling and error handling
- Health check integration
- Unit tests for Temporal client

**REST API:**
- POST /api/v1/executions - Start workflow execution from workflow ID
- GET /api/v1/executions - List executions with filtering
- GET /api/v1/executions/{id} - Get execution details
- GET /api/v1/executions/{id}/activities - Get activity execution details
- PATCH /api/v1/executions/{id}/cancel - Cancel running execution
- Real-time status updates via polling
- OpenAPI contract specification
- Contract tests for all endpoints

### Acceptance Criteria
- ✅ All 4 execution models created with proper relationships
- ✅ Foreign key constraints to Workflow and WorkflowVersion work
- ✅ Status enums and state transitions validated
- ✅ Database migrations run successfully
- ✅ Temporal client connects successfully
- ✅ Temporal worker can start and stop cleanly
- ✅ All execution endpoints implemented
- ✅ Activity API endpoints implemented (list, get, retry)
- ✅ Status queries return accurate state
- ✅ Activity details include input/output/errors
- ✅ Activity retry functionality works correctly
- ✅ Activity filtering supports status, execution_id, activity_name
- ✅ Cancel operation works (even before YAML execution implemented)
- ✅ OpenAPI spec generated
- ✅ All tests passing (unit + contract)
- ✅ 80%+ test coverage on models and APIs
- ✅ <200ms API response time

---

## Ticket: Enhanced Workflow Validation
**Epic**: [AAP-54306 - Spec out, plan, and implement an initial workflow engine feature](AAP-54306)
**Story Points**: 5

### Description
Add comprehensive YAML workflow definition parsing, validation using JSON Schema, activity type validation, and dependency graph analysis.

### Scope
- JSON Schema for YAML workflow definitions
- YAML parser with Pydantic validation models
- Workflow schema versioning support
- Activity type validation (agentic, connector, script, api)
- Dependency graph validation (detect cycles)
- Unit tests for schema validation
- Integration with workflow API endpoints and temporal workflow engine

### Acceptance Criteria
- ✅ JSON Schema defines valid workflow structure
- ✅ YAML parser validates workflow definitions
- ✅ Invalid YAML returns clear validation errors
- ✅ Schema supports all activity types and approval requirements
- ✅ Cyclic dependency detection works
- ✅ Workflow API uses enhanced validation
- ✅ 80%+ test coverage on validation logic

---

## Ticket: Containerization & Deployment
**Epic**: [AAP-54306 - Spec out, plan, and implement an initial workflow engine feature](AAP-54306)
**Story Points**: 8

### Description
Create Podman containers, podman-compose configuration, Kubernetes manifests, and deployment documentation for the workflow engine.

### Scope
- Containerfile for workflow engine API
- Container image optimization (multi-stage build)
- podman-compose.yml for local development (API, PostgreSQL, Temporal, Redis)
- Kubernetes manifests (Deployment, Service, ConfigMap, Secret)
- Environment variable configuration
- Health check endpoints
- CI/CD pipeline integration
- Deployment documentation

### Acceptance Criteria
- ✅ Podman container image builds successfully
- ✅ Image size optimized (<500MB)
- ✅ podman-compose starts all services locally
- ✅ Kubernetes manifests deploy successfully
- ✅ Health checks pass in container
- ✅ CI/CD pipeline builds and pushes images
- ✅ Deployment documentation complete
- ✅ Rolling updates work without downtime
- ✅ Environment variables externalized

### Deployment Architecture
```
┌─────────────────────────────────────────────────────────┐
│                    Load Balancer                        │
└─────────────────────┬───────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
┌───────▼────────┐         ┌────────▼───────┐
│ Workflow API   │         │ Workflow API   │
│ (Container 1)  │         │ (Container 2)  │
└───────┬────────┘         └────────┬───────┘
        │                           │
        └─────────────┬─────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
┌───────▼────────┐         ┌────────▼───────┐
│   PostgreSQL   │         │ Temporal       │
│   (Primary)    │         │ Cluster        │
└────────────────┘         └────────────────┘
        │
┌───────▼────────┐
│   PostgreSQL   │
│   (Replica)    │
└────────────────┘
```

---

# Part 3

## Ticket: Human-in-the-Loop Approvals
**Epic**: [AAP-54306 - Spec out, plan, and implement an initial workflow engine feature](AAP-54306)
**Story Points**: 8

### Description
Implement approval workflow for activities requiring human approval and approval management REST API.

### Scope
- Approval entity creation during workflow execution
- Temporal workflow pause on approval requirement
- POST /api/v1/approvals/{id} - Approve/reject a pending approval
- GET /api/v1/approvals - List pending approvals
- Workflow resume after approval decision
- Timeout handling for expired approvals
- Contract tests for approval endpoints

### Acceptance Criteria
- ✅ Workflow activity can await human approval before core function starts
- ✅ Approval record created with request data
- ✅ Approve endpoint resumes workflow with approval
- ✅ Reject endpoint terminates activity branch
- ✅ Expired approvals fail the activity
- ✅ All approval endpoints tested
- ✅ Integration test for full approval flow

---

## Ticket: Activity Type Discovery API
**Epic**: [AAP-54306 - Spec out, plan, and implement an initial workflow engine feature](AAP-54306)
**Story Points**: 3

### Description
Implement API endpoint for discovering available activity executor types and their configuration schemas, enabling users and tools to understand what activity types are supported by the workflow engine.

### Scope
- GET /api/v1/activity-types - List available activity executor types
- Return type name, description, and JSON schema for configuration
- Include examples for each activity type
- Support for script (bash, python), api, agentic, and connector types
- OpenAPI contract specification
- Contract tests for endpoint

### Acceptance Criteria
- ✅ Activity types endpoint returns all supported executor types
- ✅ Each type includes name, description, and config schema
- ✅ Config schemas match actual validation requirements
- ✅ Examples provided for each activity type
- ✅ OpenAPI spec generated and accurate
- ✅ Contract tests passing
- ✅ <200ms API response time

---

## Ticket: External Tool Integration (Agentic & Connector Activities)
**Epic**: [AAP-54306 - Spec out, plan, and implement an initial workflow engine feature](AAP-54306)
**Story Points**: 13

### Description
Integrate with external tool servers to enable both agentic (AI-driven) and connector (enterprise system) activity execution within workflows. This includes MCP server integration for agentic tasks and standard connectors for databases, APIs, and enterprise systems.

### Scope
- MCP server connectivity validation for agentic activities
- Agentic activity execution calling MCP tools (executor: agentic)
- Connector activity execution for enterprise systems (executor: connector)
- Tool invocation parameter mapping for both activity types
- Response handling and error management
- Integration with Tool Management API for available tools
- Connector validation at workflow creation time
- Integration tests with mock MCP servers and connector endpoints

### Acceptance Criteria
- ✅ Workflow validates connectors at creation time
- ✅ Agentic activities invoke MCP tools successfully
- ✅ Connector activities execute operations on enterprise systems
- ✅ Tool/connector parameters mapped from workflow definition
- ✅ Tool/connector responses captured in ActivityExecution
- ✅ MCP and connector errors handled gracefully with retries
- ✅ Integration tests with mock MCP servers and connectors passing
- ✅ Support for multiple MCP server types and connector types

---

## Ticket: Advanced Features & Polish
**Epic**: [AAP-54306 - Spec out, plan, and implement an initial workflow engine feature](AAP-54306)
**Story Points**: 8

### Description
Add advanced workflow features including scheduling, labels, input validation, and error recovery mechanisms.

### Scope
- Scheduled workflow execution via Temporal Schedules
- Label-based filtering and organization
- Input data validation using JSON Schema
- Error recovery and partial retry mechanisms
- Workflow execution statistics
- Performance optimization (query tuning, caching)
- Rate limiting for API endpoints
- Pause/resume execution endpoints (PATCH /api/v1/executions/{id})
- Optimistic locking for workflow updates to handle concurrent modifications

### Acceptance Criteria
- ✅ Workflows execute on schedule automatically
- ✅ Labels support flexible organization and filtering
- ✅ Input validation prevents invalid data
- ✅ Failed workflows support partial retry
- ✅ Execution statistics available via API
- ✅ API performance meets <200ms target
- ✅ Rate limiting prevents API abuse
- ✅ Pause endpoint successfully pauses running executions
- ✅ Resume endpoint successfully resumes paused executions
- ✅ Concurrent workflow modifications rejected with clear error message

---

# Part 4

## Ticket: Audit Logging & Observability
**Epic**: [AAP-54306 - Spec out, plan, and implement an initial workflow engine feature](AAP-54306)
**Story Points**: 5

### Description
Implement comprehensive audit logging for all workflow operations and add structured logging/metrics for observability.

### Scope
- AuditLog creation for all critical events
- Structured logging with correlation IDs
- Metrics collection for workflow execution
- OpenTelemetry tracing integration
- GET /api/v1/audit-logs - Query audit trail
- Performance metrics dashboard data
- Integration with logging infrastructure

### Acceptance Criteria
- ✅ All workflow events logged to AuditLog table
- ✅ Correlation IDs track execution flow
- ✅ Structured logs include context metadata
- ✅ Metrics exported for Prometheus/Grafana
- ✅ Audit log query endpoint implemented
- ✅ Tracing spans cover all activities
- ✅ Log retention policy implemented

---

## Ticket: Documentation & Quickstart
**Epic**: [AAP-54306 - Spec out, plan, and implement an initial workflow engine feature](AAP-54306)
**Story Points**: 3

### Description
Create comprehensive documentation, examples, and quickstart guide for the workflow engine.

### Scope
- README with architecture overview
- API documentation (auto-generated from OpenAPI)
- Workflow YAML schema reference
- Example workflows (simple, approval, agentic)
- Quickstart tutorial with sample data
- Deployment guide (Podman, Kubernetes)
- Troubleshooting guide
- Performance tuning guide

### Acceptance Criteria
- ✅ README documents all features clearly
- ✅ API docs auto-generated and published
- ✅ 5+ example workflows provided
- ✅ Quickstart runs successfully end-to-end
- ✅ Deployment guide tested on clean environment
- ✅ All code has docstrings
- ✅ Architecture diagrams updated
- ✅ Troubleshooting covers common issues

---
