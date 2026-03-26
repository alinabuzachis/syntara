# Research: Workflow Definition V2 Implementation

**Feature**: 036-workflow-definition-v2
**Date**: 2026-03-12
**Phase**: 0 - Outline & Research

## Research Questions

### 1. JSON Schema Validation Architecture

**Question**: How should we validate v2 workflow definitions against the JSON schemas in src/nexus/schemas/workflows/v2/?

**Research Findings**:

Reviewed Python JSON Schema validation libraries:
- **jsonschema** (https://python-jsonschema.readthedocs.io/): Most mature, supports Draft 7/2019-09/2020-12
- **fastjsonschema**: Faster but less feature-complete
- **pydantic**: Good for runtime models but not schema-first validation

**Decision**: Use `jsonschema` library with Draft 2020-12 + template preprocessing

**Rationale**:
- V2 schemas already exist and follow OpenAPI 3.1/JSON Schema 2020-12 standard
- jsonschema provides comprehensive error messages for validation failures
- Supports $ref resolution for modular schema files
- Handles inter-parameter dependencies automatically (unlike Pydantic custom validators)
- Well-tested, widely adopted in Python ecosystem
- Integrates easily with FastAPI error handling

**Template Expression Challenge**:
V1 uses `TemplateAwareBaseModel` (Pydantic) which allows `${...}` expressions to bypass type validation. However, this generates warnings in logs. V2 needs to validate type constraints while supporting template expressions.

**Solution**: Preprocessing approach
1. Traverse workflow definition to find all `${...}` template expressions
2. Replace each template with a type-appropriate mock value based on field's JSON schema type:
   - Integer field: `123`
   - String field: `"mock_string"`
   - Boolean field: `true`
   - Array field: `[]`
   - Object field: `{}`
3. Validate the preprocessed (mock-filled) workflow against JSON schemas
4. Keep original workflow definition (with templates) for storage and execution

**Implementation Approach**: Basic validation first (schema version + required fields), comprehensive validation later (template preprocessing + jsonschema + DAG validation). Start simple and add complexity as needed.

**Alternatives Considered**:
- Pydantic with TemplateAwareBaseModel throughout: Rejected - generates warnings, requires custom validators for inter-parameter rules
- Pydantic models generated from schemas: Rejected - schemas are source of truth, code generation adds complexity
- fastjsonschema: Rejected - less comprehensive error messages, harder to debug validation failures
- Skip type validation for fields with templates: Rejected - loses important validation coverage

---

### 2. DAG Validation Strategy

**Question**: How do we implement the 30+ validation rules from the proposal appendix, particularly DAG structural validation?

**Research Findings**:

Reviewed graph validation approaches:
- **NetworkX** (https://networkx.org/): Comprehensive graph library for Python
- **graphlib** (Python stdlib 3.9+): Lightweight topological sort and cycle detection
- Custom implementation: Build graph representation and validate manually

**Decision**: Use **pluggable backend architecture** with InMemoryGraphBackend for basic operations and NetworkX for advanced validation

**Rationale**:
- Backend abstraction (IGraphBackend protocol) allows different graph implementations
- InMemoryGraphBackend provides simple dictionary-based operations for prototype and basic runtime
- NetworkXBackend provides comprehensive algorithms for DAG validation (cycles, reachability, topological sort)
- Separation of concerns: domain model (WorkflowGraph) delegates to backend implementation
- Future flexibility to optimize or replace backend without changing domain model
- Start simple with InMemory, add NetworkX only when comprehensive validation needed

**Validation Sequence**:
1. **JSON Schema validation** (structure, types, required fields via jsonschema + preprocessing)
2. **Build NetworkX DiGraph** from nodes and edges (exclude display_only edges)
3. **Cycle detection** via `nx.is_directed_acyclic_graph()` or `nx.find_cycle()`
4. **Reachability analysis**:
   - Orphaned nodes: nodes with no incoming or outgoing edges
   - Unreachable nodes: nodes not reachable from any trigger node
5. **Pattern validation** using NetworkX queries:
   - Trigger nodes: `G.in_degree(node_id) == 0`
   - Parallel branches: traverse successors with `branch="parallel"` and verify converge connection
   - Loop nodes: filter edges by `branch="iterate"` and `branch="complete"`
   - Condition nodes: verify edges have appropriate `when` attributes
6. **Namespace validation** (node IDs don't conflict with reserved names)
7. **Secret safety** (secrets not referenced in outputs definitions)

**NetworkX Operations Used**:
- **Validation**: `nx.is_directed_acyclic_graph()`, `nx.find_cycle()`, `G.in_degree()`, `G.out_degree()`, edge filtering
- **Runtime**: `nx.topological_sort()`, `G.successors()`, `G.predecessors()`, edge attribute queries

**Alternatives Considered**:
- graphlib + NetworkX mix: Rejected - unnecessary complexity, two graph libraries for same workflow
- graphlib only: Rejected - lacks rich graph queries needed for pattern validation and runtime traversal
- Full custom implementation: Rejected - reinventing cycle detection and graph algorithms is error-prone

---

### 3. Graph Execution Engine Design

**Question**: How should the v2 execution engine differ from v1's nested activity approach?

**Research Findings**:

Reviewed v1 implementation:
- Uses Temporal workflows with nested activities (src/nexus/workflows/workflow_engine/dynamic_workflow.py)
- Activities are executed sequentially or in parallel based on nesting structure
- Template resolution happens before activity execution

V2 requirements:
- Execute nodes based on edge dependencies
- Support parallel execution via edges with branch: "parallel"
- Handle conditional branching via when attributes
- Loop iteration via iterate/complete branches
- **Every node creates Temporal activity and ActivityExecution record** (including control nodes)

**Decision**: NetworkX-based topological execution with raw dict storage

**Rationale**:
- Use NetworkX DiGraph to store workflow structure
- Store raw node dicts (not Pydantic models) in graph for lightweight traversal
- Use `nx.topological_sort()` to determine execution order
- Track node completion status to enable dependent nodes
- Execute all ready nodes (dependencies met) concurrently where possible
- Convert node dict to Pydantic model only during execution (after template resolution)
- **All nodes (including control) execute as Temporal activities for uniform tracking**

**Execution Algorithm**:
```python
# Build graph once at workflow start
G = nx.DiGraph()
for node in workflow_definition["nodes"]:
    G.add_node(node["id"], **node)  # Store raw dict as node attributes
for edge in workflow_definition["edges"]:
    if not edge.get("display_only"):
        G.add_edge(edge["from"], edge["to"], **edge)

# Execution loop
for node_id in nx.topological_sort(G):
    # Check if dependencies met + edge conditions satisfied
    if not ready_to_execute(node_id, G, completed_nodes):
        continue

    # Get raw node dict from graph
    raw_node = dict(G.nodes[node_id])

    # Resolve template expressions in node config
    resolved_node = resolve_templates(raw_node, execution_context)

    # Convert to Pydantic model for type validation (no more templates)
    if resolved_node["type"] == "aap_job_template":
        node_model = JobTemplateNode(**resolved_node)
    elif resolved_node["type"] == "http_request":
        node_model = HttpRequestNode(**resolved_node)
    # ... other node types

    # Execute node via Temporal activity
    result = await execute_node(node_model)

    # Update execution context with node outputs
    execution_context.node_outputs[node_id] = extract_outputs(result, raw_node.get("outputs"))
```

**Key Benefits**:
- No TemplateAwareBaseModel needed (no warnings)
- Type validation happens after template resolution (plain Pydantic)
- Lightweight graph traversal (raw dicts, not heavy Pydantic objects)
- Template resolution isolated to execution phase

**Control Node Execution (V1 vs V2)**:

V1 behavior:
- Control nodes (condition, loop, parallel, converge) are NOT Temporal activities
- No ActivityExecution records for control nodes
- Harder to track control flow execution

V2 behavior:
- **Every node (including control) executes as Temporal activity**
- **Every node creates ActivityExecution record** for uniform tracking
- Enables monitoring/observability via Temporal events

**Implementation**:
```python
# Control nodes create Temporal activities
async def execute_control_node(node: ControlNode):
    """Execute control node as Temporal activity."""
    if node.type == "condition":
        # Evaluate condition, return result
        result = evaluate_condition(node.config.condition)
        return {"condition_result": result}

    elif node.type == "parallel":
        # Create parallel activity (no-op)
        # Actual parallel execution handled by workflow
        return {"branches_started": True}

    elif node.type == "converge":
        # Option 1: Wait synchronously in activity
        await wait_for_branches(node.config.strategy)
        return {"converged": True}

        # Option 2: Exit async, signal completion later
        # Activity exits immediately, internal activity signals when branches complete
        signal_async_completion(node_id, wait_for_branches)
        return {"waiting": True}

    elif node.type == "loop":
        # Loop control logic
        return {"iteration_count": count}
```

**Converge Node Async Handling**:
For control nodes that need to wait for dependencies (e.g., converge waiting for parallel branches):
1. Initial Temporal activity exits asynchronously (records start in ActivityExecution)
2. Internal Temporal activity monitors branch completion
3. When branches complete, signal completion and update ActivityExecution record

This ensures all nodes have ActivityExecution records while avoiding long-running activity timeouts.

**Alternatives Considered**:
- Pydantic models throughout with TemplateAwareBaseModel: Rejected - generates warnings
- graphlib.TopologicalSorter: Rejected - NetworkX already required, provides richer API
- Recursive execution: Rejected - harder to manage parallelism and state
- Event-driven execution: Rejected - over-engineered for current needs
- Skip ActivityExecution for control nodes: Rejected - inconsistent tracking, harder observability

---

### 4. Node Namespace Resolution

**Question**: How do we implement v2's node-based namespaces and system namespaces (secret, workflow_context, env, trigger, loop)?

**Research Findings**:

V1 uses simple template resolution with ${...} syntax. V2 extends this with:
- Node-based namespaces: ${node_id.field}
- System namespaces: ${secret.key}, ${workflow_context.execution_id}, etc.
- Selective outputs: outputs field on nodes limits exposed fields

**Decision**: NamespaceResolver with template expression resolution and smart loop context

**Rationale**:
- NamespaceResolver manages system namespaces (secret, workflow_context, env, trigger, loop) and node-based namespaces
- Template expression pattern matching using regex: `${...}` syntax
- Dot notation for nested field access (e.g., `${node_id.field.nested}`)
- Smart loop resolution: `${loop.item}` automatically finds closest upstream loop node
- Context-aware resolution with graph + current_node for upstream traversal
- Validate secret references only in node config (not in outputs field)

**Alternatives Considered**:
- Jinja2 templating: Rejected - v1 uses ${...}, maintaining compatibility
- Full expression language: Deferred - per proposal open question

---

### 5. Parallel Execution and Converge Synchronization

**Question**: How do we implement parallel execution with converge nodes and on_error configurations?

**Research Findings**:

Per clarifications:
- Parallel nodes have on_error option: "stop" (terminate workflow), "continue" (wait for all branches)
- Converge nodes have their own on_error configuration
- Converge waits for branches based on strategy (all, any, n_required)

**Decision**: Temporal activity groups with error handling

**Rationale**:
- Use Temporal's gather pattern for concurrent activities
- Track each branch's completion status (success/failure)
- Respect parallel node's on_error setting during execution
- Pass aggregated results to converge node
- Converge node evaluates strategy and determines next step

**Implementation**:
```python
async def execute_parallel_node(parallel_node, branches):
    tasks = []
    for branch_edge in branches:
        task = execute_branch(branch_edge)
        tasks.append(task)

    results = []
    for task in asyncio.as_completed(tasks):
        try:
            result = await task
            results.append(result)
        except Exception as e:
            if parallel_node.on_error == "stop":
                # Cancel remaining tasks
                for t in tasks:
                    t.cancel()
                raise
            else:  # continue
                results.append(ErrorResult(e))

    return results

async def execute_converge_node(converge_node, branch_results):
    if converge_node.strategy == "all":
        # Wait for all branches (already done)
        if any(is_error(r) for r in branch_results):
            # Handle based on converge on_error
            pass
    elif converge_node.strategy == "any":
        # At least one success required
        pass
    # ...apply strategy and on_error
```

**Alternatives Considered**:
- Thread-based parallelism: Rejected - Temporal handles concurrency
- Sequential with async: Rejected - doesn't achieve true parallelism

---

### 6. Sample Workflow Creation

**Question**: How should sample workflows be created in v2 format?

**Research Findings**:

Prior nested structure (for reference):
```yaml
workflow:
  activities:
    - type: job_template
      name: provision
    - type: parallel
      activities:
        - type: api
          name: frontend
        - type: job_template
          name: backend
```

V2 graph-based structure (nodes + edges):
```json
{
  "nodes": [
    {"id": "provision", "type": "aap_job_template", ...},
    {"id": "parallel_1", "type": "parallel", ...},
    {"id": "frontend", "type": "http_request", ...},
    {"id": "backend", "type": "aap_job_template", ...},
    {"id": "converge_1", "type": "converge", ...}
  ],
  "edges": [
    {"from": "provision", "to": "parallel_1"},
    {"from": "parallel_1", "to": "frontend", "branch": "parallel"},
    {"from": "parallel_1", "to": "backend", "branch": "parallel"},
    {"from": "frontend", "to": "converge_1"},
    {"from": "backend", "to": "converge_1"}
  ]
}
```

**Decision**: Manual creation with documented structural patterns

**Rationale**:
- Sample workflows are limited in number (per assumptions)
- Manual creation ensures quality and serves as documentation
- Structural patterns documented for reference when creating workflows
- V2 is the only supported format (no v1 compatibility)

**V2 Structural Patterns**:
1. **Sequential steps** → Sequential nodes with edges
2. **Parallel execution** → Parallel node + branches + converge node
3. **Conditional branching** → Condition node + when-labeled edges
4. **Iteration** → Loop node + iterate/complete edges
5. **HTTP requests** → http_request node type

**Documentation**:
- Create pattern guide in specs/036-workflow-definition-v2/conversion-guide.md (misnomer - actually pattern examples)
- Include structural examples for each pattern
- Document common workflow scenarios

**Alternatives Considered**:
- Code generation from DSL: Deferred - low ROI for sample workflows
- Template library: Deferred - patterns documentation sufficient initially

---

### 7. Activity Sync Service Migration

**Question**: How should the activity_sync_service (1042 lines) be migrated from v1's nested structure to v2's graph structure?

**Research Findings**:

**Current V1 Implementation**:
The `activity_sync_service.py` is a critical real-time monitoring component that:
- Streams Temporal history events to sync ActivityExecution records to database
- Traverses v1's nested workflow structure (`then`/`else`/`branches`/`steps`/`loop.do`)
- Builds activity maps using recursive tree traversal (`activity_traversal.py` utilities)
- Handles conditional branching by pre-mapping activities to parent conditions
- Marks SKIPPED activities in untaken branches immediately

**V1 Data Structures Built**:
```python
@dataclass
class ExecutionMonitorMetadata:
    activity_definitions_map: dict[str, dict]  # Recursive traversal of nested tree
    branch_head_map: dict[str, dict]           # Activities -> parent condition mapping
    activity_index_map: dict[str, int]         # Activity names -> list indices
    conditions_handled: set[str]               # Processed condition IDs
```

**V2 Graph Structure Impact**:
- **Flat nodes array** replaces nested activities (no recursive traversal needed)
- **Edges array** explicitly defines relationships (no implicit nesting)
- **Conditional branches** use edges with `when` attribute instead of `then`/`else` fields
- **Parallel branches** use edges with `branch` attribute instead of `branches` array
- **Loop structure** uses edges with `iterate`/`complete` attributes instead of `loop.do` field

**Decision**: Replace nested tree traversal with flat graph operations

**Rationale**:
1. **Simpler lookup**: O(1) array access vs recursive tree traversal
2. **Explicit relationships**: Edges make execution flow clearer than nested structure
3. **Unified approach**: Same graph operations for validation, execution, and monitoring
4. **Remove complexity**: Delete 305-line `activity_traversal.py` utilities module

**V2 Implementation Strategy**:

1. **Create `utils/graph_traversal.py`** (new utilities):
   ```python
   def build_node_map(workflow_def: dict) -> dict[str, dict]:
       """Simple flat array -> dict mapping."""
       return {node["id"]: node for node in workflow_def["nodes"]}

   def build_edge_map(workflow_def: dict) -> dict[str, list[dict]]:
       """Group edges by source node for graph traversal."""
       edge_map = {}
       for edge in workflow_def["edges"]:
           from_id = edge["from"]
           edge_map.setdefault(from_id, []).append(edge)
       return edge_map

   def collect_skipped_nodes_from_condition(
       condition_id: str,
       executed_when: str,  # "true" or "false"
       edge_map: dict,
       node_map: dict
   ) -> list[str]:
       """Follow edges with opposite 'when' to find skipped nodes."""
       # Traverse from condition node following non-executed edges
       # until hitting converge nodes or workflow end
       ...
   ```

2. **Update `ExecutionMonitorMetadata`**:
   ```python
   @dataclass
   class ExecutionMonitorMetadata:
       node_definitions_map: dict[str, dict]    # Flat map: node_id -> node
       edge_map: dict[str, list[dict]]          # Flat map: from_node_id -> edges
       # Remove: activity_index_map (not needed)
       # Remove: branch_head_map (use edge traversal instead)
   ```

3. **Redesign conditional branch handling**:
   - **V1 approach**: Pre-build `branch_head_map` by recursively walking `then`/`else` branches
   - **V2 approach**: When condition completes, follow edges with opposite `when` value
   - **SKIPPED marking**: Traverse skipped edges until converge node, mark all intermediate nodes

4. **Update parallel/loop detection**:
   - **V1**: Check `if hasattr(activity, 'branches')` or `if hasattr(activity, 'loop')`
   - **V2**: Check `if any(edge.get('branch') for edge in edges)` or `if any(edge.get('iterate') for edge in edges)`

**Migration Scope**:
- **Delete**: `src/nexus/workflows/utils/activity_traversal.py` (305 lines, v1 only)
- **Create**: `src/nexus/workflows/utils/graph_traversal.py` (~200 lines, v2 graph utilities)
- **Modify**: `activity_sync_service.py` (~200 lines changed out of 1042)
- **Update**: All tests in `tests/unit/workflows/workflow_engine/services/test_activity_sync_service.py` (use v2 workflows)

**Testing Strategy**:
1. Unit test graph_traversal.py utilities independently
2. Create v2 test workflows covering: sequential, parallel, conditional, nested conditions, loops
3. Verify SKIPPED marking works for untaken condition branches
4. Verify activity syncing for parallel branches with converge
5. Integration test: Real workflow execution with Temporal + activity sync

**Alternatives Considered**:
- **Keep both v1 and v2 utilities**: Rejected - plan states v2 completely replaces v1
- **Convert v2 to v1 internally**: Rejected - defeats purpose of v2 graph structure
- **Dual-mode activity_sync_service**: Rejected - adds complexity, no v1/v2 coexistence

**Risk Assessment**: **HIGH**
- Critical real-time monitoring component (1042 lines)
- Complex conditional branch logic requires careful testing
- Must maintain correct SKIPPED marking for untaken branches
- Affects all workflow executions

**Mitigation**:
- Comprehensive unit tests for graph_traversal utilities before integration
- Incremental migration: Build graph utilities first, then update sync service
- Extensive integration testing with v2 workflows
- Careful review of edge cases (nested conditions, display_only edges, loops with conditions)

---

## Technology Stack Summary

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| JSON Schema Validation | jsonschema (Draft 2020-12) + template preprocessing | Handles inter-parameter dependencies, comprehensive errors, avoids TemplateAwareBaseModel warnings |
| DAG Validation | NetworkX | Cycle detection, reachability analysis, pattern validation - unified with runtime graph library |
| Graph Execution | NetworkX + Temporal | Raw dict storage in graph, topological sort, lightweight traversal, type validation after template resolution |
| Namespace Resolution | Custom resolver | Hierarchical lookup, selective outputs, secret safety, template-to-value resolution at runtime |
| Parallel Execution | Temporal activity groups + asyncio | Built-in error handling, converge synchronization |
| Activity Sync Service | Flat graph operations (graph_traversal.py) | Replace recursive tree traversal with O(1) lookups, explicit edge-based relationships, unified with execution engine |
| Sample Workflows | Manual creation with patterns | Limited scope, quality documentation, pattern examples for common scenarios |

## Best Practices Applied

1. **JSON Schema as Source of Truth**: Schemas drive validation, not code-generated models
2. **Separation of Concerns**: Validation → Models → Execution pipeline
3. **Fail-Fast Validation**: All 30+ rules checked before execution starts
4. **Comprehensive Error Messages**: Validation errors include node ID, field path, rule violated
5. **Template Resolution Safety**: Undefined variables raise clear errors, no silent failures
6. **Secret Sanitization**: Results sanitized before persistence, secrets never logged
7. **Uniform Execution Tracking**: All nodes (including control) create Temporal activities and ActivityExecution records for consistent observability
8. **Async Control Flow**: Control nodes that wait use async exit + internal signaling to avoid Temporal activity timeouts

## Open Questions Resolution

All "NEEDS CLARIFICATION" items from Technical Context are resolved:

✅ Validation strategy: Template preprocessing + jsonschema + NetworkX DAG validation
✅ Execution engine: NetworkX-based topological execution with raw dict storage, Pydantic validation after template resolution
✅ Namespace resolution: Hierarchical resolver with selective outputs, runtime template-to-value resolution
✅ Parallel execution: Temporal activity groups with on_error handling
✅ Sample workflows: Manual creation with documented structural patterns

**Key Architectural Decisions**:
- **Pluggable Graph Backend**: IGraphBackend protocol with InMemoryGraphBackend (basic operations) and NetworkXBackend (advanced validation) - start simple, add complexity when needed
- **Domain Model Separation**: WorkflowGraph and ActivityNode domain objects delegate to backend, isolating graph library concerns
- **Unified Activity Output Structure**: All activities return `{"output": {...}, "control": {...}}` where output is user-facing (subject to mapping) and control is internal routing data (never exposed)
- **Output Mapping in Activities**: apply_output_mapping() called inside activities before returning to Temporal - prevents storing suppressed fields in event history
- **Smart Loop Namespace**: Loop variables stored as `loop.{loop_node_id}.item/index` but users reference `${loop.item}` - auto-resolved by context-aware NamespaceResolver
- **Loop Feedback Edge Removal**: Edges with `to_port="iterate"` create cycles but are safely removed during graph construction - runtime automatically loops back from last node in iterate path
- **Port-Based Routing**: Control flow nodes return `control.next_port` to determine which outgoing edges to follow (condition: true/false, loop: iterate/complete)
- **Implicit Parallelism**: Multiple edges from same port → concurrent downstream execution via asyncio - no dedicated parallel node type needed
- **All nodes as Temporal activities**: Every node (including control) creates Temporal activity and ActivityExecution record for uniform observability

No remaining open questions blocking Phase 1 design.
