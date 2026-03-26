# Implementation Plan: Workflow Definition V2 Implementation

**Branch**: `036-workflow-definition-v2` | **Date**: 2026-03-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/036-workflow-definition-v2/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement graph-based workflow definition v2 to replace the current v1 nested activity structure in Nexus. The v2 format uses directed acyclic graphs (DAGs) with explicit nodes and edges, designed for visual workflow builders and improved execution patterns. Initial implementation focuses on v1 feature parity with new REST APIs for schema discovery and dynamic node type catalogs.

## Technical Context

### Backend (Nexus)

**Language/Version**: Python 3.12
**Primary Dependencies**: FastAPI, SQLModel, Pydantic v2, Temporal, jsonschema
**Storage**: PostgreSQL (via SQLModel for workflow metadata)
**Testing**: pytest
**Target Platform**: Linux server (containerized deployment)
**Project Type**: single (monolithic service with modular architecture)
**Performance Goals**: NEEDS CLARIFICATION - workflow validation <100ms, execution throughput for concurrent workflows
**Constraints**: NEEDS CLARIFICATION - DAG validation complexity limits, maximum workflow size (nodes/edges)
**Scale/Scope**: NEEDS CLARIFICATION - expected concurrent workflow executions, workflow definition size limits

### UI (Nexus-UI)

**Language/Version**: TypeScript with React 19
**Primary Dependencies**:
  - **UI Framework**: React 19, PatternFly 6
  - **Canvas/Graph**: @xyflow/react (XYFlow) for workflow canvas
  - **Layout**: @dagrejs/dagre for automatic graph layout
  - **State Management**: Zustand
  - **Data Fetching**: TanStack Query, openapi-fetch, openapi-react-query
  - **Form Validation**: react-hook-form, zod
  - **Routing**: wouter
**Build Tool**: Vite
**Testing**: Vitest, React Testing Library, Playwright (E2E)
**Target Platform**: Modern browsers (Chrome, Firefox, Safari, Edge)
**Project Type**: Monorepo with npm workspaces (nexus-ui, nexus-contracts, nexus-mock-api)
**Repository**: Separate repository at `/Users/billwei/redhat/bzwei/nexus-ui`

**UI Architecture for V2**:
- **No Transform Required**: V2 format already flat (nodes + edges), minimal transformation to XYFlow format
- **Auto-Layout Only**: Dagre layout engine automatically positions nodes - v2 schemas do not include position metadata in this iteration
- **No Position Persistence**: All workflows use auto-layout on demand without saving positions (position field temporarily removed from v2 node schema)
- **Simplified Data Flow**: Direct mapping from v2 nodes/edges to canvas representation (unlike v1 which required complex flatten/nest transforms)
- **Schema Location**: Copy v2 JSON schemas from backend `/src/nexus/schemas/workflows/v2/` to UI for client-side validation

**Key Differences from V1 UI**:
- V1 UI: Complex bidirectional transform between flat canvas format and nested API format
- V2 UI: Minimal transform - v2 format is already flat and canvas-compatible
- V1 UI: Required WorkflowTransform.flatten() and WorkflowTransform.nest() utilities
- V2 UI: Only needs simple mapping from v2 nodes/edges to XYFlow nodes/edges with dagre positioning

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Core Principles Compliance

- ✅ **I. Modular Architecture**: Workflow v2 components will be in `/src/nexus/workflows/` with clear separation between validation, execution, and API layers
- ✅ **II. Test-Driven Development**: All v2 functionality will follow TDD with tests written first
- ✅ **III. Explicit Configuration**: Workflow definitions are explicit JSON with versioned schemas; no magic values
- ✅ **IV. Observability First**: Workflow execution will emit structured logs and metrics (existing telemetry infrastructure)
- ✅ **V. API Stability**: New v2 APIs follow semantic versioning; v1 APIs remain stable

### Development Standards Compliance

#### API Specification Standards

- ✅ **OpenAPI Compliance**: All new REST endpoints will have OpenAPI 3.x specifications
- ✅ **Naming Convention**: API specifications will use snake_case for all names
- ✅ **Documentation Completeness**: All endpoints will have complete documentation with examples
- ✅ **SQLModel for Data Models**: Workflow models use SQLModel (no separate Pydantic/SQLAlchemy)
- ✅ **Error Handling**: Error responses will follow RFC 9457 Problem Details format
- ✅ **Versioning**: API version in URL path `/api/v1/workflows`, `/api/v1/workflow-schemas`
- ✅ **API Path Structure**: All endpoints follow `/api/v1/[component]/[resource]` pattern:
  - `/api/v1/workflows` (workflow management)
  - `/api/v1/workflow-schemas/v2/*` (schema discovery)
- ✅ **Pagination**: Discovery endpoints will support `limit` and `cursor` parameters
- ✅ **Filtering**: Discovery API supports `labels[key]=value` filtering patterns
- ✅ **Security Schemes**: Authenticated endpoints will document security in OpenAPI specs
- ✅ **Schema Management**: JSON Schemas stored in `/src/nexus/schemas/workflows/` (existing location)

#### Code Quality Requirements

- ✅ **Tests Before Merge**: All code passes lint, format, typecheck, tests
- ✅ **Code Coverage**: Maintain 90%+ coverage for new v2 code
- ✅ **Integration Tests**: Required for workflow execution and API endpoints
- ✅ **CI Checks**: Must pass all CI checks

#### Code Style & Documentation

- ✅ **Self-Descriptive Names**: No single-letter variables (except loop counters)
- ✅ **Constants**: All magic numbers as named constants
- ✅ **Docstrings**: All classes and public methods documented
- ✅ **README Updates**: Update if installation/commands change

### Workflow & Process Compliance

- ✅ **Feature Branch**: Working on `036-workflow-definition-v2` branch
- ✅ **Pull Requests**: PR required for all changes
- ✅ **Code Review**: Minimum one approval required

### Violations Requiring Justification

*None - all constitution requirements can be met without violations*

---

## Phase 1 Re-Evaluation

**Date**: 2026-03-12
**Status**: ✅ All Constitution requirements remain compliant after Phase 1 design

### Design Artifacts Review

**Generated Artifacts**:
- ✅ research.md - Architectural decisions documented
- ✅ data-model.md - SQLModel patterns, execution flow defined
- ✅ contracts/openapi.yaml - OpenAPI 3.1 spec with all v2 endpoints
- ✅ quickstart.md - Developer guide with examples

**Constitution Compliance Verification**:

- ✅ **Modular Architecture**: Design maintains separation of concerns (models, services, validators, executors)
- ✅ **TDD**: Test structure defined (unit, integration, contract tests)
- ✅ **Explicit Configuration**: JSON schemas drive validation, no magic values
- ✅ **Observability**: All nodes (including control) create ActivityExecution records for uniform tracking
- ✅ **API Stability**: v2 APIs versioned at /api/v1/*, schema_version "2.0.0" enforced

**API Specification Standards Compliance**:
- ✅ **OpenAPI 3.1**: Complete spec in contracts/openapi.yaml
- ✅ **snake_case Convention**: All API fields use snake_case
- ✅ **Full Documentation**: All endpoints have descriptions, examples, error responses
- ✅ **SQLModel**: Data models use SQLModel (Workflow, WorkflowExecution)
- ✅ **RFC 9457 Errors**: ValidationError and ProblemDetails schemas defined
- ✅ **API Path Structure**: /api/v1/workflows, /api/v1/workflow-schemas
- ✅ **Filtering**: labels[key]=value pattern for discovery API
- ✅ **Security**: Bearer token authentication documented
- ✅ **Schema Location**: /src/nexus/schemas/workflows/ (existing location)

**No New Violations Introduced**

All design decisions align with constitution principles. Ready for Phase 2 (task generation).

## Project Structure

### Documentation (this feature)

```text
specs/036-workflow-definition-v2/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── openapi.yaml     # OpenAPI spec for workflow and schema APIs
│   └── schemas/         # JSON Schema references for API contracts
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

**Structure Decision**: Nexus uses a single monolithic service structure with modular components under `/src/nexus/`. **V2 completely replaces v1** - no backward compatibility. All v1 code will be removed and replaced with v2 implementations. Only `schema_version: "2.0.0"` is supported.

```text
src/nexus/
├── api/                          # FastAPI routers
│   └── workflow_schemas_router.py # [NEW] Schema discovery endpoints
├── workflows/                     # Workflow module
│   ├── models/
│   │   └── workflow_version.py    # [REPLACE] Remove v1, keep only v2 JSONB structure
│   ├── services/
│   │   ├── workflow_service.py    # [REPLACE] Remove v1 logic, implement v2
│   │   └── schema_service.py      # [NEW] Schema discovery service
│   ├── validators/
│   │   └── workflow_definition.py # [REPLACE] V2 validator with schema version enforcement
│   │                              # Basic validation first, then add comprehensive DAG checks
│   ├── utils/
│   │   ├── activity_traversal.py  # [MODIFY] Reduce to minimal compatibility, phase out
│   │   └── namespace_resolver.py  # [NEW] Template expression resolver (${...} patterns)
│   │                              # Smart loop resolution, context-aware upstream search
│   ├── workflow_engine/
│   │   ├── dynamic_workflow.py    # [REPLACE] V2 graph-based execution engine
│   │   ├── graph.py               # [NEW] WorkflowGraph domain model with ActivityNode
│   │   ├── graph_backend.py       # [NEW] IGraphBackend protocol + InMemoryGraphBackend
│   │                              # NetworkX backend available for advanced validation
│   │   ├── services/
│   │   │   └── activity_sync_service.py  # [REPLACE] Update for v2 graph structure (1042 lines)
│   │   │                          # Replace nested traversal with flat node/edge lookups
│   │   └── activities/            # V2 activities with unified output structure
│   │       ├── manual_trigger.py   # [NEW] Manual trigger with output mapping
│   │       ├── http_request_activity.py # [NEW] HTTP executor (replaces api_activity.py)
│   │       ├── aap_job_template_activity.py # [ADAPT] Update for V2 output structure
│   │       ├── agentic_activity.py # [ADAPT] Update for V2 output structure
│   │       ├── script_activity.py  # [ADAPT] Update for V2 output structure
│   │       ├── approval_activity.py # [ADAPT] Update for V2 output structure
│   │       ├── condition.py        # [NEW] Binary branching (true/false ports)
│   │       ├── loop.py             # [NEW] for_each & do_while (iterate/complete ports)
│   │       ├── converge.py         # [NEW] Synchronization (strategy "all")
│   │       └── output_mapping.py   # [NEW] Shared utility for selective output extraction
│   └── router.py                  # [REPLACE] Remove v1 routes, add v2 + schema discovery
├── schemas/workflows/             # JSON Schemas
│   ├── v1/                        # [DELETE] Remove all v1 schemas
│   └── v2/                        # [KEEP] V2 schemas only
│       ├── workflow_definition.schema.json
│       ├── executors/
│       ├── triggers/
│       ├── control-nodes/
│       └── catalog/
└── core/                          # Core utilities (existing)
    └── database.py                # Database session management

tests/
├── unit/workflows/
│   ├── test_workflow_definition_validator.py  # [REPLACE] Remove v1 tests, add v2 tests
│   ├── test_graph_module.py                   # [NEW] Graph abstraction tests
│   ├── test_graph_traversal.py                # [NEW] Graph traversal utilities tests
│   ├── test_control_nodes.py                  # [NEW] Control node executor tests
│   └── workflow_engine/services/
│       └── test_activity_sync_service.py      # [REPLACE] Update with v2 workflow definitions
├── integration/workflows/
│   ├── test_workflow_api.py                   # [REPLACE] Remove v1 tests, add v2 tests
│   ├── test_schema_discovery_api.py           # [NEW] Schema discovery endpoint tests
│   ├── test_workflow_execution_v2.py          # [NEW] V2 graph execution tests
│   └── test_activity_sync_v2.py               # [NEW] Real-time activity syncing with v2 workflows
└── contract/workflows/
    └── test_openapi_compliance.py             # [NEW] OpenAPI spec compliance tests
```

**Key Implementation Points**:

1. **Model Layer**: Existing `workflow_version.py` SQLModel keeps JSONB `workflow_definition` field. Only accept `schema_version: "2.0.0"`.

2. **Validation Layer** (`validators/workflow_definition.py`):
   - WorkflowValidator class with schema version enforcement (2.0.0 only)
   - Basic required fields validation (triggers, nodes, edges)
   - Future: Comprehensive DAG validation via NetworkX backend

3. **Graph Architecture** (Domain Model + Backend):
   - `graph.py`: WorkflowGraph domain model with ActivityNode abstraction
   - `graph_backend.py`: IGraphBackend protocol for pluggable implementations
     - InMemoryGraphBackend for basic operations (prototype/testing)
     - NetworkXBackend for advanced validation (DAG cycles, orphaned nodes)
   - Loop feedback edge handling: edges with `to_port="iterate"` create cycles but are removed during graph build
   - Runtime automatically loops back from last node in iterate path

4. **Namespace & Template System** (`utils/namespace_resolver.py`):
   - NamespaceResolver class for ${...} template expression resolution
   - Smart loop resolution: ${loop.item} auto-finds closest upstream loop node
   - Context-aware resolution with graph + current_node for upstream traversal
   - Recursive dict resolution for nested config structures

5. **Unified Activity Result Structure**:
   - All activities return: `{"output": {...}, "control": {...}}`
   - `output`: User-facing data (subject to output mapping, stored in Temporal)
   - `control`: Internal routing data (next_port, loop state - never exposed to users)
   - Output mapping applied **inside activities** before returning (prevents storing suppressed fields in Temporal history)

6. **Output Mapping** (`activities/output_mapping.py`):
   - Shared utility for selective output extraction
   - Applied internally in all activities before returning results
   - Mapping rules: None = full output, {} = status only, {...} = extract specific fields
   - Failed results (status="failed") bypass output mapping

7. **Control Flow Activities**:
   - `condition.py`: Binary branching with eval-based condition evaluation
   - `loop.py`: for_each (items iteration) and do_while (condition-based)
   - `converge.py`: Synchronization point (strategy "all" - waits for all concurrent paths)
   - All return unified structure with control portion for routing

8. **Executor Activities** (V2 Adaptations):
   - `manual_trigger.py`: Pass-through with output mapping
   - `http_request_activity.py`: New HTTP executor (replaces api_activity)
   - Existing executors adapted for V2: aap_job_template, agentic, script, approval

9. **Workflow Execution Engine** (`dynamic_workflow.py`):
   - Graph-based execution replacing V1 nested activity traversal
   - **Asyncio concurrent execution**: When multiple edges from same port → concurrent downstream execution
   - **Port-based routing**: Control flow nodes return `control.next_port` to determine which edges to follow
   - **Loop iteration management**:
     - Loop namespace stored as `loop.{loop_node_id}.item/index`
     - Smart resolution: ${loop.item} auto-finds closest upstream loop
     - Transitive loop body tracking for multi-node loop bodies
   - **Skipped node tracking**: Condition nodes mark non-taken branches as skipped, propagate downstream
   - **Converge synchronization**: Wait for all concurrent paths before executing converge node
   - **Activity signal handling**: Support for async callbacks (agentic, approval nodes)

10. **Activity Sync Service** (`workflow_engine/services/activity_sync_service.py`):
    - Real-time monitoring that syncs ActivityExecution records from Temporal to database
    - Update for V2 graph structure (flat nodes/edges vs nested activities)
    - Monitor workflow progress via Temporal workflow queries
    - Handle skipped node detection via get_skipped_nodes() workflow query

### UI Source Code (nexus-ui repository)

**Location**: `/Users/billwei/redhat/bzwei/nexus-ui`

**Structure Decision**: Nexus UI uses npm workspaces monorepo. **V2 UI implementation will replace/simplify existing v1 workflow transform logic**. The existing `WorkflowTransform` class that handles complex flatten/nest operations will be simplified since v2 format is already flat.

```text
nexus-ui/
├── packages/
│   ├── nexus-contracts/                    # OpenAPI TypeScript types
│   │   └── schemas/                        # [NEW] Copy v2 schemas from backend
│   │       └── workflows/v2/               # Static copy of backend v2 schemas
│   ├── nexus-ui/
│   │   └── src/
│   │       ├── routes/builder/             # Workflow builder UI
│   │       │   ├── utils/
│   │       │   │   ├── workflowTransform.ts      # [SIMPLIFY] Remove v1 flatten/nest complexity
│   │       │   │   │                              # Add simple v2ToXYFlow() and xyFlowToV2() transforms
│   │       │   │   ├── workflowToGraph.ts        # [UPDATE] Handle v2 nodes/edges structure
│   │       │   │   ├── layoutEngine.ts           # [KEEP] Dagre layout - works with v2 edges directly
│   │       │   │   ├── EdgeFactory.ts            # [UPDATE] Create v2 edges with from_port/to_port
│   │       │   │   └── validateConnection.ts     # [UPDATE] Validate v2 edge rules
│   │       │   ├── hooks/
│   │       │   │   ├── useWorkflowInitialization.ts  # [UPDATE] Load v2 workflows
│   │       │   │   └── useNodePositioning.ts     # [KEEP] Dagre positioning logic
│   │       │   ├── node-forms/                   # Node configuration panels
│   │       │   │   ├── ConditionNodeForm.tsx     # [UPDATE] Configure v2 condition nodes
│   │       │   │   ├── LoopNodeForm.tsx          # [UPDATE] Configure v2 loop nodes with iterate/complete
│   │       │   │   # No ParallelNodeForm - parallelism is implicit, not a node type
│   │       │   │   ├── ConvergeNodeForm.tsx      # [UPDATE] Configure v2 converge nodes
│   │       │   │   ├── AAPNodeForm.tsx           # [UPDATE] Configure v2 aap_job_template nodes
│   │       │   │   ├── ActionNodeForm.tsx        # [UPDATE] Configure v2 http_request nodes
│   │       │   │   ├── AIAgentNodeForm.tsx       # [UPDATE] Configure v2 agentic nodes
│   │       │   │   └── TriggerNodeForm.tsx       # [UPDATE] Configure v2 manual trigger nodes
│   │       │   ├── BuilderFlow.tsx               # [UPDATE] Main canvas component for v2
│   │       │   └── types/
│   │       │       └── edge.ts                   # [UPDATE] Add v2 edge attributes (from_port, to_port)
│   │       ├── stores/
│   │       │   ├── useWorkflowStore.ts           # [UPDATE] Store v2 workflow with nodes/edges
│   │       │   ├── workflowStoreTypes.ts         # [UPDATE] Type v2 nodes/edges structure
│   │       │   └── workflowFactories.ts          # [UPDATE] Factory functions for v2 nodes/edges
│   │       └── utils/
│   │           └── workflowTags.ts               # [KEEP] Workflow metadata utilities
│   └── nexus-mock-api/                     # Mock API server
│       └── handlers/                        # [UPDATE] Add v2 workflow API mock responses
└── tests/
    └── e2e/                                 # Playwright E2E tests
        └── builder/                         # [NEW] V2 workflow builder E2E tests
```

**Key UI Implementation Points**:

1. **Simplified Transform**: V1 required `WorkflowTransform.flatten()` and `WorkflowTransform.nest()` to convert between API format (nested) and canvas format (flat). **V2 only needs simple mapping** from v2 nodes/edges to XYFlow nodes/edges with auto-layout positioning.

2. **Auto-Layout Only**: In this round, all workflows use dagre auto-layout. No position persistence. Layouts are computed on-demand when workflows load or change.

3. **Schema Copy**: Copy v2 JSON schemas from backend `/src/nexus/schemas/workflows/v2/` to UI `packages/nexus-contracts/schemas/workflows/v2/` for client-side validation and type generation.

4. **Edge Attributes**: UI must support creating edges with v2-specific port attributes:
   - `from_port: "true" | "false"` for condition nodes
   - `from_port: "iterate" | "complete"` for loop nodes
   - `to_port: "iterate"` for loop feedback edges (creates cycle back to loop node for next iteration)

5. **Node Type Support**: UI must support all v1 parity node types in v2 format:
   - Trigger: manual
   - Executors: aap_job_template, http_request, agentic, script
   - Control Flow: condition, loop, converge
   - Parallelism: Implicit (multiple edges from same port, no dedicated node)

6. **State Management**: Zustand store maintains v2 workflow definition with flat nodes/edges arrays. No need for complex state transformations.

7. **Validation**: UI performs client-side validation using copied v2 schemas before submitting to backend.

## Complexity Tracking

*No violations - this section is empty*
