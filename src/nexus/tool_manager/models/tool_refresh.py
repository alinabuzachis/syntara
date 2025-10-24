"""Tool refresh result models."""

from datetime import datetime

from sqlmodel import SQLModel


class ToolRefreshResult(SQLModel):
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
