"""Document conversion component for agent invocation workflow.

This component provides automatic document conversion to markdown format
when files are uploaded through the agent invocation system.

Key Components:
- DocumentConversionService: Core service for processing conversions
- ConverterRegistry: Registry for managing different converter types
- BaseConverter: Abstract base class for document converters
- ConversionConfig/ConversionResult: Data models for conversion operations

Architecture:
- Files uploaded through FileManager trigger automatic background conversion
- Conversions are processed asynchronously via FastAPI BackgroundTasks
- FileMetadata status tracks conversion progress (pending_parse → converting → converted/failed)
- Invocation execution is gated until all conversions reach terminal status

Supported Formats:
- PDF documents (via PyMuPDF)
- Word documents (DOC/DOCX via pypandoc)
- Plain text files (simple formatting)
- Markdown files (pass-through)

Usage:
    The conversion process is automatic and transparent to users.
    When files are uploaded via the invoke_agent endpoint, background
    conversion is automatically triggered and results are integrated
    into the invocation context.

Example:
    # User uploads PDF via invoke_agent endpoint
    # → FileManager saves file and creates FileMetadata
    # → Background task converts PDF to markdown
    # → FileMetadata status updated to "converted"
    # → Invocation proceeds with markdown content available

"""

# Core service
# Converter registry and base classes
from .converters.document_converter import DocumentConverter
from .converters.markdown_converter import MarkdownConverter

# Specific converter implementations
from .converters.ms_word_converter import MSWordConverter
from .converters.text_converter import TextConverter

# Standard logging is used throughout the module
# Custom exceptions
from .exceptions import (
    ConversionFailureError,
    DocumentConversionError,
    FileNotReadableError,
    FileSizeExceededError,
    UnsupportedFormatError,
)

# Configuration and result models
from .models.conversion_config import ConversionConfig
from .models.conversion_result import ConversionResult
from .services.document_conversion_service import DocumentConversionService

# Public API
__all__ = [
    "ConversionConfig",
    "ConversionFailureError",
    "ConversionResult",
    "DocumentConversionError",
    "DocumentConversionService",
    "DocumentConverter",
    "FileNotReadableError",
    "FileSizeExceededError",
    "MSWordConverter",
    "MarkdownConverter",
    "TextConverter",
    "UnsupportedFormatError",
]
