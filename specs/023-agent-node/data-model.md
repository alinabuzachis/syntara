# Data Model: Agent Node with File Context Support

**Feature**: 023-agent-node
**Date**: 2025-12-11
**Updated**: 2025-12-17

---

## Overview

This feature extends the existing Agent Node implementation to support file attachments using **fully decoupled file management**.

**Key Design:** Files are **first-class entities** with their own lifecycle, stored in a dedicated `FileMetadata` database table. File references (`file_ids`) are stored in workflow configuration. Invocations only hold `file_ids`, never full metadata.

**Architectural Principle:** All file operations use `file_id` only. No `invocation_id` in the file management layer.

This cleanly separates:
- **Design time**: File upload, storage, and metadata persistence in DB (independent of invocations)
- **Runtime**: File retrieval via database queries by `file_id`

---

## New Entities

### FileMetadata (SQLModel Table)

**Location**: `src/nexus/files/models/file_metadata.py` (NEW)

Files are stored as first-class entities in the database:

```python
class FileStatus(str, Enum):
    """Status enum for file conversion lifecycle."""
    PENDING_CONVERSION = "pending_conversion"
    CONVERTING = "converting"
    CONVERTED = "converted"
    CONVERSION_FAILED = "conversion_failed"


class FileMetadata(BaseResource, table=True):
    """SQLModel for uploaded file metadata.

    Files are first-class entities with their own lifecycle,
    independent of invocations.

    Storage Strategy:
    - Original file bytes stored on filesystem via BaseRetriever
    - Converted text content stored on filesystem via BaseRetriever
    - Only paths stored in database (protects against DB bloat)
    """
    __tablename__ = "file_metadata"

    # File identification (id inherited from BaseResource as UUID primary key)
    filename: str = Field(max_length=255, description="Original filename")
    mime_type: str = Field(max_length=100, description="Detected MIME type")
    size_bytes: int = Field(ge=0, description="File size in bytes")

    # Storage paths (both via BaseRetriever - filesystem/S3/etc.)
    file_path: str = Field(max_length=500, description="Original file: nexus-{file_id}-{filename}")
    converted_content_path: str | None = Field(default=None, max_length=500, description="Converted markdown: nexus-{file_id}-content.md")

    # Conversion status
    status: FileStatus = Field(default=FileStatus.PENDING_CONVERSION)
    conversion_error: str | None = Field(default=None, description="Error message if conversion failed")

    # Inherited from BaseResource:
    # - id: UUID (primary key, used as file_id)
    # - created_at: datetime
    # - updated_at: datetime
```

**Key Points**:
- `id` (inherited from `BaseResource`) serves as the `file_id` - the public reference used across systems
- `file_path` and `converted_content_path` are internal only (not exposed in API responses)
- Both original file and converted text stored on filesystem via `BaseRetriever` (protects DB from bloat)
- `status` tracks the conversion lifecycle
- At runtime, `UploadedFileRetriever` reads converted content from `converted_content_path`

**Database Migration**: Requires Alembic migration to create `file_metadata` table.

---

## Modified Entities

### AgenticExecutorConfig

**Location**: `src/nexus/workflows/workflow_engine/models/workflow_definition.py`

**Current Definition**:
```python
class AgenticExecutorConfig(BaseModel):
    """Configuration for agentic executor."""
    prompt: str
    agent: str | None = None
    model: str | None = None
    timeout: int = Field(default=constants.DEFAULT_AGENTIC_TIMEOUT_SECONDS, ge=1, le=3600)
```

**New Definition**:
```python
class AgenticExecutorConfig(BaseModel):
    """Configuration for agentic executor."""
    prompt: str
    agent: str | None = None
    model: str | None = None
    timeout: int = Field(default=constants.DEFAULT_AGENTIC_TIMEOUT_SECONDS, ge=1, le=3600)
    file_ids: list[str] = Field(
        default_factory=list,
        max_length=10,
        description="List of file IDs to include as context (uploaded via /api/v1/files)"
    )
```

**Validation Rules**:
- `file_ids`: List of UUID strings (max 10, enforced at design time via `max_length=10`)
- Each `file_id` must reference an existing uploaded file (validated at runtime when files are retrieved)

**How Agent Node Links to Files:**

The Agent Node (defined in workflow YAML) stores file references directly in `AgenticExecutorConfig.file_ids`:

```yaml
# Workflow YAML - Agent Node stores file_ids in config
activities:
  - name: analyze-documents
    type: agentic
    config:
      prompt: "Analyze these documents..."
      file_ids:    # <-- Uploaded file references stored here
        - "550e8400-e29b-41d4-a716-446655440001"
        - "550e8400-e29b-41d4-a716-446655440002"
```

When the UI saves the workflow:
1. User uploads files via `POST /api/v1/files`
2. UI receives `file_ids` in response
3. UI writes `file_ids` into the workflow YAML (into `config.file_ids`)
4. Workflow YAML is persisted (database or file)

**Unsaved Changes Warning**: If the user attempts to navigate away from the workflow builder with unsaved changes (including uploaded files not yet saved to the workflow), the browser displays a standard confirmation dialog warning that unsaved changes will be lost.

---

### Invocation.context_data (Breaking Change)

**Location**: `src/nexus/agent_orchestrator/models/invocation.py`

The `context_data` field structure changes to remove embedded file metadata:

**Before** (current implementation):
```python
context_data = {
    "file_metadata": [
        {"file_id": "...", "filename": "doc.pdf", "size_bytes": 1024, ...}
    ]
}
```

**After** (new implementation):
```python
context_data = {
    "file_ids": ["550e8400-...", "550e8400-..."]  # References only
}
# FileMetadata is queried from the FileMetadata table, not stored here
```

**What's changing:**
- `file_metadata` array is **removed** from `context_data`
- Only `file_ids` (list of UUIDs) stored in `context_data`
- Full metadata lives in `FileMetadata` database table
- At runtime, `UploadedFileRetriever` queries the `FileMetadata` table by `file_id`

---

## Modified API

### POST /api/v1/invocations (Updated)

**Endpoint Location**: `src/nexus/api/v1/invocation.py`

The existing invocations endpoint is updated to accept `file_ids` and support both pre-uploaded and runtime file uploads.

**Request Changes**:
- Accept `file_ids` in `context_data` (list of UUIDs referencing pre-uploaded files)
- Continue supporting `multipart/form-data` for runtime file uploads
- Both can be combined in a single request

**Example JSON Request** (pre-uploaded files):
```json
{
    "prompt": "Analyze the attached documents",
    "sessionId": "session-123",
    "createdBy": "user-uuid",
    "contextData": {
        "file_ids": ["550e8400-...", "550e8400-..."]
    }
}
```

**Response Changes**:
- Response does NOT include `file_metadata` (metadata lives in `FileMetadata` table)
- Only `file_ids` references are tracked

**Behavior by Request Type**:
| Request Type | Conversion | Execution |
|--------------|------------|-----------|
| JSON with `file_ids` only | No (pre-converted) | Immediate |
| Multipart with file uploads only | Yes (creates FileMetadata in DB) | After conversion |
| Multipart with `file_ids` AND uploads | Yes (new uploads only) | After new file conversion |
| No files | No | Immediate |

---

## New API

### POST /api/v1/files

**Endpoint Location**: `src/nexus/api/v1/files.py` (NEW)

Upload files at design time for later use in agent invocations.

**Request**: `multipart/form-data` with 1-10 files

**Response Schema**:
```python
class FileMetadataResponse(BaseModel):
    """Public file metadata (excludes internal file_path)."""
    file_id: str
    filename: str
    size_bytes: int
    mime_type: str
    status: str

class FileUploadResponse(BaseModel):
    """Response from file upload endpoint."""
    file_ids: list[str]  # List of UUIDs for easy reference
    files: list[FileMetadataResponse]  # Full metadata for each file
```

**Example Response**:
```json
{
  "file_ids": ["550e8400-e29b-41d4-a716-446655440001", "550e8400-e29b-41d4-a716-446655440002"],
  "files": [
    {
      "file_id": "550e8400-e29b-41d4-a716-446655440001",
      "filename": "requirements.pdf",
      "size_bytes": 1048576,
      "mime_type": "application/pdf",
      "status": "pending_conversion"
    },
    {
      "file_id": "550e8400-e29b-41d4-a716-446655440002",
      "filename": "notes.txt",
      "size_bytes": 2048,
      "mime_type": "text/plain",
      "status": "pending_conversion"
    }
  ]
}
```

---

## Files Component (NEW)

This feature introduces a new top-level `src/nexus/files/` component for file management. Files are first-class entities independent of agent orchestration.

### FileManager

**Location**: `src/nexus/files/services/file_manager.py` (NEW)

**Modified Method** (refactor existing `validate_and_save_files()`):
```python
async def validate_and_save_files(
    self,
    files: list[UploadFile],
    session: AsyncSession,  # NEW: Database session for FileMetadata CRUD
) -> list[FileMetadata]:
    """Validate and save uploaded files with transactional cleanup.

    Process:
    1. Validate files (size, type, count)
    2. Generate file_id (UUID) for each file
    3. Save file bytes via BaseRetriever with path nexus-{file_id}-{filename}
    4. Create FileMetadata record in database

    Args:
        files: List of uploaded files
        session: Database session for creating FileMetadata records

    Returns:
        List of FileMetadata records (persisted in DB)

    Raises:
        ValidationError: If file validation fails
    """
```

**New Methods**:
```python
async def get_file_metadata(self, file_id: str, session: AsyncSession) -> FileMetadata | None:
    """Get FileMetadata record by file_id.

    Args:
        file_id: UUID of the file to retrieve
        session: Database session

    Returns:
        FileMetadata record if found, None otherwise
    """

async def get_files_metadata(self, file_ids: list[str], session: AsyncSession) -> list[FileMetadata]:
    """Get multiple FileMetadata records by file_ids.

    Args:
        file_ids: List of file UUIDs to retrieve
        session: Database session

    Returns:
        List of FileMetadata records (may be fewer than requested if some not found)
    """

async def update_file_status(
    self,
    file_id: str,
    status: FileStatus,
    session: AsyncSession,
    converted_content_path: str | None = None,
    conversion_error: str | None = None,
) -> FileMetadata:
    """Update file conversion status in database.

    Used by DocumentConversionTask to update status after conversion.

    Args:
        file_id: UUID of the file to update
        status: New status (CONVERTING, CONVERTED, CONVERSION_FAILED)
        session: Database session
        converted_content_path: Path to converted markdown (if successful)
        conversion_error: Error message (if failed)

    Returns:
        Updated FileMetadata record
    """
```

**Key Change**: `invocation_id` parameter completely removed. All file operations use `file_id` only. FileMetadata is persisted in the database, not returned as transient objects.

**Encapsulation Principle**: All components that need to access `FileMetadata` records MUST go through `FileManager`:
- `UploadedFileRetriever` → uses `get_files_metadata()` to retrieve file records
- `DocumentConversionTask` → uses `update_file_status()` to update conversion progress
- `InvocationService` → uses `get_files_metadata()` to validate file_ids exist

### storage.py

**Location**: `src/nexus/files/storage/storage.py` (NEW)

**Modified Function**:
```python
async def save_file(
    file_content: bytes,
    filename: str,
    retriever: BaseRetriever,
    file_id: str,  # Changed from invocation_id - always file_id now
) -> str:
    """Save uploaded file to storage using the configured retriever.

    Files are saved with pattern: nexus-{file_id}-{sanitized_filename}

    Args:
        file_content: File content as bytes
        filename: Original filename from upload
        retriever: Storage retriever to use for saving file
        file_id: Unique file identifier (UUID)

    Returns:
        Saved file path
    """
```

**Key Change**: Parameter renamed from `invocation_id` to `file_id`. No support for `invocation_id` - all file operations use `file_id` only.

---

## Retriever Service Changes

### UploadedFileRetriever

**Location**: `src/nexus/agent_orchestrator/context_manager/retriever_service/retrievers/uploaded_file_retriever.py`

**What Already Exists:**
- `UploadedFileRetriever` class that retrieves documents from `context_data.file_metadata`
- Uses `FileManager.get_retriever_for_file()` to get storage backend
- Returns `RelevantDocument` objects for `RetrieverService`

**What Needs to Change:**
- Currently reads from `context_data.file_metadata` (embedded Pydantic objects)
- Needs to read `file_ids` from `context_data` and query `FileMetadata` database table

**Updated Implementation**:
```python
from nexus.files.services.file_manager import FileManager, get_file_manager
from nexus.files.models.file_metadata import FileStatus

class UploadedFileRetriever(DocumentRetriever):
    def __init__(
        self,
        file_manager: FileManager = Depends(get_file_manager),
        session_factory: Callable[[], AsyncSession] = get_db,
    ) -> None:
        self.file_manager = file_manager
        self.session_factory = session_factory

    async def _retrieve_documents_impl(self, invocation_context: dict[str, Any]) -> AsyncIterator[RelevantDocument]:
        # NEW: Extract file_ids instead of file_metadata
        file_ids = invocation_context.get("file_ids", [])
        if not file_ids:
            logger.info("No file_ids found in invocation context")
            return

        # NEW: Use FileManager to get file records (encapsulation)
        async with self.session_factory() as session:
            file_records = await self.file_manager.get_files_metadata(file_ids, session)

        # Validate all files exist and are converted
        found_ids = {str(f.id) for f in file_records}
        missing = set(file_ids) - found_ids
        if missing:
            raise FileNotFoundError(f"Files not found: {missing}")

        not_converted = [f for f in file_records if f.status != FileStatus.CONVERTED]
        if not_converted:
            raise ValueError(f"Files not yet converted: {[f.id for f in not_converted]}")

        # Load content from converted_content_path and yield documents
        for file_record in file_records:
            retriever = self.file_manager.get_retriever_for_file(
                file_record.size_bytes, file_record.mime_type
            )
            content_bytes = await retriever.load_file(file_record.converted_content_path)
            content_str = content_bytes.decode("utf-8")

            yield RelevantDocument(
                content=content_str,
                relevancy_score=1.0,
                file_metadata=file_record,  # Now a SQLModel, not Pydantic
                source_type="uploaded_file",
                retrieval_metadata={"file_id": str(file_record.id)},
            )
```

**Key Points**:
- `ContextManagerPlanner` does NOT need changes - it uses `RetrieverService` which calls `UploadedFileRetriever`
- File retrieval stays in `retriever_service` layer (existing architecture)
- **No hydrated metadata in context**: `context_data` contains only `file_ids` (UUIDs), not embedded `FileMetadata` objects
- **Uses FileManager for encapsulation**: `UploadedFileRetriever` calls `FileManager.get_files_metadata()` instead of direct DB queries
- **Single source of truth**: `FileMetadata` table is authoritative; no duplicate metadata in `Invocation.context_data`
- Reads converted content from filesystem via `BaseRetriever`

---

## Document Conversion Changes

### DocumentConversionTask

**Location**: `src/nexus/files/document_conversion/tasks/document_conversion_task.py`

**What Already Exists:**
- Background task that converts uploaded files to markdown
- Currently updates file status but expects invocation context

**What Needs to Change:**
- Use `FileManager.update_file_status()` instead of direct DB updates
- Remove coupling to invocation execution (becomes pure conversion utility)

**Updated Usage Pattern**:
```python
from nexus.files.services.file_manager import FileManager
from nexus.files.models.file_metadata import FileStatus

class DocumentConversionTask:
    def __init__(self, file_manager: FileManager) -> None:
        self.file_manager = file_manager

    async def convert(self, file_id: str, session: AsyncSession) -> None:
        """Convert a file to markdown format.

        Updates FileMetadata status via FileManager throughout the process.
        """
        # Mark as converting
        await self.file_manager.update_file_status(
            file_id=file_id,
            status=FileStatus.CONVERTING,
            session=session,
        )

        try:
            # Get file metadata to find original file path
            file_record = await self.file_manager.get_file_metadata(file_id, session)
            if not file_record:
                raise FileNotFoundError(f"File not found: {file_id}")

            # Perform conversion...
            converted_path = await self._do_conversion(file_record.file_path)

            # Mark as converted
            await self.file_manager.update_file_status(
                file_id=file_id,
                status=FileStatus.CONVERTED,
                session=session,
                converted_content_path=converted_path,
            )

        except Exception as e:
            # Mark as failed
            await self.file_manager.update_file_status(
                file_id=file_id,
                status=FileStatus.CONVERSION_FAILED,
                session=session,
                conversion_error=str(e),
            )
            raise
```

**Key Points**:
- All status updates go through `FileManager.update_file_status()`
- No direct database queries in `DocumentConversionTask`
- Conversion is now a pure utility - does NOT trigger invocation execution
- `InvocationService` is responsible for orchestrating conversion → execution flow

---

### InvocationService

**Location**: `src/nexus/agent_orchestrator/services/invocation_service.py`

**What Already Exists:**
- Service that orchestrates invocation creation and execution
- Currently coupled to document conversion flow

**What Needs to Change:**
- Use `FileManager` for all file-related operations
- Orchestrate conversion → execution flow (moved from `DocumentConversionTask`)

**Updated Usage Pattern**:
```python
from nexus.files.services.file_manager import FileManager

class InvocationService:
    def __init__(self, file_manager: FileManager) -> None:
        self.file_manager = file_manager

    async def create_invocation(
        self,
        request: InvocationRequest,
        files: list[UploadFile] | None,
        session: AsyncSession,
    ) -> Invocation:
        """Create an invocation with optional file context.

        Uses FileManager for all file operations (encapsulation).
        """
        file_ids = request.context_data.get("file_ids", []) if request.context_data else []

        # Validate pre-uploaded file_ids exist
        if file_ids:
            existing_files = await self.file_manager.get_files_metadata(file_ids, session)
            found_ids = {str(f.id) for f in existing_files}
            missing = set(file_ids) - found_ids
            if missing:
                raise ValueError(f"Files not found: {missing}")

        # Handle runtime file uploads
        new_file_ids = []
        if files:
            new_files = await self.file_manager.validate_and_save_files(files, session)
            new_file_ids = [str(f.id) for f in new_files]
            # Trigger conversion for new files (background task)
            for file_id in new_file_ids:
                await self._trigger_conversion(file_id)

        # Merge file_ids
        all_file_ids = file_ids + new_file_ids

        # Create invocation with file_ids in context_data
        invocation = Invocation(
            prompt=request.prompt,
            context_data={"file_ids": all_file_ids} if all_file_ids else None,
            # ... other fields
        )
        session.add(invocation)
        await session.commit()

        return invocation
```

**Key Points**:
- All file operations go through `FileManager`
- Validates file_ids exist using `FileManager.get_files_metadata()`
- Creates new file records using `FileManager.validate_and_save_files()`
- `InvocationService` now owns the conversion → execution orchestration

---

## Client Interface

### AgentOrchestratorClient

**Location**: `src/nexus/workflows/clients/agent_orchestrator_client.py`

**What Already Exists:**
- `invoke_agent()` method - POSTs to `/invocations`
- WebSocket streaming server-side at `/ws/agent_orchestrator/v1/invocations/{id}`

**What Needs to Change:**
- Fix bug: `invoke_agent()` expects terminal status from POST but API returns `created`
- Add `stream_invocation()` method to consume existing WebSocket
- Add `file_ids` parameter to `invoke_agent()`

**Updated Method**:

```python
async def invoke_agent(
    self,
    prompt: str,
    user_id: str,
    session_id: str | None = None,
    agent: str | None = None,
    model: str | None = None,
    input_data: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
    correlation_id: str | None = None,
    timeout_seconds: float | None = None,
    file_ids: list[str] | None = None,  # NEW: File references
) -> dict[str, Any]:
    """Invoke agent with optional file context.

    Args:
        prompt: Natural language prompt for the agent
        user_id: User identifier for authentication and audit
        session_id: Optional session ID (auto-generated if not provided)
        agent: Optional agent identifier for routing
        model: Optional model identifier to use
        input_data: Optional input data for the agent
        metadata: Optional additional metadata
        correlation_id: Optional correlation ID for tracking
        timeout_seconds: Optional timeout override
        file_ids: Optional list of file IDs to include as context

    Returns:
        Full invocation response containing id, status, result, etc.
    """
```

**New Method** (consumes existing WebSocket endpoint):

```python
async def stream_invocation(
    self,
    invocation_id: str,
    on_event: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
    timeout_seconds: float | None = None,
) -> dict[str, Any]:
    """Connect to EXISTING WebSocket and stream events until completion.

    WebSocket endpoint already exists: /ws/agent_orchestrator/v1/invocations/{id}
    This method consumes it - no server-side changes needed.

    Args:
        invocation_id: UUID of the invocation to stream
        on_event: Optional callback for each event (for progress reporting)
        timeout_seconds: Optional timeout override

    Returns:
        Final result dict with status, result/error_message, etc.
    """
```

**Timeout Architecture**:

| Timeout Type | Default | Max | Controlled By |
|--------------|---------|-----|---------------|
| WebSocket idle | 30s | - | Client reconnect logic |
| Invocation execution | 300s | 3600s | `AgenticExecutorConfig.timeout` |
| Temporal activity | Varies | - | Activity definition + heartbeats |

**Heartbeat Strategy** (implemented in `agentic_activity`, not in WebSocket client):

The `agentic_activity` is responsible for sending Temporal heartbeats, keeping the client layer clean:

```python
# In agentic_activity.py
async def execute_agentic_activity(config: AgenticExecutorConfig) -> dict:
    async def heartbeat_loop():
        while True:
            await asyncio.sleep(30)  # Heartbeat every 30 seconds
            activity.heartbeat()

    heartbeat_task = asyncio.create_task(heartbeat_loop())
    try:
        result = await client.invoke_agent(
            prompt=config.prompt,
            file_ids=config.file_ids,
            timeout_seconds=config.timeout,
        )
        return result
    finally:
        heartbeat_task.cancel()
```

This approach:
- Keeps `AgentOrchestratorClient` as a general-purpose client (no Temporal coupling)
- Heartbeats continue during POST, WebSocket streaming, and reconnection attempts
- Activity stays alive as long as it's making progress, even during brief WebSocket drops

---

## Data Flow

### Design Time (Workflow Authoring)

```
User (UI)
    │
    ├── Upload files
    │       │
    │       ▼
    │   POST /api/v1/files
    │       │
    │       ▼
    │   FileManager.validate_and_save_files(files, session)
    │       │
    │       ├── Save file bytes: nexus-{file_id}-{filename}
    │       │
    │       └── Create FileMetadata record in DB (status: pending_conversion)
    │       │
    │       ▼
    │   DocumentConversionTask.convert(file_id) (background)
    │       │
    │       └── Updates FileMetadata.status and converted_content in DB
    │       │
    │       ▼
    │   Returns: { file_ids: [...], files: [...] }
    │
    ├── Store file_ids in workflow config
    │       │
    │       ▼
    │   AgenticExecutorConfig.file_ids = [...]
    │
    └── Save workflow
```

**Note: Decoupling Document Conversion from Invocation Execution**

Currently, `DocumentConversionTask.convert()` calls `InvocationExecutor.execute_invocation()` in its `finally` block (see `document_conversion_task.py:311-313`). This tightly couples conversion and execution.

**Required refactoring:**

1. **Remove execution from `DocumentConversionTask`**: Make it a pure conversion utility that only updates `FileMetadata` in DB
2. **Move orchestration to `InvocationService`**: It decides the execution path:
   - **Invocations with `file_ids`** (pre-converted): Execute immediately, no conversion needed
   - **Invocations with file uploads** (runtime): Convert first (creates `FileMetadata` in DB), then execute
   - **Invocations without files**: Execute immediately

3. **Standalone file uploads** (`POST /api/v1/files`): Only trigger conversion, no invocation involved

**Execution paths after refactoring:**

| Scenario | Conversion | Execution |
|----------|------------|-----------|
| `POST /api/v1/files` (design time) | Yes (creates FileMetadata in DB) | N/A |
| `POST /api/v1/invocations` with `file_ids` only | No (already in DB) | Immediate |
| `POST /api/v1/invocations` with file uploads only | Yes (creates FileMetadata in DB) | After conversion |
| `POST /api/v1/invocations` with `file_ids` AND uploads | Yes (for new uploads only) | After new file conversion |
| `POST /api/v1/invocations` without files | No | Immediate |

### Runtime (Workflow Execution)

```
Temporal Workflow
    │
    ├── Execute agentic activity
    │       │
    │       ▼
    │   AgenticExecutorConfig { prompt, file_ids }
    │       │
    │       ▼
    │   AgentOrchestratorClient.invoke_agent(file_ids=...)
    │       │
    │       ▼
    │   POST /api/v1/invocations { context_data: { file_ids: [...] } }
    │       │
    │       ▼
    │   Agent executes
    │       │
    │       ├── RetrieverService → UploadedFileRetriever.retrieve_documents(context)
    │       │       │
    │       │       ▼
    │       │   Query FileMetadata table by file_id
    │       │       │
    │       │       ▼
    │       │   Load content from converted_content_path, yield RelevantDocument
    │       │
    │       ▼
    │   LLM processes with file context (from converted_content)
    │       │
    │       ▼
    │   Stream results via WebSocket
    │
    └── Return result to workflow
```

---

## Validation Summary

| Field | Validation | Enforced By | When |
|-------|------------|-------------|------|
| file_ids | Max 10 file references | `AgenticExecutorConfig` (`max_length=10`) | Design time (workflow save) |
| file_ids | Each must be valid UUID format | API endpoint | Design time (workflow save) |
| file_ids | Each must reference existing file | Workflow save API endpoint | Design time (workflow save) |
| file_ids | Each must reference existing file | `UploadedFileRetriever` | Runtime (invocation execution) |
| File count | Max 10 per upload | API (`FileUploadSettings.file_upload_max_files`) | Design time (file upload) |
| File size | Max 10 MB per file | API (`FileUploadSettings.file_upload_max_size_mb`) | Design time (file upload) |
| File type | PDF, DOC, DOCX, TXT, MD | API (`FileUploadSettings.file_upload_allowed_mime_types`) | Design time (file upload) |

**Note on file existence validation**:
- **Design time (required)**: When saving a workflow, the Workflow save API endpoint validates that each `file_id` references an existing file. This provides immediate feedback to users and is implemented in the API layer (not Pydantic model) for cleaner separation of concerns.
- **Runtime (required)**: `UploadedFileRetriever` validates file existence and conversion status when retrieving documents. This catches cases where files were deleted after workflow save.
- Both validations are complementary: design-time for UX, runtime for correctness.

**Future Consideration: Conversion Race Condition**

There's a potential race condition if a workflow is executed before file conversion completes:
1. Workflow authored with file attachments
2. Conversion starts (but is not complete)
3. Workflow is executed immediately
4. Invocation created → files not yet converted → error

**Current behavior (MVP)**: Fail fast - `UploadedFileRetriever` raises error if files have `status != CONVERTED`.

**Future options to consider**:
1. **Block at design time**: UI checks all files are `CONVERTED` before allowing workflow save
2. **Wait at runtime**: Poll until conversion completes (with timeout)
3. **Wait with progress**: Send WebSocket events while waiting for conversion
4. **Block workflow execution**: Temporal workflow checks file status before starting

For MVP, fail-fast is acceptable. Enhancement can be added in a future iteration.

---

## File Storage Considerations

### File Registry

**Decision**: Use **Option 1 - Database table** (`FileMetadata` SQLModel).

This provides:
- **Queryability**: Find files by status, list pending conversions, identify orphans
- **Transactional integrity**: File upload + metadata creation is atomic
- **Rich metadata**: Store conversion status, error messages, extracted content
- **Future extensibility**: User ownership, TTL, access tracking

The `FileMetadata` table (defined above) serves as the file registry. All file lookups go through database queries.

### File Cleanup

Orphaned files (uploaded but never used in workflows) can be identified via database query:

```sql
-- Find files not referenced by any workflow
SELECT * FROM file_metadata
WHERE id NOT IN (
    SELECT UNNEST(file_ids) FROM workflow_configs
)
AND created_at < NOW() - INTERVAL '7 days';
```

- **Future**: Background job to delete orphaned files older than retention period
- **For MVP**: Manual cleanup acceptable
