"""Base query parameter models for FastAPI endpoints.

This module defines SQLModel-based models for query parameters used across the API endpoints.
Using Query Parameter Models provides better validation, documentation, and reusability.
"""

from sqlmodel import Field, SQLModel


class BaseListParams(SQLModel):
    """Base query parameters for list endpoints with pagination and sorting."""

    limit: int = Field(default=20, gt=0, le=100, description="Maximum number of results per page")
    cursor: str | None = Field(default=None, description="Pagination cursor from previous response")
    sort: str | None = Field(default=None, description="Sort parameter (e.g., 'name', '-created_at')")
    include_total: bool = Field(default=False, description="Include total count in response (expensive)")
