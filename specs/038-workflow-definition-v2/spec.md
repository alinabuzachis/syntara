# Feature Specification: Workflow Definition V2 Implementation

**Feature Branch**: `036-workflow-definition-v2`
**Created**: 2026-03-11
**Status**: Draft
**Input**: User description: "Implement the graph-based workflow definition v2 to replace the current v1 nested activity structure in Nexus. The v2 format uses directed acyclic graphs (DAGs) with explicit nodes and edges, designed for visual workflow builders and improved execution patterns. Schemas are already defined in src/nexus/schemas/workflows/v2/."

---

**Implementation Scope Note**: The v2 workflow definition includes new node types and features that were not implemented in v1. This specification documents the complete v2 capability set for reference. However, the initial implementation phase will focus on **feature parity with v1** - implementing only the node types that existed in v1:
- **Triggers**: manual
- **Executors**: aap_job_template, http_request (called "api" in v1), agent, script
- **Control Flow**: condition, loop, parallel, converge

New v2-exclusive node types (scheduled/webhook/eda triggers, approval executor, switch/wait nodes) will be deferred to future implementation phases after v1 parity is achieved and validated.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accept and Validate V2 Workflow Definitions (Priority: P1)

Workflow authors need to submit workflows using the new v2 graph-based format through the workflow creation API. The system must validate these workflows against the v2 schema, ensuring structural correctness, proper node/edge relationships, and compliance with execution flow rules.

**Why this priority**: This is the foundational capability - without the ability to accept and validate v2 workflows, no other v2 features can function. This enables immediate adoption of the new format.

**Independent Test**: Can be fully tested by submitting various v2 workflow definitions via API and verifying validation responses. Delivers the ability to create and store valid v2 workflows.

**Acceptance Scenarios**:

*Note: These scenarios are representative examples. Full validation coverage includes all node types (triggers, executors, control flow nodes) as defined in FR-003, with type-specific configuration validation per the v2 schemas.*

1. **Given** a valid v2 workflow definition with trigger nodes, executor nodes, and edges, **When** submitted via workflow creation API, **Then** the system accepts and stores the workflow
2. **Given** a v2 workflow with invalid node references in edges, **When** submitted, **Then** the system rejects with specific validation error identifying the invalid reference
3. **Given** a v2 workflow with multiple trigger nodes, **When** submitted, **Then** the system accepts the workflow and associates all triggers
4. **Given** a v2 workflow where multiple edges from the same port converge at a converge node, **When** submitted, **Then** the system validates that all concurrent paths properly connect to the converge node
5. **Given** a v2 workflow with loop node having edges from from_port="iterate" and from_port="complete", **When** submitted, **Then** the system validates the loop structure
6. **Given** a v2 workflow with loop feedback edge (to_port="iterate") creating a cycle, **When** submitted, **Then** the system accepts the workflow and correctly identifies it as a valid loop pattern
7. **Given** a v2 workflow with secret references in node outputs, **When** submitted, **Then** the system rejects with security validation error

---

### User Story 2 - Execute V2 Workflows (Priority: P1)

Users need to trigger and execute workflows defined in v2 format. The system must interpret the graph structure, follow edges to determine execution order, handle concurrent execution (multiple edges from same port), conditional logic, loops, and variable passing between nodes.

**Why this priority**: Equal to validation in criticality - users must be able to execute v2 workflows to realize any business value. This is core functionality.

**Independent Test**: Can be tested by creating simple v2 workflows (sequential, parallel, conditional) and verifying correct execution flow, node execution order, and result propagation.

**Acceptance Scenarios**:

1. **Given** a v2 workflow with sequential nodes, **When** triggered via manual trigger, **Then** nodes execute in the order defined by edges
2. **Given** a v2 workflow with a node having multiple edges from same port, **When** executed, **Then** downstream nodes execute concurrently and converge node waits for all to complete
3. **Given** a v2 workflow with a condition node, **When** executed, **Then** only edges from the matching from_port (true or false) are followed
4. **Given** a v2 workflow with a loop node, **When** executed, **Then** edges from from_port="iterate" execute for each iteration, and edges from from_port="complete" execute when loop finishes
5. **Given** a v2 workflow with variable references between nodes, **When** executed, **Then** downstream nodes receive outputs from upstream nodes via namespace resolution
6. **Given** a v2 workflow with trigger input data, **When** executed, **Then** trigger data is accessible to downstream nodes via trigger namespace

---

### User Story 3 - Support All V2 Node Types (Priority: P2)

Workflow authors need to use all node types defined in the v2 specification: trigger nodes (manual, scheduled, webhook, eda), executor nodes (aap_job_template, http_request, agentic, approval), and control flow nodes (condition, switch, loop, converge, wait). Parallelism is achieved by having multiple edges from the same port, not via a dedicated parallel node.

**Why this priority**: Essential for feature completeness but can be delivered incrementally after basic execution works. Each node type adds specific workflow capabilities.

**Independent Test**: Each node type can be tested independently by creating workflows that use only that node type and verifying type-specific behavior.

**Acceptance Scenarios**:

1. **Given** a v2 workflow with a scheduled trigger, **When** the schedule time arrives, **Then** the workflow executes with the configured static values
2. **Given** a v2 workflow with a webhook trigger, **When** webhook receives a payload, **Then** the workflow executes with validated webhook data
3. **Given** a v2 workflow with an http_request node, **When** executed, **Then** the HTTP call is made and response is captured
4. **Given** a v2 workflow with an approval node, **When** executed, **Then** execution pauses until approval is granted or timeout occurs
5. **Given** a v2 workflow with a switch node, **When** executed, **Then** the branch matching the expression value executes
6. **Given** a v2 workflow with a wait node, **When** executed, **Then** execution pauses for the specified duration or until condition is met

---

### User Story 4 - Support V2 Variable and Data Flow (Priority: P2)

Workflow authors need to pass data between nodes using the v2 variable system with node-based namespaces, system namespaces (secret, workflow_context, env, trigger, loop), and selective output extraction via the outputs field.

**Why this priority**: Critical for building complex workflows but can be implemented after basic node execution. Enables real-world use cases that require data transformation and passing.

**Independent Test**: Can be tested by creating workflows with various variable reference patterns and verifying correct data resolution and propagation.

**Acceptance Scenarios**:

1. **Given** a v2 workflow with template expressions referencing upstream node outputs, **When** executed, **Then** expressions resolve to actual output values
2. **Given** a v2 workflow with selective outputs defined on a node, **When** executed, **Then** only specified output fields are accessible to downstream nodes
3. **Given** a v2 workflow with secret references in node config, **When** executed, **Then** secrets are injected at runtime but not exposed in results, and ActivityExecution.input_data masks any secret-derived values
4. **Given** a v2 workflow with loop iteration variables, **When** loop executes, **Then** loop.item and loop.index are accessible within loop body
5. **Given** a v2 workflow with trigger namespace references, **When** executed, **Then** trigger namespace resolves to the active trigger's outputs
6. **Given** a v2 workflow with outputs set to empty object, **When** executed, **Then** only status and error fields are accessible, all other result data is hidden

---

### User Story 5 - Visual Workflow Builder Integration (Priority: P3) ⚠️ DEFERRED

**Status**: Deferred to future implementation. Position metadata temporarily removed from v2 schemas.

Workflow designers using visual canvas tools need workflows to render correctly with proper visual representation of control flow patterns (parallel, conditional, loops). In the current implementation, the UI uses auto-layout (dagre) exclusively without position persistence.

**Why deferred**: Position metadata (x, y coordinates) temporarily removed from v2 node schema. Visual builder integration will be revisited in a future iteration when position support is added back.

**Future Acceptance Scenarios** (when position support returns):

1. **Given** a v2 workflow with position metadata on nodes, **When** loaded in visual builder, **Then** nodes appear at specified x,y coordinates
2. **Given** a user dragging nodes in visual builder, **When** workflow is saved, **Then** updated positions are persisted in workflow definition
3. **Given** a v2 workflow where multiple edges from same port converge at a node, **When** rendered, **Then** visual builder shows clear concurrent execution divergence and convergence points
4. **Given** a v2 workflow with loop node, **When** rendered, **Then** visual builder shows edges from from_port="iterate" and from_port="complete" with appropriate visual indicators

---

### User Story 6 - Schema Discovery for Visual Workflow Builders (Priority: P2)

Visual workflow builder UIs and external tools need to discover available node types, retrieve their schemas, and understand validation requirements dynamically. The system must provide REST APIs for schema access with filtering capabilities to support categorized node palettes.

**Why this priority**: Essential for enabling third-party UI development and ensuring workflow builders can operate independently. Enables dynamic node palette construction without hardcoding node types.

**Independent Test**: Can be tested by querying discovery endpoints with various filters and verifying schema retrieval for all node types. Delivers the ability for UIs to build node catalogs programmatically.

**Acceptance Scenarios**:

1. **Given** a visual builder UI, **When** it queries GET /api/v1/workflow-schemas/v2/discover, **Then** it receives a complete list of all available node types with metadata
2. **Given** a UI building an executor palette, **When** it queries GET /api/v1/workflow-schemas/v2/discover?labels[category]=executor, **Then** it receives only executor node types (aap_job_template, http_request, agentic, approval)
3. **Given** a UI retrieving a specific node schema, **When** it queries GET /api/v1/workflow-schemas/v2/executors/aap_job_template.schema.json, **Then** it receives the complete JSON schema for that node type
4. **Given** a UI building an AAP-specific palette, **When** it queries GET /api/v1/workflow-schemas/v2/discover?labels[system]=aap, **Then** it receives only AAP-related nodes
5. **Given** a UI with multiple filter criteria, **When** it queries GET /api/v1/workflow-schemas/v2/discover?labels[category]=executor&labels[execution]=remote, **Then** it receives nodes matching all criteria (AND logic)
6. **Given** a UI needs the master workflow schema, **When** it queries GET /api/v1/workflow-schemas/v2/workflow-definition.schema.json, **Then** it receives the complete v2 workflow definition schema

---

### User Story 7 - Convert Sample Workflows to V2 Format (Priority: P3)

The codebase contains sample v1 workflows used for testing and documentation. These samples need to be converted to v2 format to provide reference implementations and maintain test coverage for the new format.

**Why this priority**: Important for documentation and testing but not blocking for core functionality. Can be done after v2 execution is stable.

**Independent Test**: Can be tested by converting each sample v1 workflow to v2 format and verifying behavioral equivalence through test execution.

**Acceptance Scenarios**:

1. **Given** a sample v1 workflow with nested activities, **When** converted to v2, **Then** the flat node structure with edges preserves execution order
2. **Given** a sample v1 workflow with parallel activities, **When** converted to v2, **Then** multiple edges from same port with converge node correctly represents concurrent execution
3. **Given** a sample v1 workflow with conditions, **When** converted to v2, **Then** condition nodes with from_port="true"/from_port="false" edges maintain branching logic
4. **Given** converted v2 sample workflows, **When** executed, **Then** they produce equivalent behavior and results as original v1 samples
5. **Given** v2 sample workflows in the codebase, **When** accessed by developers, **Then** they serve as reference implementations for v2 patterns

---

### User Story 8 - UI Workflow Builder with V2 Format (Priority: P1) 🎯 MVP

Workflow designers need to create and edit workflows using a visual workflow builder UI that works with the v2 graph-based format. The builder must support adding/removing nodes, connecting them with edges, configuring node properties, and persisting workflows in v2 format.

**Why this priority**: Essential for user adoption - users need a visual interface to create workflows without manually writing JSON. Core UI functionality required for v2 adoption.

**Independent Test**: Can be tested by opening the UI builder, creating various v2 workflows (sequential, parallel, conditional), editing them, and verifying workflows are saved in correct v2 format.

**Acceptance Scenarios**:

1. **Given** an empty workflow canvas, **When** user drags a manual trigger node from the palette, **Then** a v2 manual trigger node is added to the canvas
2. **Given** two nodes on the canvas, **When** user connects them by drawing an edge, **Then** a v2 edge with correct from/to node IDs is created
3. **Given** a condition node on the canvas, **When** user connects it to two downstream nodes, **Then** edges are created with from_port="true" and from_port="false"
4. **Given** a node on the canvas with multiple outgoing edges from the same port, **When** workflow executes, **Then** downstream nodes execute concurrently
5. **Given** a loop node on the canvas, **When** user creates loop structure, **Then** edges are created with from_port="iterate" and from_port="complete"
6. **Given** a workflow with nodes and edges, **When** user clicks Save, **Then** workflow is persisted in v2 format with schema_version: "2.0.0", triggers array, nodes array, and edges array
7. **Given** a node on the canvas, **When** user selects it and edits properties in the side panel, **Then** node config is updated and validated against node type schema
8. **Given** a workflow in the builder, **When** user clicks Delete on a node, **Then** node and all connected edges are removed
9. **Given** a workflow with control flow nodes, **When** validation errors occur, **Then** errors are displayed with specific details about validation failures

---

### User Story 9 - UI Workflow Canvas Rendering with Auto-Layout (Priority: P1) 🎯 MVP

Users need to view workflows on a visual canvas with proper layout and positioning. In this initial round, the UI must automatically compute node positions using graph layout algorithms (dagre) to render v2 workflows. This auto-layout capability ensures workflows can be visualized without requiring position metadata in the workflow definition.

**Why this priority**: Critical for workflow visualization - users must see clear, organized workflow diagrams. Auto-layout enables immediate rendering regardless of whether position data is present in the workflow.

**Independent Test**: Can be tested by loading v2 workflows and verifying proper rendering, node spacing, and edge routing with dagre auto-layout.

**Acceptance Scenarios**:

1. **Given** a v2 workflow loaded in the UI, **When** rendered, **Then** nodes are automatically positioned using dagre layout algorithm with top-to-bottom flow
2. **Given** a v2 workflow with sequential nodes, **When** rendered, **Then** nodes appear in execution order from top to bottom
3. **Given** a v2 workflow where multiple edges originate from same port, **When** rendered, **Then** concurrent paths appear side-by-side with proper converge point alignment
4. **Given** a v2 workflow with a loop node, **When** rendered, **Then** nodes connected via from_port="iterate" appear in a visually distinct pattern showing iteration flow
5. **Given** a v2 workflow with condition nodes, **When** rendered, **Then** edges from from_port="true" and from_port="false" are clearly distinguished with port labels or visual indicators
6. **Given** a rendered workflow, **When** user pans/zooms the canvas, **Then** workflow remains properly rendered at all zoom levels
7. **Given** a workflow canvas, **When** auto-layout is applied, **Then** nodes do not overlap and edges are routed with minimal crossings
8. **Given** a user editing a workflow on canvas, **When** structural changes are made (add/remove nodes/edges), **Then** layout is automatically recomputed to maintain visual clarity

---

### Edge Cases

Edge case handling is defined through 30+ validation rules documented in the [workflow definition proposal appendix](pull/1220), including:

- Concurrent execution failures (when multiple edges from same port lead to concurrent execution): Converge node waits for all concurrent paths to complete (strategy: "all").
- Circular edge references are detected during validation. Loop feedback edges (to_port="iterate") creating cycles are acceptable and removed for DAG analysis. The last node reachable via from_port="iterate" automatically loops back at runtime without needing the feedback edge. Other cycles result in workflow rejection with specific error details.
- Trigger nodes with incoming edges (invalid by specification)
- Template expression errors during execution (undefined variables, type mismatches)
- Condition nodes with no outgoing edge from a required port (from_port="true" or from_port="false")
- Loop iterations exceeding reasonable limits (infinite loop protection)
- Secret references that don't exist or are inaccessible
- Converge node behavior with failed concurrent execution paths (waits for all paths regardless of individual failures)
- Sample workflow conversions that cannot be directly mapped to v2 constructs

## Requirements *(mandatory)*

### Functional Requirements

#### Workflow Submission and Validation

- **FR-001**: System MUST accept workflow definitions with schema_version "2.0.0" in the workflow_definition field
- **FR-002**: System MUST validate all v2 workflows against the master workflow definition schema
- **FR-003**: System MUST validate each node's configuration against its type-specific schema
- **FR-004**: System MUST reject workflows with duplicate node IDs
- **FR-005**: System MUST reject workflows with node IDs matching reserved namespace names (trigger, loop, result, secret, workflow_context, env)
- **FR-006**: System MUST reject workflows with edges referencing non-existent node IDs
- **FR-007**: System MUST reject workflows with trigger nodes that have incoming edges
- **FR-008**: System MUST require at least one trigger node in every workflow
- **FR-009**: System MUST validate converge patterns ensure all incoming concurrent paths (multiple edges targeting same converge node) are properly connected
- **FR-010**: System MUST validate loop nodes have at least one edge with from_port="iterate" and zero or one edge with from_port="complete"
- **FR-011**: System MUST reject workflows with secret references in node outputs definitions
- **FR-012**: System MUST perform comprehensive DAG validation, rejecting workflows with circular references (except loop feedback edges with to_port="iterate"), orphaned nodes, or unreachable nodes. Loop feedback edges that create cycles MUST be removed for DAG validation and reachability analysis. The last node in an iterate branch automatically loops back to the loop node at runtime without requiring the feedback edge.

#### Workflow Execution

- **FR-013**: System MUST execute v2 workflows by following edges from trigger nodes through the graph
- **FR-014**: System MUST execute nodes in dependency order determined by edge direction
- **FR-015**: System MUST execute nodes concurrently when multiple edges originate from the same port (implicit parallelism)
- **FR-016**: System MUST execute only edges from the matching port based on condition evaluation (from_port="true" or from_port="false")
- **FR-017**: System MUST execute loop iterations following edges from from_port="iterate" until completion condition is met
- **FR-018**: System MUST make node results available to downstream nodes via node ID namespace
- **FR-019**: System MUST resolve template expressions using ${...} syntax during node execution
- **FR-020**: System MUST inject secrets referenced in node config at runtime without exposing values in results
- **FR-021**: System MUST respect selective output extraction when outputs field is defined on a node
- **FR-022**: System MUST make status and error fields available regardless of outputs definition
- **FR-023**: System MUST provide loop iteration context (loop.item, loop.index) within loop body scope
- **FR-024**: System MUST resolve trigger namespace to the active trigger's outputs
- **FR-025**: System MUST support loop termination via edges from loop node's from_port="complete" (exit loop after all iterations). Loop feedback edges with to_port="iterate" are optional and can be safely removed.

#### Node Type Support

- **FR-026**: System MUST support manual trigger nodes with input schema validation
- **FR-027**: System MUST support scheduled trigger nodes with cron expression scheduling
- **FR-028**: System MUST support webhook trigger nodes with payload validation
- **FR-029**: System MUST support eda trigger nodes with event data validation
- **FR-030**: System MUST support aap_job_template executor nodes
- **FR-031**: System MUST support http_request executor nodes
- **FR-032**: System MUST support agentic executor nodes
- **FR-033**: System MUST support approval executor nodes with timeout handling
- **FR-034**: System MUST support condition control flow nodes with binary branching
- **FR-035**: System MUST support switch control flow nodes with multi-way branching
- **FR-036**: System MUST support loop control flow nodes with forEach and while variants
- **FR-037**: System MUST support concurrent execution when multiple edges originate from the same port (no dedicated parallel node required)
- **FR-038**: System MUST support converge control flow nodes (currently only strategy "all" is supported - waits for all concurrent paths to complete)
- **FR-039**: System MUST support wait control flow nodes with duration and condition-based pausing

#### Data Flow and Variables

- **FR-040**: System MUST support template expression syntax ${...} for variable references
- **FR-041**: System MUST provide system namespaces: secret, workflow_context, env, trigger, loop, result
- **FR-042**: System MUST provide node-based namespaces using node IDs
- **FR-043**: System MUST support selective output extraction via outputs field
- **FR-044**: System MUST hide all non-selected fields when outputs is defined (except status and error)
- **FR-045**: System MUST support outputs: {} to expose only status and error fields
- **FR-046**: System MUST sanitize execution results to redact secret references before persistence
- **FR-046a**: System MUST mask/obfuscate any field in ActivityExecution.input_data that was evaluated from a secret expression (e.g., ${secret.api_key})

#### Sample Workflow Conversion

- **FR-047**: Sample workflows in codebase MUST be converted from v1 to v2 format
- **FR-048**: Converted v2 sample workflows MUST maintain behavioral equivalence to v1 originals
- **FR-049**: V2 sample workflows MUST serve as reference implementations for common workflow patterns
- **FR-050**: Test suites MUST validate converted sample workflows execute correctly

#### UI Workflow Builder and Canvas

- **FR-051**: UI MUST support creating v2 workflows with schema_version "2.0.0"
- **FR-052**: UI MUST provide a visual canvas for adding, removing, and connecting nodes
- **FR-053**: UI MUST persist workflows in v2 format with triggers array, nodes array and edges array
- **FR-054**: UI MUST support creating edges between nodes with appropriate port specifications (from_port, to_port)
- **FR-055**: UI MUST validate edge connections according to node type rules (e.g., condition nodes require from_port="true" or from_port="false", loop nodes support from_port="iterate"/from_port="complete")
- **FR-056**: UI MUST provide node configuration panels for editing type-specific config properties
- **FR-057**: UI MUST support all v1 parity node types in the workflow builder (manual, aap_job_template, http_request, agentic, script, condition, loop, converge). Parallelism is implicit via multiple edges from same port.
- **FR-058**: UI MUST automatically compute node positions using dagre layout algorithm for rendering workflows on canvas
- **FR-059**: UI MUST render edges with proper routing and visual indicators for port-based routing (from_port, to_port)
- **FR-060**: UI MUST update workflow definition in real-time as users add/remove/edit nodes and edges
- **FR-061**: UI MUST display validation errors from backend with specific details about what failed
- **FR-062**: UI MUST support drag-and-drop of node types from palette onto canvas
- **FR-063**: UI MUST generate unique node IDs matching pattern ^[a-zA-Z_][a-zA-Z0-9_]*$ when creating new nodes
- **FR-064**: UI MUST prevent creating edges that would violate v2 validation rules (e.g., incoming edges to trigger nodes)
- **FR-065**: UI MUST provide visual distinction for different node categories (triggers, executors, control flow)
- **FR-066**: UI MUST support pan and zoom operations on the workflow canvas
- **FR-067**: UI MUST re-layout workflows after structural changes to maintain visual clarity
- **FR-068**: UI MUST transform v2 flat structure (nodes + edges) to/from internal canvas representation (XYFlow nodes/edges)
- **FR-069**: UI MUST apply dagre layout with top-to-bottom flow direction and appropriate spacing between nodes
- **FR-070**: UI MUST handle special layout for loop structures (loop body nodes positioned to the right of loop node)

### API Requirements

#### Workflow Management APIs

- **API-001**: System MUST provide POST /api/v1/workflows endpoint to accept v2 workflow definitions
- **API-002**: POST /api/v1/workflows MUST accept JSON payload with workflow_definition field containing v2 graph structure
- **API-003**: POST /api/v1/workflows MUST validate workflow_definition against v2 schema before acceptance
- **API-004**: POST /api/v1/workflows MUST return validation errors with specific details on schema violations

#### Schema Discovery APIs

- **API-005**: System MUST provide GET /api/v1/workflow-schemas/v2/workflow-definition.schema.json to retrieve master workflow schema
- **API-006**: System MUST provide GET /api/v1/workflow-schemas/v2/executors/{node_type}.schema.json for executor node schemas
- **API-007**: System MUST provide GET /api/v1/workflow-schemas/v2/control-nodes/{node_type}.schema.json for control flow node schemas
- **API-008**: System MUST provide GET /api/v1/workflow-schemas/v2/triggers/{node_type}.schema.json for trigger node schemas
- **API-009**: System MUST provide GET /api/v1/workflow-schemas/v2/catalog/node_type_catalog.json to retrieve complete node type catalog
- **API-010**: Node type catalog MUST include type, title, description, labels, and schema_path for each node type
- **API-011**: System MUST provide GET /api/v1/workflow-schemas/v2/discover endpoint for dynamic node type discovery
- **API-012**: Discovery endpoint MUST support label filtering via query parameters (e.g., labels[category]=executor)
- **API-013**: Discovery endpoint MUST support multiple label filters with AND logic
- **API-014**: Discovery endpoint response MUST include node_types array with type, title, description, labels, and schema_path
- **API-015**: Label filters MUST support category labels (executor, control, trigger)
- **API-016**: Label filters MUST support custom labels defined in node schemas (system, execution, pattern)

### Key Entities

- **Workflow Definition V2**: Graph-based workflow representation containing schema version, metadata, triggers array (separate from nodes), nodes array, and edges array
- **Node**: Individual workflow step with unique ID, type, configuration, and optional outputs definition
- **Edge**: Directed connection between nodes or triggers defining execution flow, with optional port specifications (from_port, to_port). Ports enable multi-output nodes (condition: true/false, loop: iterate/complete) and loop feedback (to_port="iterate" creates cycles for iteration routing).
- **Trigger Node**: Workflow entry point (manual, scheduled, webhook, eda) stored in separate triggers array, defining how external data enters workflow
- **Executor Node**: Work-performing node (aap_job_template, http_request, agentic, approval) that executes specific tasks
- **Control Flow Node**: Execution pattern controller (condition, switch, loop, parallel, converge, wait) managing workflow logic
- **Node Namespace**: Variable scope using node ID as namespace for accessing node outputs
- **System Namespace**: Global variable scopes (secret, workflow_context, env, trigger, loop, result)
- **Template Expression**: Variable reference syntax using ${...} for dynamic value substitution
- **Selective Output**: Mechanism to expose only specific node result fields via outputs definition
- **Node Type Catalog**: Complete registry of available node types with metadata, labels, and schema references
- **Schema Discovery Endpoint**: REST API endpoint supporting dynamic node type discovery with label-based filtering
- **Node Type Label**: Metadata attribute for categorizing and filtering node types (category, system, execution, pattern)
- **Workflow Schema**: JSON Schema definition for v2 workflow structure and validation rules

## Clarifications

### Session 2026-03-11

- Q: What happens when a converge node receives results from failed concurrent executions? → A: Converge nodes wait for all concurrent paths to complete (strategy: "all"). The converge node itself does not have error handling configuration in this implementation.
- Q: How does the system handle circular edge references and invalid DAG structures? → A: Comprehensive DAG validation (cycles, orphaned nodes, unreachable nodes) during workflow submission. Loop feedback edges (to_port="iterate") are allowed to create cycles and are removed for DAG analysis. At runtime, the last node reachable via from_port="iterate" automatically loops back to the loop node.
- Q: How are edge cases (condition routing, template errors, loop limits, etc.) handled? → A: 30+ validation rules in proposal appendix cover edge cases
- Q: How do loops route execution back for the next iteration? → A: The last node reachable via from_port="iterate" automatically loops back to the loop node at runtime. Optional feedback edges with to_port="iterate" are removed during validation.
- Q: How is parallelism achieved in v2? → A: Parallelism is implicit when multiple edges originate from the same port. No dedicated parallel node is needed.
- Q: Which node types existed in v1 for initial parity implementation? → A: Manual trigger; aap_job_template, http_request (api in v1), agent, script executors; condition, loop, converge control flow
- Q: What observability/monitoring requirements apply to v2 workflows? → A: ActivitySyncService will be refactored to monitor V2 workflow executions - syncing ActivityExecution records from Temporal to database in real-time. All nodes (including control flow) create ActivityExecution records for uniform tracking.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can submit valid v2 workflow definitions and receive immediate acceptance response
- **SC-002**: Users can trigger v2 workflows and see execution begin promptly
- **SC-003**: Sequential v2 workflows execute nodes in correct edge-defined order 100% of the time
- **SC-004**: V2 workflows with multiple edges from same port execute concurrently with converge synchronization working correctly 100% of the time
- **SC-005**: Variable references between nodes resolve correctly with zero data loss
- **SC-006**: Secret references in node configurations are never exposed in execution results, logs, or ActivityExecution.input_data (secret-derived values are masked)
- **SC-007**: Workflow validation catches structural errors (invalid edges, missing nodes, invalid patterns, non-loop cycles) and provides actionable error messages. Loop feedback edges (to_port="iterate") are correctly identified and allowed.
- **SC-008**: Loop control flow works correctly with last node reachable via from_port="iterate" automatically routing back to loop node for next iteration
- **SC-009**: V2 workflows with all supported node types execute successfully without errors
- **SC-010**: Sample v1 workflows are converted to v2 format with behavioral equivalence verified through tests
- **SC-011**: Template expressions resolve efficiently during node execution
- **SC-012**: Converge nodes correctly synchronize concurrent path completion (strategy: "all" - waits for all paths)
- **SC-013**: Visual builder UIs can discover all available node types via GET /api/v1/workflow-schemas/v2/discover endpoint
- **SC-014**: Schema discovery filtering by labels returns correct subsets of node types (100% accuracy)
- **SC-015**: All v2 node type schemas are accessible via individual schema endpoints
- **SC-016**: Workflow submission via POST /api/v1/workflows returns validation errors with specific details for invalid workflows
- **SC-017**: API responses include proper JSON Schema validation with actionable error messages
- **SC-018**: UI workflow builder creates and saves v2 workflows with correct schema_version "2.0.0", nodes array, and edges array
- **SC-019**: UI auto-layout positions nodes without overlap and edges route with minimal crossings using dagre algorithm
- **SC-020**: UI users can create sequential, parallel, conditional, and loop workflows using visual canvas without writing JSON
- **SC-021**: UI displays backend validation errors with actionable messages when workflow save fails
- **SC-022**: UI correctly transforms between v2 format (nodes/edges) and XYFlow canvas representation with 100% fidelity
- **SC-023**: UI prevents invalid edge connections (e.g., incoming edges to triggers) before submission to backend
- **SC-024**: UI workflow builder supports all v1 parity node types (manual, aap_job_template, http_request, agentic, script, condition, loop, converge) with implicit parallelism via multiple edges from same port

## Assumptions

- JSON Schema validation infrastructure already exists in the system
- V2 schemas in src/nexus/schemas/workflows/v2/ are complete and accurate
- Workflow execution engine infrastructure supports graph-based execution models
- Secret management system provides secure runtime secret injection
- Visual workflow builder UI is a separate component that consumes workflow definitions
- Template expression syntax uses ${...} (same as v1)
- **V2 completely replaces v1** - no backward compatibility, no migration support
- **Users will reset their database when transitioning to v2** - no migration of existing production workflows is required
- **All v1 code is removed** - no side-by-side operation, only `schema_version: "2.0.0"` supported
- Sample workflows in codebase will be updated to v2 format
- Node type implementations (http_request, agentic, etc.) are already available or being developed in parallel

## Dependencies

- Workflow Definition V2 Proposal: Documented in [handbook PR #1220](pull/1220)
- Jira Epic: AAP-67063 tracks implementation work
- V2 Schemas: Located in src/nexus/schemas/workflows/v2/
- Workflow Engine: Must support graph-based execution
- Node Type Implementations: All executor, trigger, and control flow node types must be implemented
- Secret Management System: External system providing secure secret storage and injection

## Out of Scope

### Initial Implementation (V1 Parity Focus)

The following v2-exclusive node types and features are deferred to future implementation phases after v1 parity is achieved:

- **Scheduled trigger node**: Time-based cron scheduling (v1 only has manual trigger)
- **Webhook trigger node**: HTTP webhook integration
- **EDA trigger node**: Event-Driven Ansible trigger integration
- **Approval executor node**: Human approval gates with timeout handling (partially implemented in v1 but non-functional; completion deferred)
- **Switch node**: Multi-way branching (v1 only has condition/binary branching)
- **Wait node**: Pause execution with duration or condition-based timing
- **Converge node enhancements**: Advanced synchronization strategies beyond basic v1 converge
- **Loop node enhancements**: Advanced iteration patterns beyond v1 capabilities

### Future Enhancements

- **Observability and monitoring**: Workflow execution logging, metrics, tracing - addressed by dedicated feature request
- **Expression language enhancements**: Beyond ${...} syntax (deferred per open question in proposal)
- **Sub-workflow support**: Deferred to post-GA per proposal
- **Visual workflow builder UI implementation**: Separate component (out of scope for backend)
- **Script node executor type**: Noted in schemas but marked as future consideration due to security concerns
- **Workflow definition optimization**: Compression features, performance optimizations
- **Advanced debugging tools**: V2-specific debugging, execution replay, step-through debugging
- **Workflow definition versioning**: Within v2 format (e.g., v2.1.0, v2.2.0 compatibility handling)

### Explicitly Out of Scope (No V1 Support)

- **V1 to V2 migration support**: No migration tooling - users reset database
- **V1 backward compatibility**: V2 completely replaces v1, no side-by-side operation
- **V1 code maintenance**: All v1 validation, execution, and API code is removed
- **Schema version discrimination**: Only `schema_version: "2.0.0"` is supported
