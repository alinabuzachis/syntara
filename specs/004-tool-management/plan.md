
# Implementation Plan: Tool Provider Integration and Tool Management

**Branch**: `004-tool-management` | **Date**: 2025-10-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-tool-management/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (web=frontend+backend)
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
Backend API for administrators to register and manage external tool providers (MCP, Python, REST APIs). Key capabilities:
- Register providers and auto-discover their tools
- Control tool availability (enable/disable)
- Track usage metrics and rate limits
- Pluggable adapter architecture for multiple provider types

**Tech Stack**: FastAPI, PostgreSQL, SQLAlchemy 2.0, Valkey
**Frontend**: Separate repository

## Implementation Architecture

```mermaid
graph TB
    subgraph "🌐 API Layer"
        direction TB
        API[REST API endpoints]
        AUTH[Admin Authentication]
        VALID[Input Validation]
    end

    subgraph "⚙️ Business Logic Layer"
        direction LR
        PROV[Tool Provider Service<br/>• Registration<br/>• Validation<br/>• Health Checks]
        TOOL[Tool Management Service<br/>• Refresh<br/>• Metadata<br/>• Enable/Disable]
        METRICS[Metrics Collection Service<br/>• Usage Tracking<br/>• Performance Data<br/>• Analytics]
        RATE[Rate Limiting Service<br/>• Request Throttling<br/>• Quota Management<br/>• Cache Controls]
    end

    subgraph "🔧 Integration Layer"
        ADAPT[Provider Adapters<br/>• MCP SDK<br/>• Python Loader<br/>• REST Client<br/>• gRPC Client]
    end

    subgraph "💾 Data Layer"
        direction LR
        PG[(PostgreSQL<br/>• Provider Configs<br/>• Tool Metadata<br/>• Usage Metrics<br/>• Audit Logs)]
        REDIS[(Valkey Cache<br/>• Session Data<br/>• Rate Limits<br/>• Tool Cache<br/>• Config Cache)]
    end

    subgraph "🌍 External Systems"
        direction LR
        EXT1[MCP Provider<br/>Protocol Tools]
        EXT2[Python Provider<br/>Decorated Functions]
        EXT3[REST API Provider<br/>HTTP Tools]
        EXT4[Custom Provider<br/>Any Tool Type]
    end

    subgraph "📄 Generated Artifacts"
        direction TB
        DM[data-model.md<br/>6 Database Entities]
        CONT[contracts/<br/>3 OpenAPI Specs]
        QS[quickstart.md<br/>8 Test Scenarios]
    end

    %% API Layer connections
    API --> AUTH
    API --> VALID

    %% API to Business Logic
    API --> PROV
    API --> TOOL
    API --> METRICS
    API --> RATE

    %% Business Logic to Integration
    PROV --> ADAPT
    TOOL --> ADAPT

    %% Business Logic to Data
    PROV --> PG
    PROV --> REDIS
    TOOL --> PG
    TOOL --> REDIS
    METRICS --> PG
    RATE --> REDIS

    %% Integration to External
    ADAPT --> EXT1
    ADAPT --> EXT2
    ADAPT --> EXT3
    ADAPT --> EXT4

    %% Artifacts relationships
    DM -.-> PG
    CONT -.-> API
    QS -.-> API

    %% Styling
    classDef api fill:#e3f2fd,stroke:#1976d2,stroke-width:2px,color:#0d47a1
    classDef service fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#4a148c
    classDef integration fill:#e8f5e8,stroke:#388e3c,stroke-width:2px,color:#1b5e20
    classDef data fill:#fff8e1,stroke:#f57c00,stroke-width:2px,color:#e65100
    classDef external fill:#fce4ec,stroke:#c2185b,stroke-width:2px,color:#880e4f
    classDef artifact fill:#f1f8e9,stroke:#558b2f,stroke-width:2px,color:#33691e

    class API,AUTH,VALID api
    class PROV,TOOL,METRICS,RATE service
    class ADAPT integration
    class PG,REDIS data
    class EXT1,EXT2,EXT3,EXT4 external
    class DM,CONT,QS artifact
```

## Data Model Architecture

### Entity Relationship Diagram

```mermaid
erDiagram
    ToolProvider {
        uuid id PK
        string name UK
        text description
        string provider_type
        json configuration
        boolean enabled
        string status
        datetime last_validated_at
        text validation_error
        datetime created_at
        uuid created_by FK
        datetime updated_at
        uuid updated_by FK
        datetime deleted_at
        uuid deleted_by FK
    }

    Tool {
        uuid id PK
        uuid provider_id FK
        string name
        string namespaced_name UK
        text description
        json schema
        boolean enabled
        string status
        datetime last_discovered_at
        text discovery_error
        integer execution_count
        datetime last_executed_at
        datetime created_at
        uuid created_by FK
        datetime updated_at
        uuid updated_by FK
        datetime deleted_at
        uuid deleted_by FK
    }

    ToolParameter {
        uuid id PK
        uuid tool_id FK
        string name
        string type
        text description
        boolean required
        json default_value
        json validation_schema
        json example_value
        datetime created_at
        uuid created_by FK
        datetime updated_at
        uuid updated_by FK
        datetime deleted_at
        uuid deleted_by FK
    }

    ToolMetric {
        uuid id PK
        uuid tool_id FK
        uuid provider_id FK
        uuid user_id FK
        datetime execution_start
        datetime execution_end
        integer duration_ms
        string status
        json input_parameters
        json output_data
        text error_message
        string error_code
        datetime created_at
        uuid created_by FK
        datetime updated_at
        uuid updated_by FK
        datetime deleted_at
        uuid deleted_by FK
    }

    RateLimitConfig {
        uuid id PK
        string target_type
        string target_id
        integer requests_per_window
        integer window_duration_seconds
        integer burst_allowance
        boolean enabled
        datetime created_at
        uuid created_by FK
        datetime updated_at
        uuid updated_by FK
        datetime deleted_at
        uuid deleted_by FK
    }

    UsageCounter {
        uuid id PK
        string counter_type
        uuid provider_id FK
        uuid tool_id FK
        uuid user_id FK
        string time_window
        string window_duration
        integer request_count
        integer success_count
        integer error_count
        integer total_duration_ms
        datetime window_start
        datetime window_end
        datetime created_at
        uuid created_by FK
        datetime updated_at
        uuid updated_by FK
        datetime deleted_at
        uuid deleted_by FK
    }

    ToolProvider ||--o{ Tool : "provides"
    Tool ||--o{ ToolParameter : "defines"
    Tool ||--o{ ToolMetric : "generates"
    ToolProvider ||--o{ ToolMetric : "tracks"
    ToolProvider ||--o{ UsageCounter : "counts"
    Tool ||--o{ UsageCounter : "counts"
```

## Tool Provider Registration and Tool Refresh Flow

### Sequence Diagram

```mermaid
sequenceDiagram
    participant Admin as Administrator
    participant API as REST API
    participant Auth as Authentication
    participant ProvSvc as Tool Provider Service
    participant DB as PostgreSQL
    participant Cache as Valkey Cache
    participant Adapter as Provider Adapter
    participant ExtProv as External Tool Provider

    Note over Admin, ExtProv: Tool Provider Registration Flow

    Admin->>+API: POST /api/v1/tool-providers
    API->>+Auth: Validate admin credentials
    Auth-->>-API: Admin authorized

    API->>+ProvSvc: register_provider(config)
    ProvSvc->>+DB: INSERT ToolProvider record
    DB-->>-ProvSvc: Provider ID created
    ProvSvc->>+Cache: Cache provider config
    Cache-->>-ProvSvc: Config cached

    Note over ProvSvc, ExtProv: Connection Validation
    ProvSvc->>+Adapter: validate_provider(config)
    Adapter->>+ExtProv: Test connection
    ExtProv-->>-Adapter: Connection established
    Adapter-->>-ProvSvc: Provider validated

    ProvSvc->>+DB: UPDATE provider status='available'
    DB-->>-ProvSvc: Status updated
    ProvSvc-->>-API: Registration successful
    API-->>-Admin: 201 Created with provider details

    Note over Admin, ExtProv: Tool Refresh Flow

    Admin->>+API: POST /api/v1/tool-providers/{id}/refresh-tools
    API->>+Auth: Validate admin credentials
    Auth-->>-API: Admin authorized

    API->>+ProvSvc: refresh_tools(provider_id)
    ProvSvc->>+Cache: Get provider config
    Cache-->>-ProvSvc: Provider config returned

    ProvSvc->>+Adapter: list_tools(provider_config)
    Adapter->>+ExtProv: Request available tools
    ExtProv-->>-Adapter: Return Tool definitions
    Adapter-->>-ProvSvc: Tool list with schemas

    loop For each refreshed Tool
        ProvSvc->>+DB: UPSERT Tool record
        DB-->>-ProvSvc: Tool created/updated

        loop For each Tool parameter
            ProvSvc->>+DB: UPSERT ToolParameter
            DB-->>-ProvSvc: Parameter created/updated
        end
    end

    ProvSvc->>+Cache: Cache Tool metadata (1h TTL)
    Cache-->>-ProvSvc: Tools cached
    ProvSvc-->>-API: Refresh complete
    API-->>-Admin: 200 OK with refreshed tools

    Note over Admin, ExtProv: Error Handling
    alt Connection fails
        Adapter->>ExtProv: Connection attempt
        ExtProv-->>Adapter: Connection refused
        ProvSvc->>DB: UPDATE status='error'
        API-->>Admin: 400 Bad Request
    else Tool refresh fails
        Adapter->>ExtProv: List tools request
        ExtProv-->>Adapter: Error response
        ProvSvc->>DB: UPDATE Tool status='error'
        API-->>Admin: 200 OK with partial results
    end
```

## Provider Abstraction Architecture

### Class Diagram: Pluggable Provider Pattern

```mermaid
classDiagram
    %% Abstract Base
    class ToolProviderAdapter {
        <<Protocol/ABC>>
        +validate_connection() ValidationResult
        +refresh_tools() List~ToolMetadata~
        +get_tool_schema(tool_name) ToolSchema
        +invoke_tool(tool_name, params) ToolResult
    }

    %% Concrete Implementations
    class MCPProvider {
        -mcp_client: MCPClient
        -config: MCPConfig
        +validate_connection() ValidationResult
        +refresh_tools() List~ToolMetadata~
        +get_tool_schema(tool_name) ToolSchema
        +invoke_tool(tool_name, params) ToolResult
    }

    class PythonProvider {
        -module_path: str
        -class_name: str
        +validate_connection() ValidationResult
        +refresh_tools() List~ToolMetadata~
        +get_tool_schema(tool_name) ToolSchema
        +invoke_tool(tool_name, params) ToolResult
    }

    class RESTAPIProvider {
        -base_url: str
        -auth_config: Dict
        +validate_connection() ValidationResult
        +refresh_tools() List~ToolMetadata~
        +get_tool_schema(tool_name) ToolSchema
        +invoke_tool(tool_name, params) ToolResult
    }

    %% Factory
    class ProviderFactory {
        +create_provider(provider_type, config) ToolProviderAdapter
        -_registry: Dict~str, Type~
    }

    %% Core Tool Management
    class ToolCore {
        -provider_factory: ProviderFactory
        +register_provider(config) ProviderID
        +refresh_tools(provider_id) List~Tool~
        +list_tools(filters) List~Tool~
        +execute_tool(tool_id, params) Result
    }

    %% Relationships
    ToolProviderAdapter <|-- MCPProvider : implements
    ToolProviderAdapter <|-- PythonProvider : implements
    ToolProviderAdapter <|-- RESTAPIProvider : implements
    ProviderFactory ..> ToolProviderAdapter : creates
    ToolCore --> ProviderFactory : uses

    %% Styling
    classDef abstract fill:#e3f2fd,stroke:#1976d2,stroke-width:3px,color:#0d47a1
    classDef implementation fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#4a148c
    classDef factory fill:#fff8e1,stroke:#f57c00,stroke-width:2px,color:#e65100
    classDef core fill:#e8f5e8,stroke:#388e3c,stroke-width:2px,color:#1b5e20

    class ToolProviderAdapter abstract
    class MCPProvider implementation
    class PythonProvider implementation
    class RESTAPIProvider implementation
    class ProviderFactory factory
    class ToolCore core
```

**Key Design Principles:**
- **Protocol/ABC**: `ToolProviderAdapter` defines the contract all providers must implement
- **Factory Pattern**: `ProviderFactory` routes `provider_type` string → concrete implementation
- **Extensibility**: New provider types (gRPC, GraphQL, etc.) can be added without modifying core
- **MCP as Example**: MCP is ONE implementation, not the only one

**File Structure:**
```
src/nexus/tool_manager/lib/
├── tool_core.py              # Generic tool management (provider-agnostic)
└── providers/
    ├── base.py               # ToolProviderAdapter Protocol/ABC
    ├── factory.py            # ProviderFactory (type routing)
    ├── mcp_provider.py       # MCP implementation (uses MCP SDK)
    ├── python_provider.py    # Python function provider
    └── rest_api_provider.py  # REST API provider
```

## Technical Context
**Language/Version**: Python 3.12+ \
**Primary Dependencies**: FastAPI, uvicorn, pytest, SQLAlchemy 2.0, asyncpg, Valkey, pluggable provider adapters \
**Storage**: PostgreSQL with SQLAlchemy 2.0 + asyncpg driver, Valkey for distributed caching \
**Testing**: pytest with async support, httpx for API testing \
**Target Platform**: Linux server \
**Project Type**: backend (API service only - frontend is separate repository) \
**Performance Goals**: Scalable performance. Metrics to be agreed \
**Constraints**: 5-second provider connection timeouts, 1-hour TTL for Tool metadata caching, Valkey LRU memory management \
**Scale/Scope**: Multiple Tool providers, hundreds of Tools, admin-only API endpoints \
**Arguments**: Feature specification from `/specs/004-tool-management/spec.md`

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Core Principles Compliance
- ✅ **Modular Architecture**: Tool provider registration will be designed as independent, reusable modules with clear interfaces
- ✅ **Test-Driven Development**: All functionality will follow Red-Green-Refactor cycle with tests written first
- ✅ **Explicit Configuration**: All Tool provider connections and Tool settings will be explicit and environment-agnostic
- ✅ **Observability First**: Structured logging, metrics, and tracing for all Tool provider interactions and Tool executions
- ✅ **API Stability**: Public APIs will follow semantic versioning with proper deprecation notices

### Development Standards Compliance
- ✅ **Code Quality**: All code will pass linting (ruff), type checking (mypy), and maintain 80%+ test coverage
- ✅ **Code Style**: Self-descriptive names, no magic numbers, 120 char line limit, proper Python conventions
- ✅ **Documentation**: All classes and public functions will have complete docstrings with examples for complex functions

### No Constitution Violations Identified
This feature aligns with constitutional requirements for modular, observable, well-tested code.

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
# Backend API Service
src/
├── models/          # SQLAlchemy data models
├── services/        # Business logic and provider integration
├── api/            # FastAPI routers and endpoints
└── lib/            # Shared utilities and helpers (includes providers/)

tests/
├── contract/       # API contract tests
├── integration/    # Integration tests with Tool providers
├── unit/          # Unit tests for services and models
├── e2e/            # End-to-end tests with real providers
└── fixtures/       # Test fixtures and mock servers
```

**Structure Decision**: Backend API service only (frontend handled in separate repository)

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
   - Use standard REST patterns with generic bracket notation filtering
   - Support field[operator]=value syntax for flexible querying
   - Output OpenAPI schema to `/contracts/`

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
- Generate tasks from Phase 1 design docs (contracts, data model, quickstart)
- Each contract → contract test task [P]
- Each entity → model creation task [P]
- Each user story → integration test task
- Backend implementation tasks to make tests pass
- API endpoint implementation and testing

**Ordering Strategy**:
- TDD order: Tests before implementation
- Dependency order: Models before services before API endpoints
- Mark [P] for parallel execution (independent files)

**Estimated Output**: 25-30 numbered, ordered tasks in tasks.md (backend API only)

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
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented

---
*Based on Constitution v1.0.0 - See `.specify/memory/constitution.md`*
