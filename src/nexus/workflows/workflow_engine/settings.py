"""Workflow execution settings and configuration.

This module provides configuration for workflow execution that can be overridden
via environment variables. All settings have sensible defaults.

Environment Variables:
    NEXUS_API_TIMEOUT_SECONDS: Default timeout for API requests (default: 30)
    NEXUS_SCRIPT_TIMEOUT_MINUTES: Default timeout for script execution (default: 5)
    NEXUS_MAX_DURATION_HOURS: Maximum allowed duration in hours (default: 8760, 0 = unlimited)
    NEXUS_MAX_DURATION_MINUTES: Maximum allowed duration in minutes (default: 525600, 0 = unlimited)
    NEXUS_MAX_DURATION_SECONDS: Maximum allowed duration in seconds (default: 31536000, 0 = unlimited)
    NEXUS_SCRIPT_CLEANUP_TERMINATE_TIMEOUT: Timeout for graceful process termination (default: 1.0)
    NEXUS_SCRIPT_CLEANUP_KILL_TIMEOUT: Timeout for forceful process kill (default: 0.5)
    NEXUS_MAX_ENV_VAR_LENGTH: Maximum length per environment variable (default: 32768)

Note:
    Setting any MAX_DURATION_* value to 0 disables validation for that unit,
    allowing unlimited durations. This is useful for testing or special workflows,
    but should be used carefully to avoid resource exhaustion.

"""

import logging
import os

logger = logging.getLogger(__name__)


def _get_int_env(key: str, default: int, min_value: int = 0) -> int:
    """Get integer value from environment variable with fallback to default.

    Args:
        key: Environment variable name
        default: Default value if not set or invalid
        min_value: Minimum allowed value (default: 0, where 0 typically means "unlimited")

    Returns:
        Integer value from environment or default

    """
    value = os.getenv(key)
    if value is None:
        return default

    try:
        parsed = int(value)
        if parsed < min_value:
            logger.warning(
                "Invalid value for environment variable %s='%s'. Value must be >= %s, using default: %s",
                key,
                value,
                min_value,
                default,
            )
            return default
        return parsed
    except ValueError:
        logger.warning(
            "Invalid value for environment variable %s='%s'. Expected integer, using default: %s",
            key,
            value,
            default,
        )
        return default


def _get_float_env(key: str, default: float, min_value: float = 0.0) -> float:
    """Get float value from environment variable with fallback to default.

    Args:
        key: Environment variable name
        default: Default value if not set or invalid
        min_value: Minimum allowed value (default: 0.0)

    Returns:
        Float value from environment or default

    """
    value = os.getenv(key)
    if value is None:
        return default

    try:
        parsed = float(value)
        if parsed < min_value:
            logger.warning(
                "Invalid value for environment variable %s='%s'. Value must be >= %s, using default: %s",
                key,
                value,
                min_value,
                default,
            )
            return default
        return parsed
    except ValueError:
        logger.warning(
            "Invalid value for environment variable %s='%s'. Expected float, using default: %s",
            key,
            value,
            default,
        )
        return default


# Activity execution defaults
# Override via environment variables: NEXUS_API_TIMEOUT_SECONDS, NEXUS_SCRIPT_TIMEOUT_MINUTES
API_TIMEOUT_SECONDS = _get_int_env("NEXUS_API_TIMEOUT_SECONDS", 30)
"""Default timeout for API requests in seconds (default: 30)."""

SCRIPT_TIMEOUT_MINUTES = _get_int_env("NEXUS_SCRIPT_TIMEOUT_MINUTES", 5)
"""Default timeout for script execution in minutes (default: 5)."""

# Duration validation limits (0 = unlimited)
# Override via environment variables: NEXUS_MAX_DURATION_*
MAX_DURATION_HOURS = _get_int_env("NEXUS_MAX_DURATION_HOURS", 8760, min_value=0)
"""Maximum duration in hours (default: 8760 = 1 year, 0 = unlimited)."""

MAX_DURATION_MINUTES = _get_int_env("NEXUS_MAX_DURATION_MINUTES", 525600, min_value=0)
"""Maximum duration in minutes (default: 525600 = 1 year, 0 = unlimited)."""

MAX_DURATION_SECONDS = _get_int_env("NEXUS_MAX_DURATION_SECONDS", 31536000, min_value=0)
"""Maximum duration in seconds (default: 31536000 = 1 year, 0 = unlimited)."""

# Script execution settings
# Override via environment variables: NEXUS_SCRIPT_CLEANUP_*, NEXUS_MAX_ENV_VAR_LENGTH
SCRIPT_CLEANUP_TERMINATE_TIMEOUT = _get_float_env("NEXUS_SCRIPT_CLEANUP_TERMINATE_TIMEOUT", 1.0, min_value=0.1)
"""Timeout in seconds for graceful process termination (default: 1.0)."""

SCRIPT_CLEANUP_KILL_TIMEOUT = _get_float_env("NEXUS_SCRIPT_CLEANUP_KILL_TIMEOUT", 0.5, min_value=0.1)
"""Timeout in seconds for forceful process kill (default: 0.5)."""

MAX_ENV_VAR_LENGTH = _get_int_env("NEXUS_MAX_ENV_VAR_LENGTH", 32768, min_value=1024)
"""Maximum length per environment variable in bytes (default: 32768 = 32KB)."""
