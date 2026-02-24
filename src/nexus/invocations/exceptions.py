"""Exception classes for invocations domain.

This module contains all custom exceptions used by invocation services.
"""

from nexus.core.exceptions import NexusError


class InvocationError(NexusError):
    """Base exception for all invocation-related errors."""
