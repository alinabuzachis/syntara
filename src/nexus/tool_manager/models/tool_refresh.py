"""Tool refresh result models."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass
class ToolRefreshResult:
    """Result of refreshing tools from a provider.

    Attributes:
        refreshed_count: Number of new tools discovered and added
        updated_count: Number of existing tools that were updated
        disabled_count: Number of tools that were disabled (not found in provider)
        refreshed_at: Timestamp when refresh operation was performed

    """

    refreshed_count: int
    updated_count: int
    disabled_count: int
    refreshed_at: datetime

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "refreshed_count": self.refreshed_count,
            "updated_count": self.updated_count,
            "disabled_count": self.disabled_count,
            "refreshed_at": self.refreshed_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ToolRefreshResult":
        """Create instance from dictionary."""
        return cls(
            refreshed_count=data["refreshed_count"],
            updated_count=data["updated_count"],
            disabled_count=data["disabled_count"],
            refreshed_at=datetime.fromisoformat(data["refreshed_at"]),
        )
