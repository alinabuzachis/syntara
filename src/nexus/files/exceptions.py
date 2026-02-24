"""Exception classes for files domain.

This module contains general file-related exceptions. Domain-specific exceptions
are located in their respective subdomains (e.g., document_conversion/exceptions.py).
"""

from nexus.core.exception_registry import fastapi_exception
from nexus.core.exceptions import NexusError
from nexus.files.error_handlers import file_validation_error_handler


class FileError(NexusError):
    """Base exception for all file-related errors."""


@fastapi_exception(handler=file_validation_error_handler)
class FileValidationError(FileError):
    """File validation error with actionable messages.

    This exception is raised when file validation fails and should be
    caught by the API layer to return appropriate 400 Bad Request responses.
    """
