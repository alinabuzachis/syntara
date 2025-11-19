# Agent Invocation Document Conversion Quickstart Guide

**Updated**: 2025-11-19 - Agent Invocation Integration with FileMetadata Detection

## Overview

The document conversion component integrates with the existing agent invocation system to convert documents using FastAPI Background Tasks. Files are uploaded, FileMetadata objects are created, and conversion is triggered through the `invoke_agent` endpoint with background processing.

## Agent Invocation Integration Workflow

Document conversion is triggered through the existing agent invocation system (FR-014, FR-015):

1. **File Attachment**: Files attached to `POST /api/v1/invocations` create FileMetadata objects with status="pending_parse"
2. **Background Processing**: FastAPI Background Tasks process conversions asynchronously, updating FileMetadata status (FR-015)
3. **Execution Gating**: Invocation CANNOT execute while ANY FileMetadata has status="pending_parse" or "converting" (FR-018)
4. **Terminal State Check**: Invocation CAN execute only when ALL FileMetadata reach terminal status ("converted" or "conversion_failed") (FR-019)
5. **Failure Handling**: Conversion failures are logged but allow invocation execution to proceed (FR-020)
6. **Status Tracking**: Poll `GET /api/v1/invocations/{id}` for both conversion progress and invocation execution status (FR-017)

## Agent Integration Usage

### Client Integration Example

```python
import requests
import time
from typing import Dict, Any, List

# Step 1: Create invocation with file attachment (per specs/008-file-manager-upload)
# Files are attached directly to invocation request via multipart form-data
with open('document.pdf', 'rb') as file:
    files = {'file': file}
    data = {
        'prompt': 'Convert the attached document to markdown format',
        'sessionId': 'doc-conversion-session'
    }

    # Call invoke_agent endpoint with file attachment (creates FileMetadata automatically)
    # This triggers background conversion when FileMetadata objects are detected (FR-016)
    response = requests.post('/api/v1/invocations', files=files, data=data)
invocation = response.json()
print(f"Conversion started - Invocation ID: {invocation['id']}")

# Step 2: Background task processing happens automatically (no user action required)
# FastAPI Background Tasks process document conversion asynchronously

# Step 3: Poll for completion (FR-017)
def check_conversion_status(invocation_id: str) -> Dict[str, Any]:
    """Poll invocation status for conversion progress."""
    status_response = requests.get(f'/api/v1/invocations/{invocation_id}')
    return status_response.json()

# Wait for invocation completion (which includes document conversion)
def wait_for_invocation_completion(invocation_id: str, timeout: int = 60) -> Dict[str, Any]:
    """Wait for invocation to complete (including document conversion gating)."""
    start_time = time.time()

    while time.time() - start_time < timeout:
        invocation = check_conversion_status(invocation_id)

        print(f"Invocation Status: {invocation['status']}")

        # Check document conversion progress in context_data
        if 'context_data' in invocation and 'file_metadata' in invocation['context_data']:
            for file_meta in invocation['context_data']['file_metadata']:
                print(f"  📄 {file_meta['filename']}: {file_meta['status']}")

        if invocation['status'] == 'COMPLETED':
            print(f"✅ Invocation completed successfully!")

            # Check conversion results in context_data.file_metadata[].conversion
            if 'context_data' in invocation and 'file_metadata' in invocation['context_data']:
                for file_meta in invocation['context_data']['file_metadata']:
                    if file_meta['status'] == 'converted' and 'conversion' in file_meta:
                        conversion = file_meta['conversion']
                        print(f"📄 Output file: {conversion['output_path']}")
                        print(f"⏱️ Conversion time: {conversion['conversion_time_ms']}ms")

            return invocation

        elif invocation['status'] == 'FAILED':
            print(f"❌ Invocation failed: {invocation.get('error_message', 'Unknown error')}")
            raise Exception(f"Invocation failed: {invocation.get('error_message', 'Unknown error')}")

        elif invocation['status'] == 'CREATED':
            print("⏳ Waiting for document conversion to complete...")
        elif invocation['status'] == 'RUNNING':
            print("🔄 Agent processing in progress...")

        time.sleep(1)  # Poll every second

    raise TimeoutError(f"Invocation timed out after {timeout} seconds")

# Execute conversion and wait for result
try:
    invocation_result = wait_for_invocation_completion(invocation['id'])
    print("✅ Document conversion completed via agent invocation!")
except Exception as e:
    print(f"Error during conversion: {e}")
```

### Error Handling Example

```python
# Example of handling conversion errors gracefully
def convert_document_safe(file_path: str) -> Dict[str, Any]:
    """Safely convert document with comprehensive error handling."""

    try:
        # Create invocation with file attachment (correct approach per specs/008-file-manager-upload)
        with open(file_path, 'rb') as f:
            files = {'file': f}
            data = {
                'prompt': 'Convert document to markdown',
                'sessionId': f'conversion-{int(time.time())}'
            }

            # Single request with file attachment - creates FileMetadata automatically
            response = requests.post('/api/v1/invocations', files=files, data=data)
        if response.status_code != 202:
            return {"success": False, "error": "Invocation creation failed"}

        invocation = response.json()

        # Wait for completion
        result = wait_for_invocation_completion(invocation['id'], timeout=30)
        return {"success": True, "result": result}

    except FileNotFoundError:
        return {"success": False, "error": "Input file not found"}
    except TimeoutError:
        return {"success": False, "error": "Conversion timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}

# Usage
result = convert_document_safe("my_document.pdf")
if result["success"]:
    print(f"Success: {result['result']['metadata']['output_path']}")
else:
    print(f"Error: {result['error']}")
```

## FileMetadata Status and Error Handling

### Supported MIME Types

The system supports conversion for these document types:
- `application/pdf` → PypandocConverter
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` → PypandocConverter  
- `application/msword` → PypandocConverter
- `text/plain` → TextConverter
- `text/markdown` → MarkdownConverter (no-op)

### FileMetadata Status Values

- `pending_parse`: File uploaded, awaiting conversion
- `converting`: Conversion in progress via background task
- `converted`: Conversion completed successfully
- `conversion_failed`: Conversion failed (logged but doesn't block invocation)

### Error Types

Document conversion failures are categorized as:
- **Unsupported MIME type**: File format not supported for conversion
- **File size limit exceeded**: File larger than configured maximum (default 10MB)
- **File access errors**: Cannot read file due to permissions or storage issues
- **Conversion library errors**: PDF/DOCX corruption or unsupported features

## Next Steps

After completing the setup:

1. **Implement BaseRetriever Enhancements**: Add `load_file()`, `file_exists()`, `get_file_metadata()` methods
2. **Refactor FileManager**: Make `_get_retriever_for_file()` public → `get_retriever_for_file()`
3. **Enhance Agent Invocation System**: Implement T003A-T003D tasks for background task integration
4. **Test Agent Integration Workflow**: Upload files and trigger conversions via `/api/v1/invocations` endpoint
5. **Monitor Performance**: Use NFR-004 detailed logging to track conversion metrics
6. **Add Converter Types**: Implement additional DocumentConverter classes for new MIME types

The document conversion component is now fully integrated with the agent invocation system using FastAPI Background Tasks, providing asynchronous document processing through the existing agent orchestration infrastructure.
