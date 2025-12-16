# Research: Context Assembly Implementation

**Feature**: Context Assembly for Multi-Agent System
**Branch**: `017-context-assembler`
**Date**: 2025-12-10
**Updated**: 2025-12-12

## Research Overview

This document consolidates research findings for implementing the AssemblerService as an internal component of the Context Manager system.

## 1. Existing Context Manager Patterns

### Decision
Follow architectural patterns established by CompressorService and RetrieverService within `src/nexus/agent_orchestrator/context_manager/`.

### Rationale
- Maintains consistency across context_manager components
- Proven patterns for dependency injection and error handling
- Existing observability and logging conventions
- Familiar structure for team maintenance

### Key Patterns Identified

**Constructor Injection Pattern** (from compressor.py):
```python
class CompressorService:
    def __init__(self):
        """Initialize the compressor service."""
        # Dependencies injected or initialized here
```

**Correlation ID Tracing** (from planner.py):
```python
logger.info("Starting context planning for correlation_id: %s", correlation_id)
logger.debug("Context planning - Tenant: %s, Query: %s", session_id, query)
```

**Async Method Signatures**:
- Services use async/await for I/O operations
- Methods return typed results (not Optional unless explicitly needed)

### Implementation Notes
- Use standard Python logging module with correlation_id in all log statements
- Follow async pattern for main assembly method
- Inject dependencies via constructor (TokenService, CompressorService)
- Use structured exception handling with specific exception types

## 2. Grounding Score Computation

### Decision
Compute grounding_score as simple average (arithmetic mean) of all RelevantDocument relevancy_score values.

### Rationale
Clarified in Session 2025-12-10:
- Equal weight to all documents
- Simple, deterministic, reproducible
- No complexity of weighted averages
- Easy to test and validate

### Implementation
```python
def compute_grounding_score(documents: list[RelevantDocument]) -> float:
    """Compute grounding score as simple average of relevancy scores."""
    if not documents:
        return 0.0

    valid_scores = [
        doc.relevancy_score
        for doc in documents
        if doc.relevancy_score is not None and 0.0 <= doc.relevancy_score <= 1.0
    ]

    if not valid_scores:
        return 0.0

    return sum(valid_scores) / len(valid_scores)
```

### Edge Cases Handling
- Empty document list → return 0.0
- Documents with None relevancy_score → exclude from average
- Documents with invalid relevancy_score (< 0.0 or > 1.0) → exclude from average
- All documents have invalid scores → return 0.0

### Alternatives Considered
- **Weighted Average by Token Count**: Rejected - adds complexity without clear benefit per clarification session
- **Maximum Score**: Rejected - too optimistic, doesn't represent aggregate quality
- **Minimum Score**: Rejected - too pessimistic, penalizes good documents
- **Harmonic Mean**: Rejected - unnecessary complexity for this use case

## 3. Token Budget Management

### Decision
Implement two-stage validation using TokenService with exception-driven flow.

### Rationale
- Clear separation of concerns (TokenService handles counting)
- Exception-driven flow matches Python idioms
- Enables clean error propagation to planner
- Supports both pre and post-compression validation

### Token Service Interface (Research)
Based on existing context_manager code patterns:
```python
class TokenService:
    def track_usage(self, content: str, max_tokens: int, correlation_id: str) -> None:
        """
        Track token usage and raise TokenLimitExceededError if exceeded.

        Raises:
            TokenLimitExceededError: When content exceeds max_tokens
        """
```

### Implementation Pattern
```python
# Stage 1: Pre-compression validation
try:
    token_service.track_usage(combined_content, max_tokens, correlation_id)
    # No exception = within budget, use original documents
except TokenLimitExceededError:
    # Stage 2: Invoke compression
    compressed = await compressor_service.compress(...)

    # Re-validate after compression
    try:
        token_service.track_usage(compressed, max_tokens, correlation_id)
        # Use compressed content
    except TokenLimitExceededError:
        # Still exceeds = fail with ContextAssemblyError
        raise ContextAssemblyError(
            f"Content exceeds token limit ({max_tokens}) even after compression"
        )
```

### Alternatives Considered
- **Manual token counting**: Rejected - duplicates TokenService responsibility
- **Single validation stage**: Rejected - doesn't support "compress if needed" logic
- **Return success/failure booleans**: Rejected - exception pattern is more Pythonic

## 4. Exception Hierarchy

### Decision
Create `ContextAssemblyError` exception class for assembly-specific failures.

### Rationale
- Clear signal when post-compression validation fails
- Distinguishes assembly errors from token service errors
- Enables specific error handling in planner
- Follows Python exception hierarchy best practices

### Implementation
```python
class ContextAssemblyError(Exception):
    """Raised when context assembly fails due to unrecoverable errors.

    Examples:
        - Token limit exceeded even after compression
        - Invalid input data that cannot be assembled
        - Required services unavailable
    """
    pass
```

### Usage Pattern
```python
# In AssemblerService
if tokens_still_exceed_after_compression:
    raise ContextAssemblyError(
        f"Content exceeds token limit ({max_tokens}) even after compression. "
        f"Original: {original_tokens}, Compressed: {compressed_tokens}"
    )
```

### Alternatives Considered
- **Reuse existing exceptions**: Rejected - lack semantic clarity for assembly failures
- **Return error codes**: Rejected - exceptions are more Pythonic
- **Custom exception with error codes**: Rejected - over-engineering for current needs

## 5. Citation Collection

### Decision
Collect file_id strings from RelevantDocument.file_metadata.file_id attributes. Compression does not generate new file_ids.

### Rationale
- Simple, unambiguous source identification using unique file_id (per 2025-12-12 clarification)
- file_id is unique identifier that avoids ambiguity when filenames repeat
- No complex citation objects needed - just string list
- Complete source traceability through file_id references
- Compression only reduces content size, does not create new files or file_ids

### Expected Citation Format
Based on spec.md clarification (2025-12-12):
```python
# Citations are simple file_id strings from original documents
citations: list[str] = [
    "file-uuid-1",
    "file-uuid-2",
    "file-uuid-3"
]
```

### Implementation Pattern
```python
def extract_citations(
    documents: list[RelevantDocument]
) -> list[str]:
    """Extract file_id values from documents."""
    citations = []

    # Extract file_id from each document's file_metadata
    for doc in documents:
        if doc.file_metadata and doc.file_metadata.file_id:
            citations.append(doc.file_metadata.file_id)

    return citations
```

### Alternatives Considered
- **Complex citation objects with metadata**: Rejected - over-engineering, file_id alone is sufficient
- **Citation deduplication**: Optional - may be added later if needed
- **Filename-based citations**: Rejected - filenames may repeat, file_id is unique
- **Compression-generated citations**: Not applicable - compression doesn't create new files

## 6. Prompt Hierarchy Enforcement

### Decision
Organize payload sections as ordered dict with explicit section ordering: system → context → user.

### Rationale
- LLM consumption requirement from JIRA AAP-58204
- Explicit ordering prevents accidental reordering
- Clear structure for validation
- Matches LLM prompt best practices

### Implementation Pattern
```python
from collections import OrderedDict

def build_payload(
    system_prompts: list[str],
    context_snippets: list[str],
    user_prompts: list[str]
) -> dict[str, Any]:
    """Build payload with enforced hierarchy."""
    payload = OrderedDict()

    # Order matters: system → context → user
    if system_prompts:
        payload["system"] = system_prompts

    if context_snippets:
        payload["context"] = context_snippets

    if user_prompts:
        payload["user"] = user_prompts

    return payload
```

### Validation
```python
def validate_hierarchy(payload: dict) -> bool:
    """Validate payload respects prompt hierarchy."""
    expected_order = ["system", "context", "user"]
    actual_order = [k for k in payload.keys() if k in expected_order]

    # Check order matches expected sequence
    return actual_order == [k for k in expected_order if k in actual_order]
```

### Alternatives Considered
- **List of tuples**: Rejected - less intuitive than dict structure
- **Separate fields (system_content, context_content, user_content)**: Rejected - redundant structure
- **No explicit ordering**: Rejected - risks accidental hierarchy violations

## 7. Observability and Logging

### Decision
Follow existing context_manager logging patterns with correlation_id tracing.

### Rationale
- Consistent with planner.py, compressor.py patterns
- Distributed tracing support via correlation_id
- Debug/info levels appropriate for different scenarios
- Metrics logging for performance monitoring

### Logging Pattern
```python
import logging
logger = logging.getLogger(__name__)

# In AssemblerService methods
logger.info(
    "Starting assembly for correlation_id: %s, documents: %d",
    correlation_id,
    len(documents) if documents else 0
)

logger.debug(
    "Assembly - max_tokens: %d, compression_needed: %s",
    max_tokens,
    compression_needed
)

logger.info(
    "Assembly complete for correlation_id: %s, grounding_score: %.4f",
    correlation_id,
    context_package.grounding_score
)
```

### Alternatives Considered
- **Structured logging (JSON)**: Deferred - maintain consistency with existing patterns
- **Custom logger instance**: Rejected - standard logging module sufficient
- **Metric collection**: Deferred to future enhancement

## 8. Performance Considerations

### Decision
Optimize for typical case (<100ms) while handling edge cases gracefully.

### Rationale
- NFR-002: Must not delay LLM invocation workflow
- Most assemblies won't require compression (within token budget)
- Compression is CPU/network intensive when needed
- Async pattern enables concurrency

### Optimization Strategies
1. **Early Return**: Check document count before validation
2. **Lazy Evaluation**: Only compute grounding score when needed
3. **Async/Await**: Use async for I/O-bound operations (compression)
4. **Minimal Copies**: Avoid unnecessary data copying during assembly

### Performance Targets
- **Typical case (no compression)**: <50ms
- **With compression**: <500ms (depends on CompressorService)
- **Edge case (errors)**: <10ms (fail fast)

### Alternatives Considered
- **Caching**: Deferred - not applicable for unique invocations
- **Parallel processing**: Deferred - single invocation context
- **Pre-compression**: Rejected - defeats purpose of conditional compression

## 9. Architectural Updates (2025-12-12)

### Service Location Decision
**Decision**: Create separate `assembler_service/` directory with `service.py` implementation.

**Rationale**:
- Maintains consistency with other context manager service patterns
- Clear module boundary for assembler functionality
- Follows existing RetrieverService directory structure
- Easier to manage dependencies and imports

**Implementation**:
```
src/nexus/agent_orchestrator/context_manager/
├── assembler_service/
│   ├── __init__.py       # Exports AssemblerService
│   └── service.py         # Implementation
```

### Existing Model Reuse Decision
**Decision**: Use existing RelevantDocument and FileMetadata models (DO NOT recreate).

**Rationale**:
- RelevantDocument already defined in `retriever_service/models/relevant_document.py`
- FileMetadata already defined in `file_manager/__init__.py`
- Avoid duplication and maintain single source of truth
- Models already contain required fields (file_metadata, file_id)

**Implementation Note**:
```python
# In assembler_service/service.py
from nexus.agent_orchestrator.context_manager.retriever_service.models.relevant_document import RelevantDocument
from nexus.agent_orchestrator.context_manager.file_manager import FileMetadata
```

### Citation Source Decision
**Decision**: Extract citations from `RelevantDocument.file_metadata.file_id` attribute.

**Rationale**:
- FileMetadata is already part of RelevantDocument model
- file_id attribute provides unique, unambiguous source identification
- Avoids ambiguity when filenames repeat across different uploads
- No need for separate citation extraction logic
- Aligns with existing data structures

**Implementation Pattern**:
```python
def extract_citations(documents: list[RelevantDocument]) -> list[str]:
    """Extract citations from FileMetadata.file_id."""
    citations = []
    for doc in documents:
        if doc.file_metadata and doc.file_metadata.file_id:
            citations.append(doc.file_metadata.file_id)
    return citations
```

### Compression Retry Loop Decision
**Decision**: Implement progressive compression retry with `compression_loop` parameter controlling maximum attempts.

**Rationale**:
- Spec clarification 2025-12-12: Add compression retry functionality
- Progressive strategies increase chance of fitting within token budget
- configurable loop count provides flexibility (0 = no retries, N = N attempts)
- Each retry uses more aggressive compression strategy

**Implementation Pattern**:
```python
async def assemble_with_retry(
    self,
    documents: list[RelevantDocument],
    max_tokens: int,
    compression_loop: int,
    correlation_id: str
) -> ContextPackage:
    """Assemble with compression retry loop."""
    retry_count = 0
    compressed_content = None

    # Initial compression attempt
    try:
        compressed_content = await self.compressor.compress(documents, strategy_level=0)
        self.token_service.track_usage(compressed_content, max_tokens, correlation_id)
        return self._build_package(compressed_content, compression_retry_count=0)
    except TokenLimitExceededError:
        # Start retry loop
        while retry_count < compression_loop:
            retry_count += 1
            strategy_level = retry_count  # More aggressive each time
            compressed_content = await self.compressor.compress(
                documents, strategy_level=strategy_level
            )
            try:
                self.token_service.track_usage(compressed_content, max_tokens, correlation_id)
                return self._build_package(compressed_content, compression_retry_count=retry_count)
            except TokenLimitExceededError:
                if retry_count >= compression_loop:
                    raise ContextAssemblyError(
                        f"Content exceeds token limit after {retry_count} compression retries"
                    )
                continue  # Try next retry

    raise ContextAssemblyError("Compression retries exhausted")
```

### Scope Clarification Decision
**Decision**: AssemblerService handles ONLY RelevantDocuments assembly - NO System/User Prompt handling.

**Rationale**:
- Spec clarification 2025-12-12: System/User prompts handled elsewhere
- Single Responsibility Principle
- Clear separation of concerns
- Simplifies assembler logic and testing

**Updated Prompt Hierarchy Section**:
Section 6 (Prompt Hierarchy Enforcement) is now DEPRECATED - removed from implementation scope.
AssemblerService focuses solely on organizing document content from RelevantDocuments.

## Research Completion Checklist

- [x] Existing patterns reviewed (CompressorService, RetrieverService, planner)
- [x] Grounding score computation clarified (simple average)
- [x] Token budget management pattern defined (two-stage validation)
- [x] Exception hierarchy designed (ContextAssemblyError)
- [x] Citation collection approach documented
- [x] ~~Prompt hierarchy enforcement approach determined~~ (DEPRECATED - out of scope)
- [x] Observability and logging patterns established
- [x] Performance considerations documented
- [x] Service location structure defined (assembler_service/ directory)
- [x] Existing model reuse validated (RelevantDocument, FileMetadata)
- [x] Citation source determined (FileMetadata.file_id for unambiguous identification)
- [x] Compression retry loop designed (compression_loop parameter)
- [x] Scope clarification documented (no System/User Prompt handling)

## References

- Feature Specification: `specs/021-context-assembly/spec.md`
- Clarification Session: 2025-12-10
- Architectural Updates: 2025-12-12
- Existing Code: `src/nexus/agent_orchestrator/context_manager/`
- Constitution: `.specify/memory/constitution.md` v1.2.0
- JIRA: AAP-58204

---
*Research completed: 2025-12-10*
*Updated: 2025-12-12*
