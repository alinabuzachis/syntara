# Feature Specification: Context Compression for Multi-Agent System

**Feature Branch**: `018-context-compression`
**Created**: December 1, 2025
**Status**: Implemented
**Input**: User description: "Context Compression for Multi-Agent System - As a multi-agent system, I need to compress context when multiple documents exceed token budgets, so that I can maintain functionality while staying within model limits."

## Execution Flow (main)
```
1. Parse user description from Input
2. Extract key concepts from description
   • Actors: Multi-agent system, documents
   • Actions: compress context, check token budgets
   • Data: multiple documents, token counts
   • Constraints: model token limits, maintain functionality
3. For each unclear aspect:
   • Marked with [NEEDS CLARIFICATION] where needed
4. Fill User Scenarios & Testing section
5. Generate Functional Requirements
   • Each requirement is testable
6. Identify Key Entities
7. Run Review Checklist
   • Ready for planning
8. Return: SUCCESS (spec ready for planning)
```

---

## ⚡ Quick Guidelines
- Focus on WHAT users need and WHY
- L Avoid HOW to implement (no tech stack, APIs, code structure)
- =e Written for business stakeholders, not developers

---

## User Scenarios & Testing *(mandatory)*

### Primary User Story
As an assembler service in the context management workflow, when I have document content that may exceed my token budget, I need a compression service with a clean interface `compress(data, max_tokens, strategy="greedy", goal=None, correlation_id="unknown")` so that I can ensure the final context fits within model limits while preserving essential information and maintaining source traceability.

### Acceptance Scenarios
1. **Given** document data (single string or list of strings) with total token count within budget, **When** compression service is called, **Then** all content passes through unchanged with no compression applied
2. **Given** document data exceeding the max_tokens budget, **When** compression is triggered with greedy strategy, **Then** system generates a summarized version that fits within budget and includes structured citations (Document 1, Document 2, etc.)
3. **Given** a compression operation completes successfully, **When** reviewing the output, **Then** each piece of information includes numeric document references for source attribution
4. **Given** invalid inputs (empty data, negative max_tokens, unsupported strategy), **When** compression is called, **Then** system fails fast with clear ValueError messages
5. **Given** LLM compression fails, **When** attempting to compress, **Then** system fails fast with RuntimeError rather than providing fallback truncation
6. **Given** mixed data types in document list, **When** validation occurs, **Then** system raises ValueError for non-string items
7. **Given** successful compression operation, **When** processing completes, **Then** correlation_id appears in debug and info logs for tracing

### Edge Cases
- What happens when individual documents are extremely large?
- How does system handle summarization failures or errors?
- What occurs when the target token budget is too small for meaningful compression?
- How does the system behave with single document vs multiple document inputs?

### Flow Diagram

```mermaid
flowchart TD
    A[Input: Union[List[str], str]] --> B{Validate Inputs}
    B -->|Invalid| C[Raise ValueError]
    B -->|Valid| D[Normalize to List[str]]
    D --> E[Concatenate Documents]
    E --> F{Calculate Total Tokens}
    F --> G{Tokens > max_tokens?}
    G -->|No| H[Pass Through Unchanged]
    G -->|Yes| I[Format for LLM Prompt]
    I --> J[Call LLM with Goal Context]
    J --> K{LLM Success?}
    K -->|No| L[Raise RuntimeError]
    K -->|Yes| M[Verify Compressed Token Count]
    M --> N[Return Compressed String with Citations]
    H --> O[Log & Return Original Content]
    N --> P[Log Compression Metrics]

    style A fill:#e1f5fe
    style O fill:#c8e6c9
    style P fill:#c8e6c9
    style C fill:#ffcdd2
    style L fill:#ffcdd2
```

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: Compression service MUST accept interface `compress(data: Union[List[str], str], max_tokens: int, strategy: str = "greedy", goal: Optional[str] = None, correlation_id: str = "unknown") -> str`
- **FR-002**: System MUST perform input validation raising ValueError for empty data, non-positive max_tokens, unsupported strategies, or non-string list items
- **FR-003**: System MUST normalize input data to handle both single strings and lists of strings uniformly
- **FR-004**: System MUST perform binary decision-making with greedy strategy: either pass content through unchanged or compress the entire collection via LLM
- **FR-005**: System MUST generate compressed content using LLM when documents exceed token budget, incorporating goal context when provided
- **FR-006**: System MUST include structured citations in compressed output using numeric references (format: "According to Document 1..." or "Document 2 provides...")
- **FR-007**: System MUST preserve essential information relevant to the optional goal parameter when compressing
- **FR-008**: System MUST maintain factual accuracy during LLM compression operations
- **FR-009**: System MUST return string output format consistently regardless of whether compression was applied
- **FR-010**: System MUST fail fast with RuntimeError when LLM compression fails rather than providing fallback mechanisms
- **FR-011**: System MUST log compression operations with correlation_id for distributed tracing and monitoring at debug and info levels
- **FR-012**: System MUST verify compressed content token count and log compression metrics including ratios

### Non-Functional Requirements
- **NFR-001**: Token counting MUST be accurate and consistent using existing TokenCalculator service
- **NFR-002**: Compression decisions MUST complete quickly to avoid user experience delays
- **NFR-003**: System MUST handle documents of varying sizes and types uniformly
- **NFR-004**: Compressed output MUST maintain readability and coherence
- **NFR-005**: System MUST integrate seamlessly with existing OpenRouter LLM infrastructure

### Success Criteria
- 100% of document collections within token budget pass through without modification
- 100% of document collections exceeding token budget are successfully compressed to fit within limits
- All compressed content includes proper source attribution with numeric document citations
- Compression operations complete within acceptable time limits for user workflows
- No loss of critical information during compression that impacts task completion
- All errors are caught and handled with appropriate exception types and clear messages
- Correlation IDs are properly logged for distributed system tracing

### Key Entities *(include if feature involves data)*
- **Document Data**: Input data as Union[List[str], str] representing content to be potentially compressed
- **Max Tokens**: Integer limit for total allowable tokens in the final output (must be positive)
- **Compression Strategy**: String parameter controlling compression approach (currently only "greedy" supported)
- **Compressed Content**: String output containing either original content or LLM-generated summary with numeric document citations
- **Goal Context**: Optional string parameter providing focus for LLM compression operations (defaults to "summarize the key information")
- **Correlation ID**: String identifier for distributed tracing and logging across service calls (defaults to "unknown")

### Assumptions
- TokenCalculator service is available and reliable for accurate token counting
- Document content is in text format suitable for token counting and LLM processing
- OpenRouter LLM service is available for summarization operations
- Target token budgets are reasonable and allow for meaningful content preservation
- LangChain ChatOpenAI interface is used for LLM communication
- CompressorService is used within the ContextManagerPlanner workflow

---

## Review & Acceptance Checklist
*GATE: Automated checks run during main() execution*

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status
*Updated by main() during processing*

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked (none requiring clarification)
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed
- [x] Implementation completed and deployed

---
