"""Bulk update result models."""

from dataclasses import dataclass
from typing import Any


@dataclass
class BulkUpdateResult:
    """Result of a bulk update operation on tools.

    Attributes:
        updated_count: Number of tools that were successfully updated
        requested_count: Total number of tools that were requested to be updated
        success: Whether the operation was completely successful

    """

    updated_count: int
    requested_count: int
    success: bool

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "updated_count": self.updated_count,
            "requested_count": self.requested_count,
            "success": self.success,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "BulkUpdateResult":
        """Create instance from dictionary."""
        return cls(
            updated_count=data["updated_count"],
            requested_count=data["requested_count"],
            success=data["success"],
        )
