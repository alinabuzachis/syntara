# Document Conversion Data Model

**Updated**: 2025-11-19 - Agent Invocation Integration with FileMetadata Detection

## Core Entities

### FileMetadata (Shared with file-manager-upload)
The document conversion component reuses the FileMetadata structure from the file-manager-upload component with status extensions for conversion tracking.

```python
# From agent_orchestrator.context_manager.file_manager
# Base structure (already exists in file-manager-upload)
@dataclass
class FileMetadata:
    """Metadata for uploaded files, extended for conversion tracking."""

    filename: str
    """Original filename of the uploaded file."""

    size_bytes: int
    """Size of the file in bytes."""

    mime_type: str
    """MIME type detected via python-magic."""

    file_path: str
    """Path to the stored file in temporary storage."""

    status: str
    """Processing status of the file."""

    # Extended fields for conversion tracking
    conversion: Optional[Dict[str, Any]] = None
    """Optional conversion metadata when status is 'converted' or 'conversion_failed'."""

# Extended status values for conversion:
# - "pending_parse" (from upload)
# - "converting" (conversion in progress)  
# - "converted" (conversion completed successfully)
# - "conversion_failed" (conversion failed)

# Example conversion metadata structure:
conversion_metadata_example = {
    "output_filename": "document.md",
    "output_path": "/output/documents/document.md",
    "converted_at": "2025-11-19T10:30:00Z",
    "conversion_time_ms": 1250,
    "error_message": None  # Only present if status="conversion_failed"
}
```

### Invocation Integration (Agent System)

Document conversion integrates with the existing Invocation model for status tracking and result management, following the architectural decision for agent invocation system integration.

```python
# From nexus.agent_orchestrator.models.invocation
from typing import Optional, Dict, Any, List
from uuid import UUID
from enum import Enum

class InvocationStatus(str, Enum):
    """Status values for invocation tracking."""
    CREATED = "created"
    RUNNING = "running"  
    COMPLETED = "completed"
    FAILED = "failed"

@dataclass  
class Invocation:
    """Enhanced to track document conversion operations per FR-017."""

    id: UUID
    prompt: str
    session_id: str
    context_data: Dict[str, Any]  # Contains FileMetadata objects per FR-016
    status: InvocationStatus  
    result: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    # Document conversion result structure when conversion completed:
    # result = {
    #     "type": "document_conversion",
    #     "content": "Document converted successfully to: /path/output.md",
    #     "metadata": {
    #         "output_filename": "document.md",
    #         "output_path": "/path/document.md",
    #         "conversion_time_ms": 1250,
    #         "original_filename": "document.pdf",
    #         "file_metadata_id": "550e8400-e29b-41d4-a716-446655440000"
    #     }
    # }
```
## Document Conversion Integration Workflow

Following the architectural decision (ADR 2025-11-19), document conversion integrates with the agent invocation system instead of polling-based processing:

### Workflow Steps

1. **Invocation Creation**: User calls `POST /api/v1/invocations`
2. **Conversion Detection**: InvocationService.create_invocation() creates FileMetadata objects (FR-016)  
3. **Background Task Scheduling**: FastAPI Background Tasks schedules document conversion (FR-015)
4. **Status Tracking**: Conversion progress tracked via Invocation.context_data.file_metadata.status (FR-017)
5. **Result Storage**: Conversion results stored in Invocation.context_data.file_metadata field


### Status Progression Mapping

| FileMetadata Status | Invocation Status | Execution Allowed | Description |
|-------------------|-------------------|------------------|-------------|
| pending_parse | CREATED           | ❌ NO | Invocation created, conversion not yet started |
| converting | CREATED           | ❌ NO | Background task processing conversion |
| converted | CREATED/RUNNING   | ✅ YES | Conversion successful, invocation can execute |
| conversion_failed | CREATED/RUNNING   | ✅ YES | Conversion failed but logged, invocation can execute without this document |

### Invocation Execution Gating Rules

- **BLOCKING**: Invocation CANNOT execute while ANY FileMetadata has status `pending_parse` or `converting`
- **ALLOWING**: Invocation CAN execute when ALL FileMetadata have terminal status (`converted` OR `conversion_failed`)
- **LOGGING**: Conversion failures are logged per NFR-004 but do not block invocation execution
- **AVAILABILITY**: Successfully converted documents are available to the agent, failed conversions are not

### ConversionConfig
Configuration object for document conversion operations.

```python
from dataclasses import dataclass
from typing import Optional, Set

@dataclass(frozen=True)
class ConversionConfig:
    """Configuration for document conversion operations."""

    max_file_size: int
    """Maximum file size in bytes (retrieved from system configuration)."""

    overwrite_existing: bool = True
    """Whether to overwrite existing output files without warning."""

    supported_mime_types: Optional[Set[str]] = None
    """Optional set of supported MIME types to restrict conversions."""

    def __post_init__(self):
        """Validate configuration after initialization."""
        if self.max_file_size <= 0:
            raise ValueError("max_file_size must be positive")
```


### ConversionResult
Transient result object for individual conversion operations.

```python
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from datetime import datetime

@dataclass(frozen=True)
class ConversionResult:
    """Transient result of a document conversion operation."""

    success: bool
    """Whether the conversion completed successfully."""

    file_metadata: FileMetadata
    """Source FileMetadata object that was processed."""

    conversion_time: datetime
    """Timestamp when conversion was completed."""

    error_message: Optional[str] = None
    """Human-readable error message if conversion failed."""

    conversion_time_ms: Optional[int] = None
    """Time taken for conversion in milliseconds."""

    @property
    def source_path(self) -> Path:
        """Convenience property for source file path."""
        return Path(self.file_metadata.file_path)

    @property
    def mime_type(self) -> str:
        """Convenience property for MIME type."""
        return self.file_metadata.mime_type
```

### ConverterRegistry
Registry pattern for managing available document converters using MIME types.

```python
from dataclasses import dataclass, field
from typing import Dict, List, Optional

@dataclass
class ConverterRegistry:
    """Registry for document converter implementations."""

    _mime_type_converters: Dict[str, 'DocumentConverter'] = field(default_factory=dict)
    """Mapping of MIME types to converter instances."""

    def register_converter(self, converter: 'DocumentConverter') -> None:
        """Register a converter for its supported MIME types."""
        for mime_type in converter.supported_mime_types():
            self._mime_type_converters[mime_type] = converter

    def get_converter_for_mime_type(self, mime_type: str) -> Optional['DocumentConverter']:
        """Get converter for specific MIME type."""
        return self._mime_type_converters.get(mime_type)

    def list_supported_mime_types(self) -> List[str]:
        """Get all supported MIME types."""
        return sorted(self._mime_type_converters.keys())

    def can_convert(self, mime_type: str) -> bool:
        """Check if any converter can handle the given MIME type."""
        return mime_type in self._mime_type_converters
```

## Abstract Interfaces

### DocumentConverter (Abstract Base Class)
Base interface for all document converter implementations with FileMetadata integration.

```python
from abc import ABC, abstractmethod
from typing import List

class DocumentConverter(ABC):
    """Abstract base class for document converters."""

    @abstractmethod
    def supported_mime_types(self) -> List[str]:
        """Return list of supported MIME types."""
        pass

    @abstractmethod
    def supports_mime_type(self, mime_type: str) -> bool:
        """Check if converter supports the given MIME type."""
        pass

    @abstractmethod
    def convert(
        self,
        file_content: bytes,
        file_metadata: FileMetadata,
        config: ConversionConfig
    ) -> ConversionResult:
        """Convert document content to markdown."""
        pass

    def validate_conversion(
        self,
        file_metadata: FileMetadata,
        config: ConversionConfig
    ) -> None:
        """Validate conversion requirements."""
        # Check file size limit
        if file_metadata.size_bytes > config.max_file_size:
            raise ValueError(
                f"File size {file_metadata.size_bytes} exceeds limit {config.max_file_size}"
            )

        # Check MIME type support
        if not self.supports_mime_type(file_metadata.mime_type):
            raise ValueError(
                f"Unsupported MIME type: {file_metadata.mime_type}"
            )
```

## Enhanced BaseRetriever Interface
Required enhancements to BaseRetriever from file-manager-upload for bidirectional file operations.

```python
from abc import ABC, abstractmethod
from typing import Dict, Any

class BaseRetriever(ABC):
    """Enhanced base retriever interface for file storage and retrieval operations."""

    @abstractmethod
    def store_file(self, content: bytes, filename: str) -> str:
        """Store file content and return storage location."""
        pass

    @abstractmethod
    def load_file(self, file_path: str) -> bytes:
        """Load file content from storage location."""
        pass

    @abstractmethod
    def file_exists(self, file_path: str) -> bool:
        """Check if file exists at storage location."""
        pass

    @abstractmethod
    def get_file_metadata(self, file_path: str) -> Dict[str, Any]:
        """Get file metadata from storage."""
        pass
```

## Main Service Interface

### DocumentConversionService
Primary service interface for FileMetadata-based document conversion operations.

```python
from typing import List
from datetime import datetime

class DocumentConversionService:
    """Main service for document conversion operations with FileMetadata integration."""

    def __init__(
        self,
        registry: ConverterRegistry,
        config: ConversionConfig,
        file_manager: 'FileManager'
    ):
        self._registry = registry
        self._config = config
        self._file_manager = file_manager

    def convert_file(self, file_metadata: FileMetadata) -> FileMetadata:
        """Convert a single FileMetadata object and return updated metadata.

        Args:
            file_metadata: FileMetadata object with status='pending_parse'

        Returns:
            Updated FileMetadata object with conversion results

        Raises:
            ValueError: If file_metadata status is not 'pending_parse'
        """
        if file_metadata.status != "pending_parse":
            raise ValueError(
                f"FileMetadata must have status 'pending_parse', got '{file_metadata.status}'"
            )

        try:
            return self._convert_file(file_metadata)
        except Exception as e:
            # Update status to conversion_failed
            return self._update_file_status(
                file_metadata,
                "conversion_failed",
                {"error_message": str(e)}
            )

    def process_pending_conversions(self) -> List[FileMetadata]:
        """Process all FileMetadata entries with status='pending_parse'.

        This method queries the database for pending files and processes them in batch.
        For single-file processing, use convert_file() method instead.

        Returns:
            List of processed FileMetadata objects with updated status
        """
        # Query database for pending files
        pending_files = self._query_pending_files()
        results = []

        for file_metadata in pending_files:
            result = self.convert_file(file_metadata)
            results.append(result)

        return results

    def _convert_file(self, file_metadata: FileMetadata) -> FileMetadata:
        """Convert a single file using FileMetadata workflow."""
        # Update status to converting
        self._update_file_status(file_metadata, "converting")

        # Get appropriate retriever for loading source file
        retriever = self._file_manager.get_retriever_for_file(file_metadata)

        # Load file content via retriever
        file_content = retriever.load_file(file_metadata.file_path)

        # Get converter for MIME type
        converter = self._registry.get_converter_for_mime_type(file_metadata.mime_type)
        if converter is None:
            raise ValueError(
                f"Unsupported MIME type: {file_metadata.mime_type}"
            )

        # Perform conversion
        conversion_result = converter.convert(file_content, file_metadata, self._config)

        if conversion_result.success:
            # Get retriever for saving converted file
            output_retriever = self._file_manager.get_retriever_for_file(file_metadata)

            # Generate output filename
            output_filename = self._generate_output_filename(file_metadata.filename)

            # Store converted content via retriever
            output_path = output_retriever.store_file(
                conversion_result.output_path.read_bytes(),
                output_filename
            )

            # Update status to converted with metadata
            conversion_metadata = {
                "output_filename": output_filename,
                "output_path": output_path,
                "converted_at": datetime.now().isoformat(),
                "conversion_time_ms": conversion_result.conversion_time_ms
            }
            return self._update_file_status(
                file_metadata,
                "converted",
                conversion_metadata
            )
        else:
            # Update status to conversion_failed
            return self._update_file_status(
                file_metadata,
                "conversion_failed",
                {"error_message": conversion_result.error_message}
            )

    def _query_pending_files(self) -> List[FileMetadata]:
        """Query database for files with status='pending_parse'."""
        # Implementation depends on database layer
        pass

    def _update_file_status(
        self,
        file_metadata: FileMetadata,
        status: str,
        conversion_data: Dict[str, Any] = None
    ) -> FileMetadata:
        """Update FileMetadata status and conversion data."""
        # Implementation depends on database layer
        pass

    def _generate_output_filename(self, source_filename: str) -> str:
        """Generate output filename with .md extension."""
        base_name = source_filename.rsplit('.', 1)[0]
        return f"{base_name}.md"

    def list_supported_mime_types(self) -> List[str]:
        """Get list of all supported MIME types."""
        return self._registry.list_supported_mime_types()
```

## Data Flow

### FileMetadata Conversion Workflow
```
1. File uploaded via file-manager-upload → FileMetadata (status="pending_parse")
2. DocumentConversionService.process_pending_conversions() polls for pending files
3. For each FileMetadata:
   - Update status to "converting"
   - FileManager.get_retriever_for_file() → BaseRetriever
   - BaseRetriever.load_file() → file content (bytes)
   - ConverterRegistry.get_converter_for_mime_type() → DocumentConverter
   - DocumentConverter.convert(content, file_metadata, config) → ConversionResult
   - If successful:
     * BaseRetriever.store_file() → save converted markdown
     * Update status to "converted" with output_path and output_filename metadata
   - If failed:
     * Update status to "conversion_failed" with error_message
4. Return updated FileMetadata objects
```

### Error Handling Flow
```
1. MIME type validation → UnsupportedFormatError → status="conversion_failed"
2. File size validation → FileSizeExceededError → status="conversion_failed"  
3. File loading errors → FileNotReadableError → status="conversion_failed"
4. Conversion failures → ConversionFailureError → status="conversion_failed"
```

## Entity Relationships

```
FileMetadata ──── processed by ──── DocumentConversionService
     │                                       │
     ├── mime_type used by ──── ConverterRegistry ──── routes to ──── DocumentConverter
     │                                       │
     └── file_path used by ──── FileManager ──── provides ──── BaseRetriever
                                              │                     │
                                              │                     ├── load_file()
                                              │                     └── store_file()
                                              │
                                              └── updates ──── FileMetadata.status

DocumentConverter ──── validates with ──── ConversionConfig
     │
     └── returns ──── ConversionResult ──── contains ──── FileMetadata
```

## Custom Exceptions

### Exception Hierarchy
Following the codebase pattern with a base exception and specific domain exceptions.

```python
class DocumentConversionError(Exception):
    """Base exception for document conversion errors."""

    def __init__(self, message: str) -> None:
        """Initialize error with descriptive message."""
        self.message = message
        super().__init__(self.message)


class UnsupportedFormatError(DocumentConversionError):
    """Raised when attempting to convert an unsupported file format."""

    def __init__(self, format_type: str, supported_formats: list[str]) -> None:
        """Initialize with format details."""
        self.format_type = format_type
        self.supported_formats = supported_formats
        message = f"Unsupported format '{format_type}'. Supported formats: {', '.join(supported_formats)}"
        super().__init__(message)


class FileSizeExceededError(DocumentConversionError):
    """Raised when a file exceeds the configured size limit."""

    def __init__(self, file_size: int, max_size: int, file_path: str) -> None:
        """Initialize with file size details."""
        self.file_size = file_size
        self.max_size = max_size
        self.file_path = file_path
        message = f"File '{file_path}' size ({file_size:,} bytes) exceeds limit ({max_size:,} bytes)"
        super().__init__(message)


class FileNotReadableError(DocumentConversionError):
    """Raised when a source file cannot be read."""

    def __init__(self, file_path: str, reason: str = "File is not readable") -> None:
        """Initialize with file path and reason."""
        self.file_path = file_path
        self.reason = reason
        message = f"Cannot read file '{file_path}': {reason}"
        super().__init__(message)


class ConversionFailureError(DocumentConversionError):
    """Raised when document conversion fails due to library or processing errors."""

    def __init__(self, file_path: str, format_type: str, cause: str) -> None:
        """Initialize with conversion failure details."""
        self.file_path = file_path
        self.format_type = format_type
        self.cause = cause
        message = f"Failed to convert '{format_type}' file '{file_path}': {cause}"
        super().__init__(message)
```

### Exception Mapping to Requirements

**From spec.md requirements:**
- **FR-013**: "System MUST handle conversion errors gracefully" covering: (a) unsupported file formats → `UnsupportedFormatError`, (b) files exceeding memory processing limits → `FileSizeExceededError`, (c) corrupted or unreadable source files → `FileNotReadableError`
- **General conversion failures**: Third-party library errors → `ConversionFailureError`

### Error Handling Strategy

**Internal exceptions (thrown by converters):**
```python
# During validation (in DocumentConverter.validate_conversion)
if file_metadata.size_bytes > config.max_file_size:
    raise FileSizeExceededError(file_metadata.size_bytes, config.max_file_size, file_metadata.file_path)

if not converter.supports_mime_type(file_metadata.mime_type):
    raise UnsupportedFormatError(file_metadata.mime_type, converter.supported_mime_types())

# During file loading (BaseRetriever integration)
try:
    file_content = retriever.load_file(file_metadata.file_path)
except Exception as e:
    raise FileNotReadableError(file_metadata.file_path, str(e))

# During conversion
try:
    # Third-party library call with file content
    result = pypandoc.convert_text(file_content, 'md', format=input_format)
except Exception as e:
    raise ConversionFailureError(file_metadata.file_path, file_metadata.mime_type, str(e))
```

**Public interface (service catches and converts to FileMetadata updates):**
```python
def _convert_file(self, file_metadata: FileMetadata) -> FileMetadata:
    """Public interface never throws exceptions - updates FileMetadata status."""
    try:
        # Perform conversion using FileMetadata workflow
        conversion_result = converter.convert(file_content, file_metadata, self._config)

        if conversion_result.success:
            # Update status to "converted"
            return self._update_file_status(file_metadata, "converted", conversion_metadata)
        else:
            # Update status to "conversion_failed"
            return self._update_file_status(file_metadata, "conversion_failed", {"error_message": conversion_result.error_message})

    except DocumentConversionError as e:
        # Convert domain exceptions to FileMetadata status updates
        return self._update_file_status(file_metadata, "conversion_failed", {"error_message": e.message})
    except Exception as e:
        # Convert unexpected exceptions to status updates
        return self._update_file_status(file_metadata, "conversion_failed", {"error_message": f"Unexpected error: {str(e)}"})
```

## Implementation Notes

### FileMetadata Integration Design
- Single `process_pending_conversions()` method works with FileMetadata workflow
- Uses BaseRetriever for both loading source files and saving converted files
- FileManager.get_retriever_for_file() provides consistent retriever selection
- Status-based tracking: pending_parse → converting → converted/conversion_failed

### Error Handling
- All errors update FileMetadata.status to "conversion_failed"
- No exceptions thrown from public interface
- Internal validation can throw exceptions, caught by service
- Custom exceptions provide structured error information with MIME type context
- Error messages stored in FileMetadata.conversion metadata

### BaseRetriever Integration
- load_file() and store_file() methods provide bidirectional file operations
- Consistent storage abstraction across upload and conversion
- Supports multiple storage backends through same interface

### Thread Safety
- All data classes are immutable for thread safety
- FileMetadata updates are atomic database operations
- No shared mutable state between conversions

### Extensibility
- New MIME types: Implement DocumentConverter and register with supported_mime_types()
- New storage backends: Implement BaseRetriever interface
- New metadata: Add fields to FileMetadata.conversion (backward compatible)
- New error types: Extend DocumentConversionError hierarchy with MIME type context
