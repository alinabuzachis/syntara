# Research: File Attachment Support for Invocations

**Feature**: File Manager - Invocation File Attachment
**Date**: 2025-11-12
**Status**: Complete

## Executive Summary

This document outlines research findings for adding multiple file attachment support to the invocation API with **temporary file storage**. Users can upload 1-10 files per invocation (configurable via file_upload_max_files). Files are uploaded, validated (count, size, and MIME type), and saved to `/tmp` directory. File metadata array (including file_path and status="pending_parse" for each file) is stored in the invocation context_data. File parsing and deletion will be handled in a future ticket.

## Technical Context Resolved

### Language & Framework
- **Decision**: Python 3.12 with FastAPI
- **Rationale**: Existing codebase standard
- **Status**: ✅ Confirmed from codebase analysis

### File Upload Handling
- **Decision**: FastAPI's `UploadFile` with streaming
- **Rationale**:
  - Native multipart/form-data support
  - Streaming prevents memory overflow
  - Built-in MIME type detection
  - Async-compatible
- **Reference**: https://fastapi.tiangolo.com/tutorial/request-files/

### Temporary File Storage Strategy
- **Decision**: Save files to configurable storage directory (default `/tmp`, NOT deleted in this ticket)
- **Rationale**:
  - Files saved for future parsing ticket to process
  - Simple file storage without complex infrastructure
  - No database LOB storage needed
  - Configurable location for different environments (dev, staging, prod)
- **Storage**: Direct save to `file_upload_storage_dir` (default `/tmp`)
- **Organization**: `{storage_dir}/nexus-{invocation_id}-{filename}`
- **Cleanup**: NOT in this ticket - handled in future parsing ticket after parsing completes
- **Async I/O**: Use `aiofiles` library for non-blocking file operations to prevent blocking FastAPI event loop
- **Error Handling**: Return 500 Internal Server Error with generic message when save operations fail (disk full, permission denied, I/O errors); log detailed errors internally
- **Logging**: Log every file upload event with metadata (filename, size, user ID, timestamp); log detailed storage failure information for ops/debugging

### File Parsing Libraries
- **Decision**: NOT in this ticket - parsing will be added in future ticket
- **This Ticket**: Only MIME type detection using python-magic

### Configuration Management
- **Decision**: Extend Pydantic Settings
- **New Settings**:
  ```python
  file_upload_max_size_mb: int = 10  # Max size per file
  file_upload_max_files: int = 10     # Max files per invocation
  file_upload_storage_dir: str = "/tmp"  # Storage directory for uploaded files
  file_upload_allowed_extensions: list[str] = ["pdf", "doc", "docx", "txt", "md"]
  ```
- **Pattern**: Follows `src/nexus/core/config.py`

### Data Model Strategy
- **Decision**: SQLModel (constitutional requirement)
- **No File Attachment Table**: No new tables needed
- **Invocation.context_data Extension**: Add file metadata array to existing JSONB field
  ```json
  {
    "file_metadata": [
      {
        "filename": "document.pdf",
        "size_bytes": 524288,
        "mime_type": "application/pdf",
        "file_path": "{storage_dir}/nexus-uuid-document.pdf",
        "status": "pending_parse"
      }
    ]
  }
  ```
  **Note**: `{storage_dir}` defaults to `/tmp` via `file_upload_storage_dir` setting. Chunks will be managed by Context Manager, not stored in invocation.

### Validation Strategy
- **All Validation in FileManager**: Single responsibility for file operations
  - File count validation (max 10 files per invocation, configurable via file_upload_max_files)
  - File size validation per file (max 10MB, configurable via file_upload_max_size_mb)
  - MIME type validation using python-magic for each file
- **API Layer**: Forwards requests to service layer, converts exceptions to HTTP responses
- **Service Layer**: Calls FileManager, handles ValidationError and storage exceptions
- **Error Format**: RFC 9457 Problem Details
- **Note**: Content parsing validation will be added in future ticket

### API Contract Design
- **Endpoint**: POST `/api/v1/invocations` (extend existing)
- **Schema**: OpenAPI 3.1.0 with multipart/form-data
- **Parameters**:
  - `prompt` (form field, required)
  - `files` (file upload array, optional, max 10 files by default)
  - `session_id` (form field, required)
  - `context_data` (form field, optional JSON)
- **Backward Compatible**: Files parameter is optional

## Architecture Decisions

### Service Layer Structure
```
InvocationAPI
  ↓
InvocationService (extended)
  ↓
FileManager (NEW - storage & validation only)
```

**Rationale**:
- Minimal changes to existing architecture
- File storage and validation encapsulated in dedicated service
- Parsing will be added to FileManager in future ticket

### File Processing Flow (This Ticket)
1. **Upload**: API receives multipart request with 1-10 files
2. **Forward**: API forwards request to InvocationService
3. **Validate & Store**: InvocationService calls FileManager.validate_and_save_files() which:
   - Validates file count (≤ 10 files)
   - For each file: validates size (≤ 10MB) and MIME type using python-magic
   - Saves each file to `{storage_dir}/nexus-{invocation_id}-{filename}` (storage_dir from config, default `/tmp`)
   - Returns list of FileMetadata with file_path and status="pending_parse"
4. **Metadata**: InvocationService builds file_metadata array for context_data
5. **Database**: Store file_metadata array in context_data
6. **Response**: Return 202 Accepted with invocation details

**Future Ticket**: Parsing flow will iterate over file_metadata array, parse each file from file_path, store chunks in Context Manager, delete files

### Error Handling
- **400 Bad Request**: Validation errors (file count, size, MIME type)
- **500 Internal Server Error**: File save failures (disk full, permission denied, I/O errors) with generic message to client
- **RFC 9457 Format**: All error responses
- **Error Examples**:
  - Too many files: "Uploaded 15 files, but maximum allowed is 10 files per invocation (configurable via file_upload_max_files)"
  - File too large: "Uploaded file size (15MB) exceeds maximum allowed size (10MB)"
  - Unsupported format: "File type 'image/png' is not supported. Supported formats: PDF, DOC, DOCX, TXT, MD"
  - Storage failure (client sees): "500 Internal Server Error - Failed to process file upload"
  - Storage failure (logged internally): "Failed to save file 'document.pdf' to /tmp/nexus-{id}-document.pdf: [Errno 28] No space left on device"

## Integration Points

### Existing Services (Modified)
- **InvocationService**:
  - Accept optional `list[UploadFile]` parameter
  - Call FileManager.validate_and_save_files() when files present
  - Handle ValidationError from FileManager (propagate to API for 400 response)
  - Handle storage exceptions from FileManager (propagate to API for 500 response)
  - Embed file_metadata array in `context_data`

### New Services
- **FileManager** (This Ticket):
  ```python
  async def validate_and_save_files(
      files: list[UploadFile],
      invocation_id: str
  ) -> list[FileMetadata]
  ```
  - Validates file count (max 10 files, configurable)
  - For each file: validates size and MIME type
  - Saves all files to storage directory
  - Returns: List of FileMetadata with filename, size_bytes, mime_type, file_path, status="pending_parse"
  - Raises: ValidationError for count/size/MIME violations

  Called by InvocationService with the full list of uploaded files.

**Future Ticket**: Add `parse_file()` method to FileManager

## Performance Considerations

### File Size Limits
- **Default**: 10 MB (configurable)
- **Validation**: Before full upload (streaming)
- **Memory**: Minimal via streaming to temp file

### Streaming Upload
- **Buffer**: 8KB chunks
- **Async I/O**: Non-blocking using `aiofiles` library
- **File Save**: Direct write to `/tmp` directory
- **Latency**: No specific target - network dependent (variable based on client connection)

### Database Impact
- **Minimal**: Only file metadata array in JSONB (~200 bytes per file, max ~2KB for 10 files)
- **No LOB**: No large binary storage
- **No Chunks in Invocation**: Chunks managed by Context Manager, not stored in invocation

## Security Considerations

### File Access Control
- **No Direct Access**: Files in temp directory, not web-accessible
- **File Isolation**: Files named with invocation_id to prevent conflicts

### Validation Security
- **MIME Verification**: Check magic bytes using python-magic
- **Path Sanitization**: Prevent directory traversal
- **Size Limits**: Prevent DoS

### Error Message Safety
- **No Path Disclosure**: Don't expose temp paths
- **No Stack Traces**: Sanitized exceptions
- **Actionable**: Guide user without revealing internals

## Testing Strategy

### Unit Tests
- **FileManager**: All validation (count, size, MIME type) and file save operations
- **Validation**: File count, size, and MIME type checking
- **Error Cases**: Too many files, invalid formats, size limit violations, storage failures

### Integration Tests
- **End-to-end**: Upload → validate → store → context
- **Error Scenarios**: Too many files, too large, unsupported format
- **Backward Compatibility**: Requests without files
- **Multiple Files**: Upload multiple files in single request

### Contract Tests
- **OpenAPI Schema**: Multipart compliance
- **RFC 9457**: Error format validation

## Dependencies

### New Python Packages
```toml
# MIME type detection
python-magic = "^0.4.27"

# Async file I/O
aiofiles = "^24.1.0"
```

### System Dependencies
- **libmagic**: For python-magic MIME type detection

## Open Questions Resolved

All clarifications completed:
- ✅ File size: Configurable, default 10 MB
- ✅ Formats: PDF, DOC/DOCX, TXT, MD (validation only, not parsing)
- ✅ **Storage: Temporary - saved to `/tmp`, not deleted in this ticket**
- ✅ Errors: Size and MIME type validation errors (400), storage failures return 500 with generic message
- ✅ Access: Not accessible after upload
- ✅ Async I/O: Use aiofiles for non-blocking file operations
- ✅ Logging: Log every file upload with metadata (filename, size, user, timestamp)
- ✅ Latency: No specific target - network dependent

## References

- FastAPI Files: https://fastapi.tiangolo.com/tutorial/request-files/
- OpenAPI Multipart: https://swagger.io/docs/specification/describing-request-body/multipart-requests/
- RFC 9457: https://www.rfc-editor.org/rfc/rfc9457.html
- Python tempfile: https://docs.python.org/3/library/tempfile.html

## Next Steps

Proceed to Phase 1: Design & Contracts
