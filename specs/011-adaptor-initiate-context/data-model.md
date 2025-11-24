# Data Model: Invocation Context Integration

**Date**: November 13, 2025
**Status**: Complete

## Primary Entities

### Enhanced Invocation Response

The enhanced invocation response extends the existing `Invocation` model result field with context metadata without breaking existing API contracts.

**Existing Result Structure**:
```python
# Current invocation.result field
{
    "type": "answer",
    "content": "LLM generated response",
    "response_metadata": {...}
}
```

**Enhanced Result Structure**:
```python
# Enhanced invocation.result field with context enhancement
{
    "type": "answer",
    "content": "Context-enriched LLM response",
    "response_metadata": {...},
    "correlation_id": "workflow-correlation-123",  # Optional
    "grounding_score": 0.85,  # Optional
    "context_enhancement": {  # Optional
        "turn_id": "context-turn-uuid",
        "citations": [...],
        "context_applied": true
    }
}
```

**Field Definitions**:
- `correlation_id` (str, optional): Correlation identifier for distributed tracing and debugging - preserves workflow correlation or falls back to invocation ID
- `grounding_score` (float, optional): Score between 0.0-1.0 indicating quality/relevance of contextual information
- `context_enhancement` (dict, optional): Additional context-related information including package ID and citations

**Validation Rules**:
- `correlation_id`: String identifier when present (typically UUID4 format)
- `grounding_score`: Between 0.0 and 1.0 inclusive when present
- `context_enhancement`: Dict with optional keys, no required fields
- All new fields are optional to maintain backward compatibility
- Existing required fields (`type`, `content`) remain unchanged

### Context Package (Existing)

The feature leverages the existing `ContextPackage` SQLModel from the Context Manager scaffolding without modifications.

**Structure** (from existing implementation):
```python
class ContextPackage(SQLModel):
    id: str  # UUID4
    correlation_id: str  # Correlation identifier from workflow or invocation
    payload: dict[str, Any]  # Context data to append to prompt
    grounding_score: float  # 0.0-1.0 relevance score
    citations: list[dict[str, Any]]  # Source citations
    package_metadata: dict[str, Any]  # Includes timing, session_id, query info
```

**Usage in Integration**:
- `payload`: Formatted and appended to user prompt before LLM processing
- `grounding_score`: Included in enhanced invocation response
- `correlation_id`: Used directly for distributed tracing in response
- `citations`: Included in enhanced response context_enhancement

## Data Flow

### Context Enhancement Workflow

```
1. User Request → Invocation Created
   ↓
2. InvocationService._execute_invocation() called
   ↓
3. ContextManagerPlanner.plan_request() → ContextPackage
   ↓
4. format_context_prompt(original_prompt, context_payload) → enriched_prompt
   ↓
5. GenericAgent.execute(enriched_prompt) → LLM Response
   ↓
6. enhance_result_with_context(response, context_package) → Enhanced Result
   ↓
7. Invocation.result = enhanced_result → Stored & Returned
```

### Data State Transitions

**Invocation Status Flow** (unchanged):
1. `CREATED` → `RUNNING` → `COMPLETED`/`FAILED`

**Context Integration States**:
1. **No Context**: Context Manager not called (fallback scenario)
2. **Context Retrieved**: ContextPackage created successfully
3. **Context Applied**: Prompt enhanced with context payload
4. **Context Failed**: Error in context processing, original prompt used

## Relationships

### Service Dependencies

- **InvocationService** → **ContextManagerPlanner**: Calls plan_request() for context
- **InvocationService** → **GenericAgent**: Executes with enriched prompt
- **ContextPackage** → **Enhanced Response**: Data flows from context to response metadata

### Data Dependencies

- `invocation.context_data["correlation_id"]` used as `correlation_id` in Context Manager (falls back to `invocation.id`)
- `invocation.session_id` used as `session_id` in Context Manager
- `context_package.correlation_id` becomes `response.correlation_id`
- `context_package.grounding_score` becomes `response.grounding_score`

## Integration Patterns

### Prompt Enhancement Format

**Strategy**: Structured context appending with clear delimiters

```
{original_user_prompt}

--- CONTEXT ---
{formatted_context_payload}
--- END CONTEXT ---
```

**Context Formatting Function**:
```python
def format_context_for_prompt(payload: dict[str, Any]) -> str:
    """Format context payload for LLM consumption."""
    if not payload:
        return ""

    sections = []
    for key, value in payload.items():
        sections.append(f"## {key}\n{value}")

    return "\n\n".join(sections)
```

### Error Handling Data Flow

**Context Manager Success**:
```
InvocationService → ContextManager → ContextPackage → Enhanced Result
```

**Context Manager Failure**:
```
InvocationService → ContextManager (fails) → Original Prompt → Standard Result
```

**Result Structure on Error**:
```python
# When context fails, result remains unchanged
{
    "type": "answer",
    "content": "Standard LLM response",
    "response_metadata": {...}
    # No correlation_id, grounding_score, or context_enhancement added
}
```

## Validation Strategy

### Input Validation

- **Existing validation**: Leverages current `InvocationCreateRequest` validation
- **No new fields**: Feature doesn't add new request parameters
- **Context parameters**: Validated by existing ContextManagerPlanner

### Output Validation

- **Response structure**: Maintains existing Invocation model validation
- **Optional fields**: New metadata fields are optional, no breaking changes
- **Type safety**: All new fields follow SQLModel type constraints

### Error Scenarios

- **Context Manager unavailable**: Fallback to original prompt processing
- **Context retrieval timeout**: Proceed with original prompt after timeout
- **Invalid context data**: Log error, proceed with original prompt
- **Prompt formatting failure**: Fallback to original prompt

## Future Considerations

### Schema Evolution

- **Backward compatibility**: All changes are additive and optional
- **Version management**: No API version changes required
- **Migration path**: Existing clients automatically compatible

### Performance Optimization

- **Context caching**: Future optimization for repeated similar prompts
- **Async processing**: Potential for asynchronous context retrieval
- **Selective enhancement**: Configurable context application based on prompt type

### Monitoring and Observability

- **Metrics collection**: Track context success/failure rates, processing times
- **Structured logging**: Context operations logged with correlation IDs
- **Performance monitoring**: Track impact on overall invocation latency
