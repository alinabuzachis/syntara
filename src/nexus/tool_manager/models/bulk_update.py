"""Bulk update result models."""

from sqlmodel import SQLModel


class BulkUpdateResult(SQLModel):
    """Result of a bulk update operation on tools.

    Attributes:
        updated_count: Number of tools that were successfully updated
        requested_count: Total number of tools that were requested to be updated
        success: Whether the operation was completely successful

    """

    updated_count: int
    requested_count: int
    success: bool
