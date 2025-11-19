"""Constants for field validation and limits across the nexus core module.

This module centralizes all magic numbers and limits used throughout the codebase
to improve maintainability and consistency.
"""


class FieldLimits:
    """Field length and validation limits."""

    # String field limits
    NAME_MAX_LENGTH = 255
    DESCRIPTION_MAX_LENGTH = 2000
    ERROR_CODE_MAX_LENGTH = 100
    ERROR_MESSAGE_MAX_LENGTH = 500
    PARAMETER_NAME_MAX_LENGTH = 100
    SCHEMA_VERSION_MAX_LENGTH = 50
    TIME_WINDOW_MAX_LENGTH = 50
    NAMESPACED_NAME_MAX_LENGTH = 200

    # Pagination limits
    MAX_ITEMS_PER_PAGE = 100

    # Cursor and JSON limits for security
    MAX_CURSOR_SIZE = 1024  # 1KB limit for cursor tokens


class WebSocketConfig:
    """WebSocket configuration constants."""

    # Message size limits
    MAX_MESSAGE_SIZE = 1048576  # 1MB

    # Connection limits
    MAX_CONNECTIONS = 100

    # Health check settings
    PING_INTERVAL = 30  # seconds
    PING_TIMEOUT = 10  # seconds


class ValidationMessages:
    """Standard validation error messages."""

    LABELS_MUST_BE_DICT = "labels must be a dictionary"
    LABELS_KEY_MUST_BE_STRING = "labels key '{key}' must be a string, got {type_name}"
    LABELS_VALUE_MUST_BE_STRING = "labels value for key '{key}' must be a string, got {type_name}"
    CURSOR_TOO_LARGE = "Cursor too large (max {max_size} bytes)"
    CURSOR_INVALID_FORMAT = "Invalid cursor format: {error}"


# File upload validation constants
# Minimum file size for reliable MIME type detection (in bytes)
# python-magic requires sufficient bytes to accurately identify file types
MIME_TYPE_DETECTION_MIN_BYTES = 512

# Context data keys for invocation context_data JSONB field
CONTEXT_KEY_FILE_METADATA = "file_metadata"  # Key for file metadata array in invocation context_data
