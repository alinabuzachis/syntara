"""PDF Converter - PDF document conversion using PyMuPDF.

This module provides document conversion for PDF files to mark-down format
using the PyMuPDF (fitz) library for text extraction.
"""

import tempfile
from contextlib import suppress
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pymupdf  # type: ignore[import-untyped]

from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.converters.document_converter import (
    DocumentConverter,
)
from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.models.conversion_result import (
    ConversionResult,
)

if TYPE_CHECKING:
    from nexus.agent_orchestrator.context_manager.file_manager import FileMetadata


class PDFConverter(DocumentConverter):
    """Converter for PDF documents using PyMuPDF.

    Handles conversion of PDF files to markdown format using PyMuPDF (fitz)
    for text extraction with basic formatting preservation.
    """

    def supported_mime_types(self) -> list[str]:
        """Get list of MIME types supported by this converter.

        Returns:
            List of supported MIME types for PDF documents

        """
        return ["application/pdf"]

    async def convert(
        self,
        file_content: bytes,
        file_metadata: "FileMetadata",
    ) -> ConversionResult:
        """Convert PDF document content to markdown.

        Args:
            file_content: Raw bytes content of the PDF document
            file_metadata: Metadata about the source file

        Returns:
            ConversionResult with converted markdown content

        Example:
            converter = PDFConverter()
            with open("/tmp/document.pdf", "rb") as f:
                content = f.read()
            result = await converter.convert(content, file_metadata)
            assert result.success is True
            assert result.converted_content

        """
        # Verify MIME type
        if file_metadata.mime_type != "application/pdf":
            return ConversionResult.failure_result(
                error_message=f"Unsupported MIME type: {file_metadata.mime_type}",
                error_type="unsupported_format",
                conversion_time_ms=0,
            )

        # Write content to temporary file for PyMuPDF processing
        temp_input_path = None
        try:
            # Create temporary file with PDF extension
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
                temp_file.write(file_content)
                temp_input_path = temp_file.name

            # Extract text using PyMuPDF
            doc = pymupdf.open(temp_input_path)
            page_count = len(doc)
            markdown_content = self._extract_text_as_markdown(doc)
            doc.close()

            if not markdown_content.strip():
                return ConversionResult.failure_result(
                    error_message="PDF appears to contain no extractable text (may be scanned images)",
                    error_type="no_text_content",
                    conversion_time_ms=0,
                )

            return ConversionResult.success_result(
                converted_content=markdown_content,
                conversion_time_ms=0,  # Timing handled by base class
                metadata={
                    "input_format": "pdf",
                    "converter": "pymupdf",
                    "mime_type": file_metadata.mime_type,
                    "page_count": page_count,
                },
            )

        except (OSError, ValueError, RuntimeError) as e:
            error_message = str(e)
            error_type = self._classify_pdf_error(error_message)

            return ConversionResult.failure_result(
                error_message=error_message,
                error_type=error_type,
                conversion_time_ms=0,
                metadata={"exception_type": type(e).__name__},
            )

        finally:
            # Clean up temporary file
            if temp_input_path and Path(temp_input_path).exists():
                with suppress(OSError):
                    Path(temp_input_path).unlink()

    def _extract_text_as_markdown(self, doc: Any) -> str:  # noqa: ANN401
        """Extract text from PDF document and format as markdown.

        Args:
            doc: PyMuPDF document object

        Returns:
            Markdown-formatted text content

        """
        markdown_lines = []

        for page_num in range(len(doc)):
            page = doc[page_num]

            # Add page separator for multipage documents
            if page_num > 0:
                markdown_lines.append("\n---\n")

            page_lines = self._extract_page_text(page)
            markdown_lines.extend(page_lines)

        return self._clean_markdown_content(markdown_lines)

    def _extract_page_text(self, page: Any) -> list[str]:  # noqa: ANN401
        """Extract text from a single PDF page.

        Args:
            page: PyMuPDF page object

        Returns:
            List of text lines from the page

        """
        page_lines = []
        blocks = page.get_text("dict")

        for block in blocks.get("blocks", []):
            if "lines" not in block:
                continue

            for line in block["lines"]:
                line_text = self._format_line_text(line)
                if line_text:
                    page_lines.append(line_text)

            # Add paragraph break
            page_lines.append("")

        return page_lines

    def _format_line_text(self, line: Any) -> str:  # noqa: ANN401
        """Format a line of text with basic mark-down formatting.

        Args:
            line: PyMuPDF line object

        Returns:
            Formatted line text

        """
        line_text = ""
        for span in line.get("spans", []):
            text = span.get("text", "").strip()
            if text:
                # Basic formatting preservation
                if span.get("flags", 0) & 2**4:  # Bold
                    text = f"**{text}**"
                if span.get("flags", 0) & 2**1:  # Italic
                    text = f"*{text}*"
                line_text += text + " "

        return line_text.strip()

    def _clean_markdown_content(self, markdown_lines: list[str]) -> str:
        """Clean up markdown content by removing excess whitespace.

        Args:
            markdown_lines: List of mark-down text lines

        Returns:
            Cleaned markdown content

        """
        content = "\n".join(markdown_lines)
        # Remove excessive blank lines
        while "\n\n\n" in content:
            content = content.replace("\n\n\n", "\n\n")

        return content.strip()

    def _classify_pdf_error(self, error_message: str) -> str:
        """Classify PDF processing error for appropriate error type.

        Args:
            error_message: Error message from PyMuPDF

        Returns:
            Classified error type string

        """
        error_lower = error_message.lower()

        if "corrupted" in error_lower or "invalid" in error_lower or "damaged" in error_lower:
            return "corruption"
        if "password" in error_lower or "encrypted" in error_lower:
            return "password_protected"
        if "not found" in error_lower or "no such file" in error_lower:
            return "file_not_found"
        if "permission" in error_lower or "access" in error_lower:
            return "permission_denied"
        if "memory" in error_lower:
            return "memory_exhausted"
        return "conversion_error"
