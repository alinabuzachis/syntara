# Research Phase: Invocation Context Integration

**Date**: November 13, 2025
**Status**: Complete

## Research Questions

### 1. Integration Pattern for Context Manager and Invocation Service

**Decision**: Service composition with dependency injection in InvocationService._execute_invocation()

**Rationale**:
- Maintains single responsibility principle - InvocationService orchestrates, ContextManager provides context
- Enables easy testing through service mocking and dependency injection
- Preserves existing API contracts and error handling patterns
- Allows graceful fallback when context system fails
- Follows existing patterns in the Nexus codebase for service composition

**Alternatives considered**:
- Event-driven integration: Rejected due to complexity and existing synchronous flow
- Middleware approach: Rejected as it would require FastAPI middleware changes affecting all endpoints
- Direct import in API layer: Rejected due to violation of separation of concerns

### 2. Prompt Enhancement Strategy

**Decision**: Structured context appending with clear delimiters

**Rationale**:
- Provides LLM with clear structure to understand context vs. original query
- Maintains readability for debugging and troubleshooting
- Allows for different context types (documents, data, metadata) to be organized
- Enables future optimization of context formatting based on LLM performance
- Preserves original user prompt for audit and fallback scenarios

**Alternatives considered**:
- JSON payload injection: Rejected as most LLMs perform better with natural language context
- System message modification: Rejected due to potential conflicts with existing GenericAgent prompting
- Context-first approach: Rejected as user prompt should remain primary focus

### 3. Response Enhancement Pattern

**Decision**: Extend existing `invocation.result` dict with additional metadata fields

**Rationale**:
- Maintains backward compatibility - existing fields unchanged
- Follows existing pattern of storing enhanced data in result field
- Enables optional consumption of metadata by clients
- Supports future extension with additional context-related fields
- Preserves existing response serialization and API contracts

**Alternatives considered**:
- New response wrapper: Rejected as it would break existing API contracts
- Separate metadata endpoint: Rejected due to complexity and performance concerns
- Response headers: Rejected as metadata is too complex for headers

### 4. Error Handling Strategy for Context Integration

**Decision**: Graceful degradation with structured logging

**Rationale**:
- Ensures user requests succeed even when context system has issues
- Provides observability through structured logs for debugging
- Maintains service availability and user experience
- Enables gradual rollout and monitoring of context feature
- Follows existing error handling patterns in InvocationService

**Alternatives considered**:
- Fail-fast approach: Rejected as it would impact service availability
- Context retries: Rejected due to performance impact and complexity
- Circuit breaker: Considered but deemed unnecessary for MVP integration

### 5. Testing Strategy for Integration

**Decision**: Comprehensive unit and integration testing with service mocking

**Rationale**:
- Enables testing of integration logic independently from Context Manager implementation
- Provides confidence in error handling and fallback scenarios
- Supports TDD approach required by project constitution
- Validates end-to-end flow from API request to enhanced response
- Ensures backward compatibility is maintained

**Alternatives considered**:
- Integration testing only: Rejected as insufficient for testing error scenarios
- Mock-free testing: Rejected due to dependencies on Context Manager scaffolding state
- Manual testing approach: Rejected due to constitutional requirements for automated testing

## Implementation Decisions

### Context Manager Integration Points

**Import Strategy**:
```python
from nexus.agent_orchestrator.context_manager import ContextManagerPlanner
```

**Instantiation Pattern**:
```python
# In InvocationService._execute_invocation()
context_planner = ContextManagerPlanner()
context_package = context_planner.plan_request(
    run_id=str(invocation.id),
    session_id=invocation.session_id,
    query=invocation.prompt
)
```

**Error Handling Pattern**:
```python
try:
    # Context Manager integration
    context_package = context_planner.plan_request(...)
    enriched_prompt = format_context_prompt(invocation.prompt, context_package.payload)
except Exception as e:
    logger.warning("Context Manager failed, proceeding with original prompt", exc_info=e)
    enriched_prompt = invocation.prompt
    context_package = None
```

### Response Enhancement Implementation

**Result Enhancement**:
```python
result_dict = response.model_dump(by_alias=True)
if context_package:
    result_dict.update({
        "correlation_id": context_package.package_metadata.get("correlation_id"),
        "grounding_score": context_package.grounding_score,
    })
invocation.result = result_dict
```

### Dependencies and Prerequisites

**Required Imports**:
- ContextManagerPlanner from existing scaffolding
- No additional external dependencies required
- Leverages existing SQLModel, FastAPI, and logging infrastructure

**Context Manager Availability**:
- Requires PR #162 (Context Manager scaffolding) to be merged
- All ContextManagerPlanner functionality available and tested
- ContextPackage model provides required fields (id, payload, grounding_score, package_metadata)

## Performance Considerations

### Impact Analysis

**Additional Latency**:
- Context Manager processing adds overhead to invocation requests
- Exact timing to be measured by performance team during implementation
- Async context processing could be considered for future optimization

**Memory Impact**:
- Context payload stored in invocation result increases memory usage
- Structured logging of context operations adds minimal overhead
- No significant impact on existing invocation throughput expected

**Scalability Factors**:
- Context Manager designed to handle production-level request volumes
- Integration adds minimal computational overhead to InvocationService
- Error handling ensures degraded performance doesn't cascade failures

This research validates the technical approach for integrating Context Manager with the invocation API while maintaining system reliability, performance, and constitutional compliance.
