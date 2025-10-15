"""Tool validation result models."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass
class ToolValidationResult:
    """Result of validating a tool's functionality.

    Attributes:
        success: Whether the tool validation was successful
        duration_ms: Duration of the validation in milliseconds
        status: Status of the validation (success/failure/timeout)
        message: Descriptive message about the validation result
        validated_at: Timestamp when validation was performed
        validation_output: Optional output from the validation operation

    """

    success: bool
    duration_ms: int
    status: str
    message: str
    validated_at: datetime
    validation_output: Any = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "success": self.success,
            "duration_ms": self.duration_ms,
            "status": self.status,
            "message": self.message,
            "validated_at": self.validated_at.isoformat(),
            "validation_output": self.validation_output,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ToolValidationResult":
        """Create instance from dictionary."""
        return cls(
            success=data["success"],
            duration_ms=data["duration_ms"],
            status=data["status"],
            message=data["message"],
            validated_at=datetime.fromisoformat(data["validated_at"]),
            validation_output=data.get("validation_output"),
        )
