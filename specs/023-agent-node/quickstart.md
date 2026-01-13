# Quickstart: Agent Node with File Context Support

**Feature**: 023-agent-node
**Date**: 2025-12-11
**Updated**: 2025-12-17

---

## Overview

This guide demonstrates how to use the Agent Node with file attachments to provide additional context for AI agent execution.

**Key Pattern:** Files can be uploaded in two ways:
1. **Design time** (recommended): Upload via `/api/v1/files` endpoint, store returned `file_ids` in workflow configuration, pass `file_ids` to invocations at runtime
2. **Runtime**: Upload files directly with `POST /api/v1/invocations` using multipart/form-data

In both cases, file metadata is stored in the `FileMetadata` database table. At execution time, the agent retrieves converted content from the filesystem via `converted_content_path` (protects DB from bloat).

---

## Prerequisites

1. Nexus API running locally (`make run-api`)
2. Test files available (PDF, TXT, MD, DOC, or DOCX)
3. Valid authentication token

---

## Usage Scenarios

### 1. Upload Files (Design Time)

Upload files independently before configuring workflows:

```bash
# Upload files via POST /api/v1/files
curl -X POST "http://localhost:8000/api/v1/files" \
  -H "Authorization: Bearer $TOKEN" \
  -F "files=@/path/to/requirements.pdf" \
  -F "files=@/path/to/notes.txt"

# Response (HTTP 200):
# {
#   "file_ids": [
#     "550e8400-e29b-41d4-a716-446655440001",
#     "550e8400-e29b-41d4-a716-446655440002"
#   ],
#   "files": [
#     {
#       "file_id": "550e8400-e29b-41d4-a716-446655440001",
#       "filename": "requirements.pdf",
#       "size_bytes": 1048576,
#       "mime_type": "application/pdf",
#       "status": "pending_conversion"
#     },
#     {
#       "file_id": "550e8400-e29b-41d4-a716-446655440002",
#       "filename": "notes.txt",
#       "size_bytes": 2048,
#       "mime_type": "text/plain",
#       "status": "pending_conversion"
#     }
#   ]
# }
```

**Save the `file_ids` - these are used to reference the files in invocations!**

### 2a. Invoke Agent with File References (Pre-uploaded)

Pass `file_ids` when invoking the agent (files already uploaded via `/api/v1/files`):

```bash
# Invoke agent with file_ids in context_data
curl -X POST "http://localhost:8000/api/v1/invocations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Summarize the key points from the attached documents",
    "sessionId": "test-session-001",
    "createdBy": "550e8400-e29b-41d4-a716-446655440000",
    "contextData": {
      "file_ids": [
        "550e8400-e29b-41d4-a716-446655440001",
        "550e8400-e29b-41d4-a716-446655440002"
      ]
    }
  }'

# Response (HTTP 202):
# {
#   "id": "770e8400-e29b-41d4-a716-446655440003",
#   "status": "created",
#   "prompt": "Summarize the key points from the attached documents"
# }
```

### 2b. Invoke Agent with Runtime File Uploads

Alternatively, upload files directly with the invocation (runtime upload):

```bash
# Upload files and invoke in a single request (multipart/form-data)
curl -X POST "http://localhost:8000/api/v1/invocations" \
  -H "Authorization: Bearer $TOKEN" \
  -F "prompt=Summarize these documents" \
  -F "sessionId=test-session-002" \
  -F "createdBy=550e8400-e29b-41d4-a716-446655440000" \
  -F "files=@/path/to/document.pdf" \
  -F "files=@/path/to/notes.txt"

# Response (HTTP 202):
# {
#   "id": "770e8400-e29b-41d4-a716-446655440004",
#   "status": "created",
#   "prompt": "Summarize these documents"
# }
```

**Note:** Runtime uploads create `FileMetadata` records in the database (same as design-time uploads). Files are converted before agent execution begins. Use design-time uploads (section 1) when you want to reuse files across multiple invocations.

### 2c. Invoke Agent with Both Pre-uploaded and New Files

Combine pre-uploaded `file_ids` with new file uploads in a single request:

```bash
# Reference existing files AND upload new files in one request
curl -X POST "http://localhost:8000/api/v1/invocations" \
  -H "Authorization: Bearer $TOKEN" \
  -F "prompt=Compare the existing analysis with the new data" \
  -F "sessionId=test-session-003" \
  -F "createdBy=550e8400-e29b-41d4-a716-446655440000" \
  -F 'contextData={"file_ids": ["550e8400-e29b-41d4-a716-446655440001"]}' \
  -F "files=@/path/to/new_data.csv"

# Response (HTTP 202):
# {
#   "id": "770e8400-e29b-41d4-a716-446655440005",
#   "status": "created",
#   "prompt": "Compare the existing analysis with the new data"
# }
```

**Behavior:**
- Pre-uploaded files (via `file_ids`) are used immediately (already converted)
- New files are stored in `FileMetadata`, converted, then execution proceeds
- Agent receives content from all files (both pre-uploaded and newly uploaded)

### 3. Monitor Async Execution via Workflow

The agent executes asynchronously and signals completion via callback. In a workflow context:

```python
# In agentic_activity.py - Workflow execution pattern
import asyncio
from temporalio import workflow

async def execute_agentic_activity(config: AgenticExecutorConfig) -> dict:
    # Generate callback URL for this specific activity
    callback_url = await generate_activity_signal_url(execution_id, activity_id)

    # Invoke agent asynchronously with callback URL
    response = await client.invoke_agent_async(
        prompt=config.prompt,
        file_ids=config.file_ids,
        metadata={"callback_url": callback_url}
    )

    print(f"Agent invoked: {response['id']}, status: {response['status']}")

    # Wait for signal from Agent Orchestrator
    signal_data = await workflow.wait_condition(
        lambda: activity_id in workflow._activity_signals,
        timeout=timedelta(seconds=config.timeout)
    )

    print(f"Agent completed: {signal_data['status']}")
    return signal_data

# Note: Agent Orchestrator calls back to callback_url when execution completes
# The workflow continues automatically when the signal is received
```

### 4. Invoke Agent via Python Client (Async Pattern)

```python
from nexus.workflows.clients.agent_orchestrator_client import AgentOrchestratorClient

async def invoke_with_file_context_async():
    async with AgentOrchestratorClient() as client:
        # Generate callback URL (normally handled by workflow activity)
        callback_url = "http://localhost:8000/api/v1/executions/exec-123/activities/act-456/signal"

        response = await client.invoke_agent_async(
            prompt="Analyze the documents and identify key themes",
            user_id="user-123",
            file_ids=[
                "550e8400-e29b-41d4-a716-446655440001",
                "550e8400-e29b-41d4-a716-446655440002"
            ],
            metadata={"callback_url": callback_url},
            timeout_seconds=120.0,
        )

        print(f"Invocation ID: {response['id']}")
        print(f"Status: {response['status']}")  # "pending"
        print("Agent is executing asynchronously...")
        print(f"Will callback to: {callback_url}")

# Usage
import asyncio
asyncio.run(invoke_with_file_context_async())

# Note: In real usage, workflow.wait_condition() handles waiting for the callback
# The agent executes independently and POSTs to callback_url when done
```

### 5. Configure Agent Node in Workflow YAML

```yaml
# workflow.yaml
name: document-analysis-workflow
version: "1.0"

activities:
  - name: analyze-documents
    type: agentic
    config:
      prompt: |
        Analyze the attached documents and provide:
        1. A summary of each document
        2. Key themes across all documents
        3. Any conflicting information found
      agent: document-analyst
      model: anthropic/claude-3.5-sonnet
      timeout: 300
      file_ids: "${inputs.file_ids}"  # From Agent Node config (files uploaded via UI)
```

```python
# Execute workflow with file_ids (files already uploaded)
from nexus.workflows import WorkflowEngine

engine = WorkflowEngine()
result = await engine.execute(
    workflow="document-analysis-workflow",
    inputs={
        "file_ids": [
            "550e8400-e29b-41d4-a716-446655440001",
            "550e8400-e29b-41d4-a716-446655440002"
        ]
    }
)
```

---

## Validation Checklist

Run these tests to verify the feature works correctly:

### Unit Tests
```bash
# Test Files API endpoint
pytest tests/unit/api/v1/test_files.py -v

# Test AgentOrchestratorClient async callbacks
pytest tests/unit/workflows/clients/test_agent_orchestrator_client.py -v
```

### Integration Tests
```bash
# Test end-to-end flow with files
pytest tests/integration/workflow/test_agentic_activity_with_files.py -v
```

### Manual Validation

1. **Single file upload**:
   - Upload a PDF file via POST /api/v1/files
   - Verify `file_id` is returned
   - Save the `file_id` for later use

2. **Invoke with file_ids**:
   - POST to /invocations with `file_ids` in `contextData`
   - Verify agent response references file content

3. **Multiple files**:
   - Upload 3 different text files via POST /api/v1/files
   - Invoke agent with all 3 `file_ids`
   - Verify agent can reference content from all files

4. **Runtime file upload**:
   - POST to /invocations with files in multipart/form-data (no pre-upload)
   - Verify invocation is created and files are converted
   - Verify agent response references file content

5. **Combined file_ids and upload**:
   - Upload one file via POST /api/v1/files, save the file_id
   - POST to /invocations with both `file_ids` in contextData AND new files in multipart
   - Verify agent receives content from both pre-uploaded and newly uploaded files

6. **File validation**:
   - Attempt to upload an unsupported file type (e.g., .exe)
   - Verify HTTP 400 error with descriptive message

7. **Size limit**:
   - Attempt to upload a file > 10 MB
   - Verify HTTP 400 error with size limit message

8. **Invalid file_id**:
   - Invoke with a non-existent `file_id`
   - Verify appropriate error is returned

9. **Async callback completion**:
   - Create invocation with file_ids and callback_url
   - Verify invocation returns immediately with pending status
   - Verify agent calls back to callback_url when complete

---

## Frontend Usage (nexus-ui)

### 6. Configure Agent Node with Files in Workflow Builder

**Manual UI Validation Steps:**

1. Open the Workflow Builder in nexus-ui
2. Drag an "AI Agent" node onto the canvas
3. Click the node to open the configuration form
4. In the "Files" section:
   - Drag and drop files onto the upload area, OR
   - Click "Browse" to select files via file picker
5. Verify upload progress is displayed for each file
6. Verify uploaded files appear in a list with:
   - Filename
   - File size
   - Status indicator
   - Remove button (X)
7. Click remove (X) on a file to verify it can be removed
8. Configure the prompt and other agent settings
9. **Before saving**, attempt to navigate away (click browser back or close tab)
10. Verify browser displays confirmation dialog warning about unsaved changes
11. Cancel navigation and return to workflow builder
12. Save the workflow
13. Re-open the workflow and verify the attached files are still listed

**Expected Behavior:**
- Files upload immediately on selection (POST to `/api/v1/files`)
- Maximum 10 files per agent node
- Maximum 10 MB per file
- Allowed types: PDF, DOC, DOCX, TXT, MD
- Invalid files show clear error messages
- File references (`file_ids`) persist with the workflow configuration

---

## Troubleshooting

### File upload fails with 400 error
- Check file size (max 10 MB per file)
- Check file type (PDF, DOC, DOCX, TXT, MD only)
- Verify file is not corrupted
- Check file count (max 10 files per upload request)

### Workflow save fails with validation error
- Check `file_ids` count in AgenticExecutorConfig (max 10 files per agent node, enforced at design time via `max_length=10`)
- Verify each `file_id` references an existing file (the Workflow save API validates file existence before saving)

### Invocation fails with file_id not found
- Verify `file_id` is a valid UUID
- Verify the file was successfully uploaded
- Check that you're using the correct file_id from the upload response

### Callback timeout or missing signal
- Check callback_url is reachable from Agent Orchestrator
- Verify invocation ID is valid UUID
- Verify invocation exists and is not expired
- Check workflow signal timeout settings

### Agent doesn't see file content
- Verify file was successfully uploaded (check response from /files)
- For PDF/DOCX, ensure document conversion completed (conversion happens at upload time, not at invocation)
- Check file content is not empty
- Verify `file_ids` were passed in `contextData`

---

## Success Criteria

### Backend
- [ ] Files can be uploaded via POST /api/v1/files endpoint (design time)
- [ ] Files can be uploaded via POST /api/v1/invocations with multipart/form-data (runtime)
- [ ] Files are validated (size, type, count)
- [ ] `FileMetadata` records are created in the database (both upload methods)
- [ ] `file_ids` are returned for later reference
- [ ] Document conversion updates `FileMetadata.status` in database
- [ ] Invocations can be created with `file_ids` in context
- [ ] Agent retrieves file content by querying `FileMetadata` table
- [ ] Agent receives file content (loaded from `converted_content_path` on filesystem)
- [ ] Async callbacks deliver completion signals via HTTP POST to callback URLs
- [ ] Client accumulates events and returns final result
- [ ] Workflow activities can specify `file_ids` in config
- [ ] `Invocation.context_data` only contains `file_ids`, not full metadata

### Frontend
- [ ] FileUpload component supports drag-and-drop file selection
- [ ] FileUpload component supports manual file picker selection
- [ ] File upload progress is displayed for each file
- [ ] Validation errors are displayed inline (wrong type, too large, too many)
- [ ] Attached files are displayed in a list with remove capability
- [ ] `file_ids` are persisted when saving Agent Node configuration
- [ ] AIAgentNodeForm integrates file upload section
- [ ] Files API service handles multipart upload correctly
