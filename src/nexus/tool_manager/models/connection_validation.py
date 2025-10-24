"""Connection validation result models."""

from datetime import datetime

from sqlmodel import SQLModel


class ConnectionValidationResult(SQLModel):
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
