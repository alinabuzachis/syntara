"""Connection validation result models."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass
class ConnectionValidationResult:
    """Result of validating a connection to a tool provider.

    Attributes:
        valid: Whether the connection validation was successful
        provider_type: The type of provider that was validated
        protocol_version: Version of the provider protocol
        validated_at: Timestamp when validation was performed
        error: Optional error message if validation failed

    """

    valid: bool
    provider_type: str
    protocol_version: str
    validated_at: datetime
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "valid": self.valid,
            "provider_type": self.provider_type,
            "protocol_version": self.protocol_version,
            "validated_at": self.validated_at.isoformat(),
            "error": self.error,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ConnectionValidationResult":
        """Create instance from dictionary."""
        return cls(
            valid=data["valid"],
            provider_type=data["provider_type"],
            protocol_version=data["protocol_version"],
            validated_at=datetime.fromisoformat(data["validated_at"]),
            error=data.get("error"),
        )
