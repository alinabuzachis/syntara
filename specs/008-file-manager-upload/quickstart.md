# Quickstart: Multiple File Attachments for Invocations

**Feature**: Multiple file attachment support for invocation API
**Purpose**: Integration test scenarios to validate end-to-end file upload, validation, storage, and metadata capture for 1-10 files per invocation

## Prerequisites

- Python 3.12+ environment with `uv`
- Running Nexus API server (`make dev`)
- Test files available in `tests/fixtures/files/`:
  - `sample.pdf` (valid PDF, ~500KB)
  - `sample.docx` (valid DOCX, ~200KB)
  - `sample.txt` (valid text file, ~10KB)
  - `sample.md` (valid markdown, ~5KB)
  - `image.png` (unsupported format for error testing, ~100KB)
  - Multiple sample files for multi-file upload testing (sample1.pdf through sample10.pdf, ~50KB each)

**Note**: The `large.pdf` file for size limit testing is generated dynamically in test setup (not committed to repository) to avoid storing large files in git.

**Note on Storage**: All examples show files stored to `/tmp` directory. This is the default value of the `file_upload_storage_dir` configuration setting. In production environments, this can be configured to a different directory.

## Test Scenarios

### Scenario 1: Upload Valid PDF File

**Goal**: Verify PDF file upload, validation, and storage

```bash
# Create test invocation with PDF attachment
curl -X POST http://localhost:8000/api/v1/invocations \
  -H "Authorization: Bearer $TOKEN" \
  -F "prompt=Analyze the attached document and summarize key points" \
  -F "created_by=$(uuidgen)" \
  -F "session_id=test-session-001" \
  -F "files=@tests/fixtures/files/sample.pdf"

# Expected Response: 202 Accepted
# {
#   "id": "550e8400-...",
#   "prompt": "Analyze the attached document...",
#   "status": "created",
#   "context_data": {
#     "file_metadata": [
#       {
#         "file_id": "550e8400-e29b-41d4-a716-446655440000",
#         "filename": "sample.pdf",
#         "size_bytes": 512000,
#         "mime_type": "application/pdf",
#         "status": "pending_parse"
#       }
#     ]
#   }
# }
#
# Note: file_path is stored internally but NOT exposed in API responses for security.
# Use file_id for public file references.
```

**Validation Steps**:
1. ✅ Response status is 202 Accepted
2. ✅ `context_data.file_metadata` is array with 1 element
3. ✅ `context_data.file_metadata[0]` present with correct filename and file_id
4. ✅ `context_data.file_metadata[0].status` is "pending_parse"
5. ✅ `file_path` is NOT present in response (security requirement)
6. ✅ File is stored internally but path not exposed to client

---

### Scenario 2: Upload DOCX File

**Goal**: Verify DOCX file upload and MIME type detection

```bash
curl -X POST http://localhost:8000/api/v1/invocations \
  -H "Authorization: Bearer $TOKEN" \
  -F "prompt=Extract action items from this document" \
  -F "created_by=$(uuidgen)" \
  -F "session_id=test-session-002" \
  -F "files=@tests/fixtures/files/sample.docx"

# Expected: 202 Accepted with file_metadata[0].mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
```

**Validation**:
1. ✅ DOCX mime type correctly identified
2. ✅ File saved to `/tmp` directory
3. ✅ `status` is "pending_parse"

---

### Scenario 3: Upload Text/Markdown Files

**Goal**: Verify plain text and markdown MIME type detection

```bash
# Test plain text
curl -X POST http://localhost:8000/api/v1/invocations \
  -H "Authorization: Bearer $TOKEN" \
  -F "prompt=Summarize this README" \
  -F "created_by=$(uuidgen)" \
  -F "session_id=test-session-003" \
  -F "files=@tests/fixtures/files/sample.txt"

# Test markdown
curl -X POST http://localhost:8000/api/v1/invocations \
  -H "Authorization: Bearer $TOKEN" \
  -F "prompt=Review this documentation" \
  -F "created_by=$(uuidgen)" \
  -F "session_id=test-session-004" \
  -F "files=@tests/fixtures/files/sample.md"
```

**Validation**:
1. ✅ Text file MIME type correctly identified (text/plain)
2. ✅ Markdown file MIME type correctly identified (text/markdown or text/plain)
3. ✅ Files saved to `/tmp` directory

---

### Scenario 4: Invocation Without Files (Backward Compatibility)

**Goal**: Verify existing functionality still works without files

```bash
curl -X POST http://localhost:8000/api/v1/invocations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is the weather today?",
    "createdBy": "550e8400-e29b-41d4-a716-446655440000",
    "sessionId": "test-session-005"
  }'

# Expected: 202 Accepted with empty context_data (no file fields)
```

**Validation**:
1. ✅ Response status is 202 Accepted
2. ✅ `context_data` is empty object `{}`
3. ✅ No `file_metadata` field

---

### Scenario 5: File Too Large Error

**Goal**: Verify size limit validation (default 10MB)

**Note**: Generate a large file dynamically in your test setup (see integration test for implementation)

```bash
# Example with dynamically generated 15MB file
curl -X POST http://localhost:8000/api/v1/invocations \
  -H "Authorization: Bearer $TOKEN" \
  -F "prompt=Analyze this large document" \
  -F "created_by=$(uuidgen)" \
  -F "session_id=test-session-006" \
  -F "files=@/tmp/large.pdf"

# Expected: 400 Bad Request
# {
#   "error": "File Too Large",
#   "detail": "Uploaded file size (15728640 bytes) exceeds maximum allowed size (10485760 bytes / 10 MB)"
# }
```

**Validation**:
1. ✅ Response status is 400 Bad Request
2. ✅ Error message includes actual file size
3. ✅ Error message includes configured limit
4. ✅ No invocation created in database

---

### Scenario 6: Unsupported File Format Error

**Goal**: Verify file type validation

```bash
curl -X POST http://localhost:8000/api/v1/invocations \
  -H "Authorization: Bearer $TOKEN" \
  -F "prompt=Analyze this image" \
  -F "created_by=$(uuidgen)" \
  -F "session_id=test-session-007" \
  -F "files=@tests/fixtures/files/image.png"

# Expected: 400 Bad Request
# {
#   "error": "Unsupported File Format",
#   "detail": "File type 'image/png' is not supported. Supported formats: PDF, DOC, DOCX, TXT, MD"
# }
```

**Validation**:
1. ✅ Response status is 400 Bad Request
2. ✅ Error lists supported formats
3. ✅ No invocation created

---

### Scenario 7: Too Many Files Error

**Goal**: Verify max files per invocation limit (default 10)

```bash
# Attempt to upload 15 files (exceeds limit of 10)
curl -X POST http://localhost:8000/api/v1/invocations \
  -H "Authorization: Bearer $TOKEN" \
  -F "prompt=Analyze all these documents" \
  -F "created_by=$(uuidgen)" \
  -F "session_id=test-session-008" \
  -F "files=@tests/fixtures/files/sample1.pdf" \
  -F "files=@tests/fixtures/files/sample2.pdf" \
  -F "files=@tests/fixtures/files/sample3.pdf" \
  -F "files=@tests/fixtures/files/sample4.pdf" \
  -F "files=@tests/fixtures/files/sample5.pdf" \
  -F "files=@tests/fixtures/files/sample6.pdf" \
  -F "files=@tests/fixtures/files/sample7.pdf" \
  -F "files=@tests/fixtures/files/sample8.pdf" \
  -F "files=@tests/fixtures/files/sample9.pdf" \
  -F "files=@tests/fixtures/files/sample10.pdf" \
  -F "files=@tests/fixtures/files/sample11.pdf" \
  -F "files=@tests/fixtures/files/sample12.pdf" \
  -F "files=@tests/fixtures/files/sample13.pdf" \
  -F "files=@tests/fixtures/files/sample14.pdf" \
  -F "files=@tests/fixtures/files/sample15.pdf"

# Expected: 400 Bad Request
# {
#   "error": "Too Many Files",
#   "detail": "Uploaded 15 files, but maximum allowed is 10 files per invocation (configurable via file_upload_max_files)"
# }
```

**Validation**:
1. ✅ Response status is 400 Bad Request
2. ✅ Error message includes actual file count (15)
3. ✅ Error message includes configured limit (10)
4. ✅ No invocation created in database

---

### Scenario 8: File Storage Verification (Backend/Testing Only)

**Goal**: Verify files are saved to storage directory (backend verification only)

**Note**: This scenario is for backend/testing verification only. The `file_path` is NOT exposed in API responses for security reasons. This verification requires backend access to the storage directory.

```bash
# Create invocation with file
RESPONSE=$(curl -X POST http://localhost:8000/api/v1/invocations \
  -H "Authorization: Bearer $TOKEN" \
  -F "prompt=Test file storage" \
  -F "created_by=$(uuidgen)" \
  -F "session_id=test-session-009" \
  -F "files=@tests/fixtures/files/sample.pdf")

INVOCATION_ID=$(echo $RESPONSE | jq -r '.id')
FILE_ID=$(echo $RESPONSE | jq -r '.context_data.file_metadata[0].file_id')

# Note: file_path is NOT in API response (security requirement)
# For testing, verify file exists in storage directory directly

# Get the actual temp directory (system-dependent)
TEMP_DIR=$(python3 -c "import tempfile; print(tempfile.gettempdir())")

# Verify file exists (use quotes to prevent glob expansion issues in zsh)
ls -la "$TEMP_DIR"/nexus-${INVOCATION_ID}-*

# Expected: File exists at {temp_dir}/nexus-{invocation_id}-sample.pdf
# Example paths:
#   Linux:  /tmp/nexus-{invocation_id}-sample.pdf
#   macOS:  /var/folders/.../T/nexus-{invocation_id}-sample.pdf
```

**Validation**:
1. ✅ File saved to storage directory (default `/tmp`)
2. ✅ File path includes invocation ID in filename (backend only)
3. ✅ Response includes `file_id` (public identifier)
4. ✅ Response does NOT include `file_path` (security requirement)
5. ✅ File is NOT deleted (will be handled in future parsing ticket)

---

### Scenario 9: Concurrent File Uploads

**Goal**: Verify system handles concurrent file uploads

```bash
# Launch 5 concurrent uploads
for i in {1..5}; do
  curl -X POST http://localhost:8000/api/v1/invocations \
    -H "Authorization: Bearer $TOKEN" \
    -F "prompt=Concurrent test $i" \
    -F "created_by=$(uuidgen)" \
    -F "session_id=test-session-concurrent-$i" \
    -F "files=@tests/fixtures/files/sample.pdf" &
done

wait

# Expected: All 5 return 202 Accepted
```

**Validation**:
1. ✅ All requests succeed with 202 Accepted
2. ✅ No file conflicts (unique filenames with invocation_id)
3. ✅ All files saved to storage directory (backend verification)
4. ✅ Each response includes unique file_id (no file_path exposed)

---

### Scenario 10: Multiple Files Upload

**Goal**: Verify uploading multiple files (3 files) in a single request

```bash
curl -X POST http://localhost:8000/api/v1/invocations \
  -H "Authorization: Bearer $TOKEN" \
  -F "prompt=Analyze all these related documents together" \
  -F "created_by=$(uuidgen)" \
  -F "session_id=test-session-multi-010" \
  -F "files=@tests/fixtures/files/sample.pdf" \
  -F "files=@tests/fixtures/files/sample.docx" \
  -F "files=@tests/fixtures/files/sample.txt"

# Expected Response: 202 Accepted
# {
#   "id": "550e8400-...",
#   "prompt": "Analyze all these related documents together",
#   "status": "created",
#   "context_data": {
#     "file_metadata": [
#       {
#         "file_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
#         "filename": "sample.pdf",
#         "size_bytes": 512000,
#         "mime_type": "application/pdf",
#         "status": "pending_parse"
#       },
#       {
#         "file_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
#         "filename": "sample.docx",
#         "size_bytes": 204800,
#         "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
#         "status": "pending_parse"
#       },
#       {
#         "file_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
#         "filename": "sample.txt",
#         "size_bytes": 10240,
#         "mime_type": "text/plain",
#         "status": "pending_parse"
#       }
#     ]
#   }
# }
#
# Note: file_path is stored internally but NOT exposed in API responses for security.
```

**Validation**:
1. ✅ Response status is 202 Accepted
2. ✅ `context_data.file_metadata` is array with 3 elements
3. ✅ Each file in array has correct file_id, filename, size, mime_type
4. ✅ All files have status="pending_parse"
5. ✅ `file_path` is NOT present in response (security requirement)
6. ✅ Each file has unique file_id for public references

---

### Scenario 11: Context Data Integration

**Goal**: Verify file metadata available in invocation context

**Note**: The actual API does NOT expose `file_path` for security. The example below shows the correct API response structure.

```python
# Integration test (Python)
import httpx

async def test_context_includes_file_metadata():
    # Create invocation with file
    files = {"files": open("tests/fixtures/files/sample.pdf", "rb")}
    data = {
        "prompt": "Summarize the document",
        "created_by": str(uuid4()),
        "session_id": "test-session-011"
    }

    response = await client.post("/api/v1/invocations", data=data, files=files)
    assert response.status_code == 202

    invocation_id = response.json()["id"]

    # Retrieve invocation details
    invocation = await client.get(f"/api/v1/invocations/{invocation_id}")
    context_data = invocation.json()["context_data"]

    # Verify context structure
    assert "file_metadata" in context_data
    assert isinstance(context_data["file_metadata"], list)
    assert len(context_data["file_metadata"]) == 1
    assert context_data["file_metadata"][0]["status"] == "pending_parse"

    # Verify file metadata structure (API response)
    metadata = context_data["file_metadata"][0]
    assert "file_id" in metadata  # Public identifier
    assert "filename" in metadata
    assert "size_bytes" in metadata
    assert "mime_type" in metadata
    assert "status" in metadata

    # Security validation: file_path must NOT be in API response
    assert "file_path" not in metadata

    assert metadata["filename"] == "sample.pdf"
```

**Validation**:
1. ✅ File metadata array accessible via invocation API
2. ✅ file_metadata is array type
3. ✅ Metadata includes file_id (public identifier)
4. ✅ Metadata properly formatted with all required fields
5. ✅ status is "pending_parse" for each file
6. ✅ file_path is NOT in response (security requirement verified)
7. ✅ Chunks managed by Context Manager (not in invocation)

---

## Automated Test Suite

Run all quickstart scenarios as integration tests:

```bash
# Run file upload integration tests
uv run pytest tests/integration/file_upload/test_all.py -v

# Expected output (9 tests):
# test_upload_pdf_file PASSED
# test_upload_docx_file PASSED
# test_upload_text_and_markdown PASSED
# test_invocation_without_files PASSED
# test_file_too_large_error PASSED
# test_unsupported_format_error PASSED
# test_too_many_files_error PASSED
# test_multiple_files_upload PASSED
# test_context_metadata PASSED
```

## File Storage

After testing, verify files are properly stored:

```bash
# Get the system temp directory
TEMP_DIR=$(python3 -c "import tempfile; print(tempfile.gettempdir())")

# Check for uploaded files
find "$TEMP_DIR" -name "nexus-*" -type f | head -20

# Expected: Files present in temp directory (cleanup will be added in future parsing ticket)
# Example locations:
#   Linux:  /tmp/nexus-*
#   macOS:  /var/folders/.../T/nexus-*
```

## Summary

This quickstart validates:
- ✅ Multiple file upload (1-10 files) with multipart/form-data
- ✅ All supported formats (PDF, DOCX, TXT, MD) - MIME type detection only
- ✅ File validation (count, size, and MIME type)
- ✅ File storage to configurable directory (default `/tmp` via file_upload_storage_dir)
- ✅ File metadata array capture in context_data
- ✅ Error handling (size limit, unsupported format, too many files)
- ✅ Backward compatibility (no files)
- ✅ Concurrent upload handling
- ✅ File metadata array accessible via API
- ✅ Multiple files in single request
- ✅ **Security**: file_path NOT exposed in API responses (file_id used instead)

**Note**: File parsing and cleanup will be added in a future ticket

**Security Note**: All API responses use `file_id` for public file references. The `file_path` is stored internally but NEVER exposed in API responses to prevent filesystem disclosure.

**Status**: Implementation complete and verified
