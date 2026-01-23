# Data Model: Context Manager MVP Planner Scaffolding

**Date**: November 12, 2025
**Status**: Complete (Retrospective)

## Primary Entities

### ContextPackage (SQLModel)

Central data model representing a unit of context being processed through the orchestration workflow.

**Fields**:
- `id: str` - Unique identifier generated via UUID4
- `correlation_id: str` - Correlation identifier for distributed tracing and cross-service correlation
- `invocation_id: UUID | None` - Foreign key reference to the agent invocation that requested this context
- `payload: dict[str, Any]` - Assembled context sections and content
- `grounding_score: float` - Coverage score (0.0-1.0) indicating the degree of factual accuracy and the reduction of hallucinations
- `citations: list[dict[str, Any]]` - Source citations for content traceability
- `package_metadata: dict[str, Any]` - Timing, token counts, tenant info

**Validation Rules**:
- `grounding_score` must be between 0.0 and 1.0 (inclusive)
- `id` auto-generated with UUID4 if not provided
- `payload` defaults to empty dict
- `citations` defaults to empty list
- `package_metadata` defaults to empty dict

**State Transitions**:
1. **Created** - Initial package creation with correlation_id
2. **Retrieved** - After retrieval service processing (payload populated)
3. **Compressed** - After compression service processing (payload optimized)
4. **Assembled** - Final package ready for consumption (metadata complete)

### Configuration Data Structure

Hardcoded configuration values for MVP scaffolding (non-SQLModel).

**Categories**:
- **Grounding**: `required_grounding_score`, `minimum_grounding_score`
- **Tokens**: `max_total_tokens`, `max_context_tokens`, `max_system_tokens`, `max_user_tokens`
- **Retrieval**: `default_k`, `enable_hybrid_search`, `semantic_weight`, `lexical_weight`
- **Compression**: `compression_mode`, `max_snippets_per_doc`, `snippet_min_length`, `snippet_max_length`
- **Assembly**: `enforce_hierarchy`, `priority_order`, `include_citations`
- **Performance**: `request_timeout_seconds`, `max_concurrent_requests`

**Access Pattern**:
- Centralized in `base.py` module
- Immutable defaults (copied, not referenced)
- Specific getters for commonly used values

## Service Interfaces

### RetrieverService Interface

**Input**: `correlation_id: str`, `session_id: str`, `query: str`
**Output**: `dict[str, Any]` (retrieved content data)
**Purpose**: Find and retrieve relevant documents/content

### CompressorService Interface

**Input**: `retrieved_data: dict[str, Any]`, `correlation_id: str`
**Output**: `dict[str, Any]` (compressed content data)
**Purpose**: Reduce content size to fit token budgets

### AssemblerService Interface

**Input**: `compressed_data: dict[str, Any]`, `correlation_id: str`
**Output**: `dict[str, Any]` (final assembled content)
**Purpose**: Create final context package structure

## Data Flow

```
1. Initial Request → ContextPackage(correlation_id, empty payload)
2. Retrieve Phase → ContextPackage(payload=retrieved_data)
3. Compress Phase → ContextPackage(payload=compressed_data)
4. Assemble Phase → ContextPackage(payload=final_data, metadata=timing_info)
```

## Relationships

### Service Composition
- **ContextManagerPlanner** composes all three services
- **Services** are independent (no direct dependencies between services)
- **ContextPackage** flows through all services sequentially

### Data Dependencies
- Each service receives the output of the previous service
- **correlation_id** propagated through entire workflow for distributed tracing
- **timing metadata** collected at orchestration level
- **error handling** maintains data consistency

## Validation Strategy

### Input Validation
- SQLModel automatic validation for ContextPackage fields
- Service interface type hints for method parameters
- Configuration value validation via getter functions

### Output Validation
- Service output validation via type hints and documentation
- ContextPackage field validation on final assembly
- Metadata structure validation for timing and correlation data

### Error Handling
- Invalid data results in logged errors (not exceptions)
- Partial failures continue workflow with warning logs
- Complete failures return error status with correlation ID

## Future Considerations

### Schema Evolution
- SQLModel compatibility maintained for future database persistence
- Configuration structure prepared for YAML-based configuration
- Service interfaces designed for easy extension and modification

### Performance Optimization
- Data structure optimized for in-memory processing
- Minimal data copying between services
- Metadata collection designed for low overhead

### Integration Points
- ContextPackage ready for FastAPI serialization
- Service interfaces prepared for dependency injection frameworks
- Configuration structure aligned with external config management
