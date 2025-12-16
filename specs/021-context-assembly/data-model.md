# Data Model: Context Assembly

**Feature**: Context Assembly for Multi-Agent System
**Branch**: `017-context-assembler`
**Date**: 2025-12-10
**Updated**: 2025-12-12

## Overview

This document defines the data models, entities, and interfaces for the AssemblerService component (located in `assembler_service/service.py`). The service transforms RelevantDocuments from the existing retriever model into ContextPackage objects with citations from FileMetadata.file_id, grounding scores, and compression retry support.

**Architectural Updates (2025-12-12)**:
- Service location: `src/nexus/agent_orchestrator/context_manager/assembler_service/`
- Uses existing RelevantDocument model (DO NOT recreate)
- Uses existing FileMetadata model for citations
- Implements compression retry loop with compression_loop parameter
- Scope: Document assembly only (NO System/User Prompt handling)

## Primary Entities

### 1. ContextPackage (Output Model)

**Location**: `src/nexus/agent_orchestrator/context_manager/models.py` (already exists)

**Purpose**: Final assembled context package delivered to LLM for consumption (in-memory only, not persisted to database)

**Pydantic Schema**:
```python
from typing import Any
from uuid import UUID, uuid4
from pydantic import BaseModel, Field

class ContextPackage(BaseModel):
    """Context package returned by the Context Manager.

    Represents the final assembled context with all metadata
    and grounding information for LLM consumption.

    Note: This is an in-memory model only. Context packages are
    ephemeral and rebuilt on demand, not persisted to database.
    """

    id: str = Field(
        default_factory=lambda: str(uuid4()),
        description="Unique identifier for this context package",
    )
    correlation_id: str = Field(
        ...,
        description="Correlation identifier for distributed tracing",
    )
    invocation_id: UUID | None = Field(
        default=None,
        description="Reference to the agent invocation ID",
    )
    payload: dict[str, Any] = Field(
        default_factory=dict,
        description="Assembled document content from RelevantDocuments",
    )
    grounding_score: float = Field(
        default=0.0,
        description="Simple average of relevancy_score from RelevantDocuments",
        ge=0.0,
        le=1.0,
    )
    citations: list[str] = Field(
        default_factory=list,
        description="File IDs extracted from RelevantDocument.file_metadata.file_id attributes",
    )
    package_metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Timing, token counts, session_id, compression status, compression_retry_count",
    )
```

**Validation Rules**:
- `grounding_score` must be in range [0.0, 1.0]
- `correlation_id` is required
- `payload` contains assembled document content (NO System/User Prompt hierarchy)
- `package_metadata` must include: `original_token_count`, `final_token_count`, `compression_applied`, `compression_retry_count`, `session_id`

**State Transitions**: N/A (immutable after creation, exists only in memory)

**Relationships**:
- References invocation ID via `invocation_id` (in-memory reference only, not a foreign key)
- No child entities
- Not persisted to database

### 2. RelevantDocument (Input Model - EXISTING, DO NOT RECREATE)

**Location**: `src/nexus/agent_orchestrator/context_manager/retriever_service/models/relevant_document.py` (existing)

**Purpose**: Input document from RetrieverService containing content and relevancy metadata

**IMPORTANT**: This model ALREADY EXISTS - import and use, do not recreate!

**Import Statement**:
```python
from nexus.agent_orchestrator.context_manager.retriever_service.models.relevant_document import RelevantDocument
```

**Expected Structure** (already defined):
```python
from sqlmodel import SQLModel, Field

class RelevantDocument(SQLModel):
    """Document retrieved by RetrieverService with relevancy scoring."""

    document_id: str | None
    content: str
    relevancy_score: float  # Range: 0.0-1.0
    source_type: str
    retrieval_metadata: dict[str, Any]
    file_metadata: FileMetadata | None  # References FileMetadata model
```

**Usage in Assembly**:
- `relevancy_score` → averaged to compute `grounding_score`
- `file_metadata.file_id` → extracted for citations (see FileMetadata below)
- `content` → merged into payload

### 3. FileMetadata (Citation Source - EXISTING, DO NOT RECREATE)

**Location**: `src/nexus/agent_orchestrator/context_manager/file_manager/__init__.py` (existing)

**Purpose**: File metadata providing file_id for unambiguous citation attribution

**IMPORTANT**: This model ALREADY EXISTS - import and use, do not recreate!

**Import Statement**:
```python
from nexus.agent_orchestrator.context_manager.file_manager import FileMetadata
```

**Expected Structure** (already defined):
```python
class FileMetadata(SQLModel):
    """Metadata for uploaded files."""

    file_id: str  # USED FOR CITATIONS (unique identifier)
    filename: str
    size_bytes: int
    mime_type: str
    file_path: str
    status: str
    # Additional fields...
```

**Usage in Assembly**:
- `file_id` → primary source for citation strings in ContextPackage.citations (unique, unambiguous identifier)
- Accessed via `RelevantDocument.file_metadata.file_id`
- No ambiguity when filenames repeat across different uploads

### 4. ContextAssemblyError (Exception)

**Location**: `src/nexus/agent_orchestrator/context_manager/assembler_service/service.py` (new)

**Purpose**: Signal assembly failures when all compression retries are exhausted

**Implementation**:
```python
class ContextAssemblyError(Exception):
    """Raised when context assembly fails due to unrecoverable errors.

    This exception indicates that the assembly process cannot continue,
    typically due to token limits being exceeded even after all compression
    retry attempts are exhausted, or other validation failures.

    Examples:
        - Token limit exceeded after all compression_loop retries exhausted
        - Invalid or corrupted input documents
        - Required services unavailable
        - Malformed payload structure

    Attributes:
        message: Human-readable error description
        correlation_id: Correlation ID for tracing (if available)
        retry_count: Number of compression retries attempted (if applicable)
        original_exception: Underlying exception (if applicable)
    """

    def __init__(
        self,
        message: str,
        correlation_id: str | None = None,
        retry_count: int | None = None,
        original_exception: Exception | None = None,
    ):
        """Initialize ContextAssemblyError.

        Args:
            message: Error description
            correlation_id: Optional correlation ID for tracing
            retry_count: Optional number of retries attempted
            original_exception: Optional underlying exception
        """
        super().__init__(message)
        self.correlation_id = correlation_id
        self.retry_count = retry_count
        self.original_exception = original_exception
```

**Usage Examples**:
```python
# Post-retry token limit violation (Updated 2025-12-12)
raise ContextAssemblyError(
    f"Content exceeds token limit ({max_tokens}) after {retry_count} compression retries",
    correlation_id=correlation_id,
    retry_count=retry_count,
)

# compression_loop=0 case
raise ContextAssemblyError(
    f"Content exceeds token limit with no retries allowed (compression_loop=0)",
    correlation_id=correlation_id,
    retry_count=0,
)

# Invalid input validation
raise ContextAssemblyError(
    "Cannot assemble context from empty or null documents",
    correlation_id=correlation_id,
)
```

## Supporting Models

### 5. AssemblerService (Service Class)

**Location**: `src/nexus/agent_orchestrator/context_manager/assembler_service/service.py` (new directory)

**Purpose**: Core service implementing assembly logic with compression retry loop

**Class Structure** (Updated 2025-12-12):
```python
import logging
from typing import Any

logger = logging.getLogger(__name__)

class AssemblerService:
    """Service for assembling final context packages from retrieved documents.

    Coordinates token validation, compression retry loop with progressive
    strategies, grounding score computation, citation extraction from
    FileMetadata.file_id, and document content organization.

    Updated 2025-12-12:
    - Added compression_loop parameter for retry control
    - Citations from FileMetadata.file_id (unique identifier, avoids ambiguity)
    - NO System/User Prompt handling (out of scope)
    """

    def __init__(
        self,
        token_service: "TokenService",
        compressor_service: "CompressorService",
    ) -> None:
        """Initialize assembler with injected dependencies.

        Args:
            token_service: Service for token counting and limit validation
            compressor_service: Service for content compression with multiple strategies
        """
        self.token_service = token_service
        self.compressor_service = compressor_service

    async def assemble(
        self,
        documents: list["RelevantDocument"] | None,
        correlation_id: str,
        max_tokens: int,
        compression_loop: int,
        invocation_id: UUID | None = None,
    ) -> "ContextPackage":
        """Assemble RelevantDocuments into ContextPackage with retry loop.

        Implements compression retry with progressive strategies:
        1. Validate original documents - compress if exceeded
        2. Retry with increasingly aggressive strategies up to compression_loop limit
        3. Validate after each retry - reject if all retries exhausted

        Args:
            documents: Retrieved documents from RetrieverService (existing model)
            correlation_id: Correlation ID for distributed tracing
            max_tokens: Maximum allowable tokens for assembled content
            compression_loop: Maximum number of compression retry attempts (0 = no retries)
            invocation_id: Optional invocation ID for foreign key reference

        Returns:
            ContextPackage with assembled document content, grounding score,
            citations from FileMetadata.file_id, and package metadata

        Raises:
            ContextAssemblyError: When token limits exceeded after all compression
                retries exhausted or other unrecoverable assembly failures
        """
        ...

    def _compute_grounding_score(
        self,
        documents: list["RelevantDocument"]
    ) -> float:
        """Compute grounding score as simple average of relevancy scores."""
        ...

    def _extract_citations(
        self,
        documents: list["RelevantDocument"],
    ) -> list[str]:
        """Extract file_id values from RelevantDocument.file_metadata.file_id attributes.

        Updated 2025-12-12: Citations are simply file_id strings from original documents.
        Compression does not generate new file_ids.
        """
        ...

    def _build_payload(
        self,
        documents: list["RelevantDocument"],
        compression_applied: bool,
    ) -> dict[str, Any]:
        """Build payload with assembled document content.

        Updated 2025-12-12: NO System/User Prompt handling (out of scope)
        """
        ...

    def _compress_with_retry(
        self,
        documents: list["RelevantDocument"],
        max_tokens: int,
        compression_loop: int,
        correlation_id: str,
    ) -> tuple[Any, int]:
        """Attempt compression with progressive retry loop.

        Returns:
            Tuple of (compressed_content, retry_count)

        Raises:
            ContextAssemblyError: When all retries exhausted
        """
        ...
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Input: list[RelevantDocument] | None                             │
│   - document_id, content, relevancy_score, source_metadata       │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
       ┌───────────────┐
       │ Token Service │ ← Check token usage (Stage 1)
       │  Validation   │
       └───────┬───────┘
               │
               ├─ Within Budget ──────────┐
               │                          │
               ├─ Exceeds Budget          │
               │         ▼                │
               │  ┌──────────────┐        │
               │  │ Compressor   │        │
               │  │   Service    │        │
               │  └──────┬───────┘        │
               │         │                │
               │         ▼                │
               │  ┌──────────────┐        │
               │  │ Token Service│        │
               │  │  Validation  │ ← Check again (Stage 2)
               │  │  (Stage 2)   │        │
               │  └──────┬───────┘        │
               │         │                │
               │         ├─ Still Exceeds │
               │         │      ▼         │
               │         │  [REJECT]      │
               │         │   Context      │
               │         │  Assembly      │
               │         │    Error       │
               │         │                │
               │         └─ Now OK        │
               │                 ▼        │
               └────────────────┬─────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   Assembly Process    │
                    │                       │
                    │ 1. Compute Grounding  │ ← Simple average of relevancy_scores
                    │    Score              │
                    │                       │
                    │ 2. Extract Citations  │ ← From document file_metadata.file_id
                    │                       │
                    │                       │
                    │ 3. Build Payload      │ ← Enforce system→context→user
                    │                       │
                    │ 4. Populate Metadata  │ ← Timing, tokens, session_id
                    │                       │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   ContextPackage      │
                    │                       │
                    │ - id, correlation_id  │
                    │ - payload (ordered)   │
                    │ - grounding_score     │
                    │ - citations           │
                    │ - package_metadata    │
                    └───────────────────────┘
```

## Validation Rules

### ContextPackage Validation

1. **Required Fields**:
   - `id` - auto-generated UUID
   - `correlation_id` - must be provided
   - `payload` - can be empty dict but must exist
   - `grounding_score` - default 0.0
   - `citations` - default empty list
   - `package_metadata` - default empty dict

2. **Field Constraints**:
   - `grounding_score`: 0.0 ≤ score ≤ 1.0
   - `invocation_id`: Must be valid UUID if provided
   - `payload`: Must follow hierarchy order if sections present

3. **Metadata Requirements**:
   ```python
   package_metadata = {
       "session_id": str,  # Required
       "original_token_count": int,  # Required
       "final_token_count": int,  # Required
       "compression_applied": bool,  # Required
       "assembly_time_ms": int,  # Optional
       "sections": list[str],  # List of section names present
       "query": str,  # Original query (optional)
       "config_used": dict,  # Configuration snapshot
   }
   ```

### Input Validation

1. **Documents List**:
   - Can be None → return default ContextPackage with grounding_score=0.0
   - Can be empty list → return default ContextPackage with grounding_score=0.0
   - Must contain RelevantDocument objects if not None/empty

2. **RelevantDocument Validation**:
   - `relevancy_score` must be float in [0.0, 1.0]
   - Invalid scores excluded from grounding_score calculation
   - `content` must be non-empty string (warn if empty)

3. **Token Budget**:
   - `max_tokens` must be positive integer
   - Typical values: 4000-8000 for current LLMs

## No Database Persistence

**ContextPackage**: Defined as Pydantic BaseModel for in-memory use only.

**Rationale for No Persistence**:
1. **Ephemeral Nature**: Context packages are assembled on-demand for each LLM invocation
2. **Rebuild Capability**: Can be reconstructed from source documents when needed
3. **Storage Efficiency**: Avoids storing large payloads in database
4. **Performance**: No database I/O overhead during assembly/retrieval
5. **Simplicity**: No migration requirements, no table management

**Design Decision**:
- ContextPackage does NOT inherit from BaseResource
- ContextPackage does NOT use SQLModel table features
- ContextPackage is a pure Pydantic BaseModel
- No database migrations required for this model
- Context packages exist only in memory during request lifecycle

**Traceability**:
- Use `correlation_id` for distributed tracing
- Use `invocation_id` to reference the parent invocation record
- Source documents (RelevantDocuments) maintain their own persistence if needed

## Testing Requirements

### Unit Test Scenarios

1. **Grounding Score Computation**:
   - Empty list → 0.0
   - Single document → use its relevancy_score
   - Multiple documents → simple average
   - Some None scores → exclude from average
   - All None scores → 0.0

2. **Citation Extraction**:
   - Multiple documents with file_id → extract all file_ids
   - Documents with missing file_id → handle gracefully
   - Empty document list → empty citations list
   - Null file_metadata → skip and log warning

3. **Payload Hierarchy**:
   - All sections present → correct order
   - Missing sections → valid but incomplete
   - Empty payload → valid

4. **Error Handling**:
   - Post-compression token violation → ContextAssemblyError
   - Null documents → default package
   - Invalid relevancy scores → filtered out

### Integration Test Scenarios

1. **Token Service Integration**:
   - Within budget (no exception)
   - Exceeds budget (TokenLimitExceededError)
   - Service unavailable (error propagation)

2. **Compressor Service Integration**:
   - Successful compression (citations still extracted from original file_metadata)
   - Compression failure handling

3. **End-to-End Assembly**:
   - Full workflow with compression
   - Full workflow without compression
   - Edge case handling (empty inputs)

## Implementation Checklist

- [ ] Create ContextAssemblyError exception class
- [ ] Verify ContextPackage model (Pydantic BaseModel, no database persistence)
- [ ] Implement AssemblerService class structure
- [ ] Implement _compute_grounding_score method
- [ ] Implement _extract_citations method
- [ ] Implement _build_payload method with hierarchy enforcement
- [ ] Implement _validate_hierarchy method
- [ ] Implement main assemble() method with two-stage validation
- [ ] Add logging statements with correlation_id
- [ ] Write unit tests for all methods
- [ ] Write integration tests for service interactions
- [ ] Update ContextManagerPlanner integration

---
*Data model design completed: 2025-12-10*
