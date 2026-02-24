"""Base exceptions for the Nexus application.

This module contains the root exception hierarchy for all internal exceptions
within the Nexus system. Exception boundaries stop at the FastAPI routers.
"""


class NexusError(Exception):
    """Base exception for all Nexus internal errors.

    This is the root of the exception hierarchy for all domain-specific
    exceptions within the Nexus system. It provides a common interface
    and ensures all internal exceptions accept a message parameter.
    """

    def __init__(self, message: str) -> None:
        """Initialize NexusError.

        Args:
            message: Error message describing the failure

        """
        self.message = message
        super().__init__(message)
