# Document Conversion Library Research

**Updated**: 2025-11-19 - FileMetadata Integration

## Research Questions Addressed

1. FileMetadata integration pattern with file-manager-upload
2. MIME type detection consistency (python-magic vs pypandoc)
3. Primary document conversion library selection
4. Error handling patterns for library failures
5. Integration with system configuration
6. Configuration management best practices
7. Extensible plugin patterns

## Technical Decisions

### FileMetadata Integration Pattern

**Decision**: Use existing FileMetadata structure from file-manager-upload component

**Rationale**:
- Eliminates duplication between ConversionRequest/DocumentInfo and FileMetadata
- Provides reliable MIME type detection via python-magic
- Creates consistent data flow between upload and conversion components
- Follows DRY principle and constitutional requirements

**Implementation approach**:
```python
# Conversion service processes FileMetadata with status="pending_parse"
def process_pending_conversions(self):
    pending_files = db.query_file_metadata(status="pending_parse")
    for file_metadata in pending_files:
        converter = self.get_converter_for_mime_type(file_metadata.mime_type)
        result = converter.convert(file_metadata)
        self.update_file_metadata_status(file_metadata, result)
```

**Alternatives considered**:
- Creating separate ConversionRequest/DocumentInfo models
- File extension-based format detection
- Independent file reading from filesystem

### MIME Type Detection Consistency

**Decision**: Use python-magic (^0.4.27) for MIME type detection (shared with file-manager-upload)

**Rationale**:
- Already used in file-manager-upload component (consistency)
- More reliable than file extension parsing
- Well-established library with broad format support
- Integrates seamlessly with FileMetadata.mime_type field

**Implementation pattern**:
```python
# Converter selection based on MIME type rather than file extension
class ConverterRegistry:
    def get_converter(self, mime_type: str) -> DocumentConverter:
        return self.mime_type_converters.get(mime_type)
```

**Alternatives considered**:
- Using pypandoc's built-in format detection
- File extension parsing
- Multiple specialized libraries (python-docx + PyPDF2)

### Primary Conversion Library

**Decision**: pypandoc with pypandoc_binary (bundled Pandoc)

**Rationale**:
- Perfect format support for all required formats (PDF, DOC/DOCX, TXT, MD)
- Lightweight (21KB vs 1GB+ for Docling)
- Memory efficient for 10MB file limit
- Simple, stable API with excellent error handling
- Mature, well-maintained project
- Universal converter supporting 40+ formats through Pandoc

**Alternatives considered**:
- **Docling**: Advanced AI-powered conversion but 1GB+ size, memory issues with 4.5MB+ files, overkill for simple markdown conversion
- **Specialized combination (python-docx + pypdfium2)**: Maximum control and extensibility but requires more complex implementation and multiple dependencies

### Error Handling Approach

**Decision**: Exception-based error handling with conversion result objects

**Rationale**:
- pypandoc provides clear exception types for different failure modes
- Allows graceful degradation and user-friendly error messages
- Consistent with Python best practices

**Implementation pattern**:
```python
try:
    pypandoc.convert_file(input_path, 'md', outputfile=output_path)
    return ConversionResult(success=True, output_filename=output_filename)
except pypandoc.PandocError as e:
    return ConversionResult(success=False, error_message=str(e))
```

### System Configuration Integration

**Decision**: Dependency injection of configuration object

**Rationale**:
- Follows constitutional requirement for explicit configuration
- Allows easy testing with mock configurations
- Supports runtime configuration updates
- Clean separation of concerns

**Implementation pattern**:
```python
@dataclass
class ConversionConfig:
    output_directory: Path
    max_file_size: int  # From system configuration
    overwrite_existing: bool = True
```

### Configuration Management

**Decision**: Immutable dataclass configuration objects

**Rationale**:
- Type safety with dataclasses
- Immutable configuration prevents accidental modifications
- Clear validation at construction time
- Easy to test and reason about

### Plugin Architecture

**Decision**: Abstract base class with converter registry

**Rationale**:
- Follows SOLID principles (Open/Closed, Interface Segregation)
- Easy to add new format converters
- Supports dependency injection
- Clear contract for converter implementations

**Implementation pattern**:
```python
from abc import ABC, abstractmethod

class DocumentConverter(ABC):
    @abstractmethod
    def supported_formats(self) -> List[str]: ...

    @abstractmethod
    def convert_to_markdown(self, input_path: Path, output_filename: str) -> ConversionResult: ...

class ConverterRegistry:
    def register_converter(self, converter: DocumentConverter): ...
    def get_converter(self, file_extension: str) -> DocumentConverter: ...
```

## Technical Specifications

### Dependencies
- `pypandoc-binary==1.13` (includes bundled Pandoc)
- `pathlib` (standard library)
- No additional system dependencies required

### File Size Handling
- Maximum file size: Retrieved from system configuration (currently 10MB)
- Pre-conversion file size validation
- Memory-efficient streaming where possible

### Supported Formats (Initial)
- PDF → Markdown
- DOC/DOCX → Markdown  
- TXT → Markdown
- MD → Markdown (no-op, copy operation)

### Performance Characteristics
- Expected conversion time: < 30 seconds per file
- Memory usage: Low (pypandoc converts through text pipeline)
- File size limit: Configurable, currently 10MB

### Error Scenarios
1. **File not found**: Clear error message with file path
2. **File too large**: Size limit exceeded error with current limit
3. **Unsupported format**: List of supported formats in error
4. **Conversion failure**: Specific pypandoc error message
5. **Output directory issues**: Write permission errors

## Future Extensibility

### Adding New Formats
1. Implement new converter class inheriting from DocumentConverter
2. Register with ConverterRegistry
3. No changes to existing code required

### Advanced Format Support
- Can replace pypandoc converter with specialized libraries for specific formats
- Plugin system allows A/B testing of different conversion approaches
- Maintains consistent interface regardless of underlying implementation

## Integration Points

### System Configuration
- File size limits: Read from existing system configuration
- Output directory: Configurable per conversion request
- Converter selection: Automatic based on file extension

### Error Reporting
- Structured error messages following existing system patterns
- Actionable error descriptions without exposing internal details
- Error codes for programmatic handling

## Implementation Notes

### Testing Strategy
- Unit tests for each converter implementation
- Integration tests with sample files for each format
- Error condition testing with invalid files
- Configuration validation testing

### Deployment Considerations
- pypandoc_binary is self-contained (no system Pandoc required)
- Total package size impact: ~21KB + Pandoc binary (~20MB)
- No external service dependencies
