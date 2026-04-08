"""Domain exceptions for runtime settings."""

from nexus.core.exception_registry import fastapi_exception
from nexus.core.exceptions import NexusError
from nexus.settings.error_handlers import setting_validation_error_handler


class SettingError(NexusError):
    """Base exception for all settings errors."""


class SettingTypeError(SettingError):
    """Raised when a setting value has an unexpected runtime type."""

    def __init__(self, key: str, expected: str, actual: str) -> None:
        """Initialise with the setting key, expected type, and actual type.

        Args:
            key: Setting key that returned the wrong type.
            expected: The type that was expected (e.g. ``'int'``).
            actual: The type that was actually found (e.g. ``'str'``).

        """
        self.key = key
        self.expected = expected
        self.actual = actual
        super().__init__(f"Setting '{key}' expected type {expected}, got {actual}")


@fastapi_exception(handler=setting_validation_error_handler)
class SettingValidationError(SettingError):
    """Raised when a setting value fails type or constraint validation."""

    def __init__(self, key: str, detail: str) -> None:
        """Initialise with the setting key and a human-readable detail message.

        Args:
            key: Dot-namespaced setting key that failed validation.
            detail: Description of the validation failure.

        """
        self.key = key
        self.detail = detail
        super().__init__(f"Validation failed for setting '{key}': {detail}")
