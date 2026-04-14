"""Domain exceptions for credential management."""

from nexus.core.exception_registry import fastapi_exception
from nexus.core.exceptions import NexusError
from nexus.credentials.error_handlers import (
    credential_decryption_error_handler,
    credential_disabled_error_handler,
    credential_error_handler,
    credential_name_conflict_handler,
    credential_not_found_handler,
    credential_validation_error_handler,
)


@fastapi_exception(handler=credential_error_handler)
class CredentialError(NexusError):
    """Base exception for all credential management errors."""


@fastapi_exception(handler=credential_not_found_handler)
class CredentialNotFoundError(CredentialError):
    """Exception raised when a credential is not found."""


@fastapi_exception(handler=credential_name_conflict_handler)
class CredentialNameConflictError(CredentialError):
    """Exception raised when a credential name already exists."""

    def __init__(self, name: str) -> None:
        """Initialize exception with credential name."""
        self.name = name
        super().__init__(f"Credential with name '{name}' already exists")


@fastapi_exception(handler=credential_validation_error_handler)
class CredentialValidationError(CredentialError):
    """Exception raised for credential input validation errors."""


@fastapi_exception(handler=credential_decryption_error_handler)
class CredentialDecryptionError(CredentialError):
    """Exception raised when credential decryption fails."""


@fastapi_exception(handler=credential_disabled_error_handler)
class CredentialDisabledError(CredentialError):
    """Exception raised when a disabled credential is used in workflow resolution."""

    def __init__(self, name: str) -> None:
        """Initialize with credential name."""
        self.name = name
        super().__init__(f"Credential '{name}' is disabled. Re-enable it before running workflows.")
