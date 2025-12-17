# Research: Agent Node with File Context Support

**Feature**: 023-agent-node
**Date**: 2025-12-11
**Updated**: 2025-12-17
**Status**: Complete

---

## Executive Summary

The Agent Node file context support feature requires **fully decoupling file management from invocations**. Currently, files are uploaded as part of invocation creation (runtime) and metadata is stored in `Invocation.context_data.file_metadata`. The requirement is to:

1. Attach files at workflow design time (not runtime)
2. Store file metadata independently in a dedicated `FileMetadata` database table
3. Have invocations only hold `file_ids` references (not full metadata)

**Key Architectural Change:** Create a `FileMetadata` SQLModel table managed by `FileManager` and `DocumentConversionService`. Files are first-class entities with their own lifecycle, keyed solely by `file_id`. Invocations only store references.

---

## Codebase Analysis

### 1. File Manager (`file_manager`)

**Location**: `src/nexus/files/` (NEW top-level component)

**Current Capabilities**:
- `FileManager` class handles validation, storage, and metadata generation
- `FileMetadata` is a Pydantic model (in-memory only): `file_id`, `filename`, `size_bytes`, `mime_type`, `file_path`, `status`
- Validation: file count (max 10), file size (max 10MB), MIME types (PDF, DOC, DOCX, TXT, MD)
- Storage: Local filesystem with pluggable retriever pattern
- Document conversion: Async task-based conversion pipeline

**Current Limitations**:
- `validate_and_save_files()` requires `invocation_id` parameter
- Files are stored with path pattern: `nexus-{invocation_id}-{filename}`
- File storage is coupled to invocation creation
- `FileMetadata` is not persisted - it's stored in `Invocation.context_data.file_metadata` (JSONB)

**Required Changes**:
1. **Create `FileMetadata` SQLModel table** - Persist file metadata in database (not in invocation)
2. **Remove `invocation_id` from all file operations** - Use only `file_id` for storage paths
3. **Files stored with pattern**: `nexus-{file_id}-{filename}` (no invocation_id)
4. **`FileManager` manages `FileMetadata` records** - Add methods: `get_file_metadata()`, `get_files_metadata()`, `update_file_status()`
5. **Encapsulation Principle**: All components (`DocumentConversionTask`, `InvocationService`, `UploadedFileRetriever`) access `FileMetadata` through `FileManager` methods, NOT direct DB queries

### 2. File Storage

**Location**: `src/nexus/files/storage/storage.py` (NEW)

**Current Implementation**:
```python
async def save_file(file_content, filename, invocation_id, retriever) -> str:
    file_path = f"nexus-{invocation_id}-{safe_filename}"
    return await retriever.save_file(file_content, file_path)
```

**Required Changes**:
1. **Replace `invocation_id` with `file_id`** - All file operations use `file_id` only
2. **Update path pattern**: `nexus-{file_id}-{safe_filename}`
3. **Update all callers** to pass `file_id` (generated before save)
4. **Note**: `BaseRetriever` interface unchanged - it handles raw bytes storage only. Application-level `FileMetadata` is managed separately in the database.

### 3. Invocations API

**Location**: `src/nexus/api/v1/invocation.py`

**Current Capabilities**:
- Returns HTTP 202 Accepted immediately with invocation object
- Supports TWO request formats:
  - `application/json`: No file support
  - `multipart/form-data`: Full file upload support (1-10 files, max 10MB each)
- Files stored with invocation-specific directory structure
- File metadata captured in `context_data.file_metadata` (JSONB)

**Gap Identified**: File upload happens at invocation creation (runtime), but needs to happen at workflow design time.

**Required Changes**:
1. **Remove `file_metadata` from `context_data`** - Metadata lives in `FileMetadata` table, not invocation
2. **Accept `file_ids` in `context_data`** - List of UUIDs referencing `FileMetadata` records
3. **Retain runtime file upload support** - `POST /invocations` with file uploads continues to work; files are saved to `FileMetadata` table (same as design-time uploads), converted, then execution proceeds
4. **Invocation model comment update** - Remove reference to `file_metadata` in `context_data` docstring

### 4. UploadedFileRetriever (retriever_service layer)

**Location**: `src/nexus/agent_orchestrator/context_manager/retriever_service/retrievers/uploaded_file_retriever.py`

**Analysis Needed**: How does the retriever currently retrieve file content?
- Currently retrieves files from embedded `context_data.file_metadata` (Pydantic objects)
- Need to update to query `FileMetadata` database table by `file_id`

**Required Changes**:
1. **Inject `FileManager` dependency** - Encapsulation principle
2. **Update `retrieve_documents()` to extract `file_ids` from context** (not `file_metadata`)
3. **Use `FileManager.get_files_metadata(file_ids, session)`** - NOT direct DB query (encapsulation)
4. **Validate conversion status** - Only process files where `status == CONVERTED`
5. **Read content from `converted_content_path`** via `FileManager.get_retriever_for_file()`

**Note**: `ContextManagerPlanner` does NOT need changes - it uses `RetrieverService` which calls `UploadedFileRetriever`.

### 5. AgentOrchestratorClient

**Location**: `src/nexus/workflows/clients/agent_orchestrator_client.py`

**Current Implementation (Code Review 2025-12-12)**:
- `invoke_agent()` POSTs to `/invocations` with JSON payload
- `_validate_invocation_response()` checks `status in ("completed", "failed", "cancelled")`
- **BUG**: POST /invocations returns HTTP 202 with `status: "created"`, not terminal status
- Uses httpx async client with retry logic and exponential backoff
- No WebSocket consumption - only HTTP

**Gap Identified**:
- Client incorrectly expects terminal status in POST response (POST returns `created`)
- Client does NOT use WebSocket to wait for completion
- No `file_ids` parameter in `invoke_agent()` signature

**Required Changes**:
1. Add `file_ids: list[str] | None = None` parameter to `invoke_agent()`
2. Add `stream_invocation(invocation_id, on_event, timeout)` method for WebSocket streaming
3. After POST returns 202, call `stream_invocation()` to wait for terminal status
4. Pass `file_ids` in `contextData` of POST payload

### 6. WebSocket Streaming Infrastructure

**Location**: `src/nexus/agent_orchestrator/ws/adaptor_streaming.py`

**Endpoint**: `/ws/agent_orchestrator/v1/invocations/{invocation_id}`

**Current Capabilities**:
- Full WebSocket streaming support
- Events streamed from Valkey
- Event types: `delta`, `completion`, `error`, `cancelled`
- Supports replay and resume

**Key Decision**: WebSocket streaming infrastructure already exists. The `AgentOrchestratorClient` just needs to consume it.

### 7. Agentic Activity

**Location**: `src/nexus/workflows/workflow_engine/activities/agentic_activity.py`

**Current Implementation**:
- Uses `AgentOrchestratorClient.invoke_agent()`
- Passes prompt, user_id, agent, model, input_data

**Required Changes**:
1. Accept `file_ids` in `AgenticExecutorConfig`
2. Pass `file_ids` to `invoke_agent()` method

### 8. File Upload Configuration

**Location**: `src/nexus/core/config.py`

**Settings**:
```python
class FileUploadSettings(BaseSettings):
    file_upload_max_size_mb: int = 10
    file_upload_max_files: int = 10
    file_upload_storage_dir: str = tempfile.gettempdir()
    file_upload_allowed_mime_types: list[str] = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "text/markdown",
    ]
```

**Key Decision**: Configuration already exists and matches spec requirements. No changes needed.

---

## Implementation Approach

### Scope Assessment

| Component | Change Needed | Effort |
|-----------|---------------|--------|
| `FileMetadata` model | **NEW SQLModel table for file metadata** | Medium |
| `file_manager` | **Manage FileMetadata DB records, use file_id only** | Medium |
| `storage.py` | **Replace invocation_id with file_id** | Small |
| `DocumentConversionService` | **Update FileMetadata.status in DB** | Small |
| `/api/v1/files` | **NEW endpoint for design-time uploads** | Medium |
| `/api/v1/invocations` | **Remove file_metadata, accept file_ids only** | Small |
| `Invocation` model | **Remove file_metadata from context_data docs** | Small |
| `UploadedFileRetriever` | **Query FileMetadata table by file_id** | Medium |
| `AgentOrchestratorClient` | **Add WebSocket streaming + file_ids** | Medium |
| `AgenticExecutorConfig` | Add `file_ids` field | Small |
| `agentic_activity` | Pass `file_ids` to client | Small |
| Alembic migration | **NEW migration for FileMetadata table** | Small |

### Key Design Decision: FileMetadata as First-Class Entity

**Architectural Principle**: Files are independent entities with their own lifecycle, not subordinate to invocations.

- **FileMetadata** is a SQLModel table (not JSONB in Invocation)
- **FileManager** creates/reads/updates FileMetadata records via dedicated methods (`get_file_metadata`, `get_files_metadata`, `update_file_status`)
- **Encapsulation Principle**: All components access `FileMetadata` through `FileManager` methods, NOT direct DB queries:
  - `DocumentConversionTask` → uses `FileManager.update_file_status()`
  - `InvocationService` → uses `FileManager.get_files_metadata()` for validation
  - `UploadedFileRetriever` → uses `FileManager.get_files_metadata()` for retrieval
- **Invocations** only store `file_ids` (list of UUIDs) in `context_data`
- **All file operations use `file_id` only** - no `invocation_id` in file layer

### Design-Time Flow (Workflow Authoring)

1. User attaches files to Agent Node in UI
2. UI calls `POST /api/v1/files` with files
3. `FileManager.validate_and_save_files()`:
   - Validates files (size, type, count)
   - Generates `file_id` (UUID)
   - Saves file bytes via `BaseRetriever` with path `nexus-{file_id}-{filename}`
   - Creates `FileMetadata` record in DB (status: `pending_conversion`)
4. `DocumentConversionTask` triggered as background task:
   - Converts file to text/markdown
   - Updates `FileMetadata.status` to `converted` (or `conversion_failed`)
   - Updates `FileMetadata.converted_content` with extracted text
5. API returns `file_ids` to UI
6. `file_ids` stored in Agent Node / Workflow configuration (max 10)

### Runtime Flow (Workflow Execution)

1. Workflow triggers agentic activity
2. Activity reads `file_ids` from `AgenticExecutorConfig`
3. Activity calls `invoke_agent()` with `file_ids`
4. `InvocationService.create_invocation()` receives `file_ids` in `context_data`
5. Since files are pre-converted, execute immediately (no conversion wait)
6. `RetrieverService` → `UploadedFileRetriever.retrieve_documents()`:
   - Queries `FileMetadata` table by `file_id`
   - Reads content from `converted_content_path`, yields `RelevantDocument` objects
7. Agent processes files as context

### Architecture Note - Decoupling Required

Currently `DocumentConversionTask.convert()` calls `InvocationExecutor.execute_invocation()` in its `finally` block (`document_conversion_task.py:311-313`). This must be refactored:

1. **Remove execution from `DocumentConversionTask`** - make it a pure conversion utility that only updates `FileMetadata.status` in DB
2. **Move orchestration to `InvocationService`** - it decides the execution path:
   - `file_ids` provided → execute immediately (files pre-converted)
   - Runtime file uploads → create FileMetadata records, convert, then execute
   - No files → execute immediately
3. **Standalone uploads** (`POST /api/v1/files`) → only trigger conversion, no invocation

### New Files API

**POST /api/v1/files** - Standalone file upload:
- Accepts multipart/form-data with 1-10 files
- Validates file size, count, MIME types (reuses existing validators)
- Stores files using `file_manager` with `file_id`-based paths
- Returns list of `file_ids` for later reference

**Response**:
```json
{
  "file_ids": ["uuid1", "uuid2"],
  "files": [
    {"file_id": "uuid1", "filename": "doc.pdf", "size_bytes": 1234, "mime_type": "application/pdf", "status": "pending_conversion"},
    {"file_id": "uuid2", "filename": "notes.txt", "size_bytes": 567, "mime_type": "text/plain", "status": "pending_conversion"}
  ]
}
```

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| File cleanup (orphaned files) | Disk space waste | Future: Add cleanup job for files not referenced by any workflow |
| WebSocket connection drops | Response lost | Use `last_event_id` for resumption, implement retry logic |
| Large files cause timeout | Upload fails | Mitigated by 10MB limit per file |
| Temporal activity timeout | Activity fails | Use heartbeats during streaming, configure appropriate timeouts |

---

## Decisions Made

1. **File types**: Use existing `file_upload_allowed_mime_types` config (PDF, DOC, DOCX, TXT, MD)
2. **File limits**: Use existing settings (10 files max, 10MB each)
3. **Conflict handling**: No priority order; Agent reconciles conflicts autonomously
4. **Upload timeout**: Deferred (performance requirements to be defined later)
5. **File storage**: Extend `file_manager` with standalone storage (not new service)
6. **File references**: Use `file_id` (UUID) as the only reference - no `invocation_id` in file layer
7. **FileMetadata persistence**: SQLModel table in database (not JSONB in Invocation.context_data)
8. **Metadata ownership**: `FileManager` owns all FileMetadata CRUD via dedicated methods (`get_file_metadata`, `get_files_metadata`, `update_file_status`)
9. **Encapsulation Principle**: All components (`DocumentConversionTask`, `InvocationService`, `UploadedFileRetriever`) access `FileMetadata` through `FileManager` methods, NOT direct DB queries
10. **Invocation simplification**: `context_data` only holds `file_ids` (list of UUIDs), not full metadata
11. **Runtime file uploads retained**: `POST /invocations` with file uploads continues to work; files create `FileMetadata` records in DB, get converted, then execution proceeds
