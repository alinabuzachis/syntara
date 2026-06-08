"""Query parameter models for tool manager endpoints."""

from sqlmodel import Field

from nexus.core.models.base import BaseListParams


class ToolProviderListParams(BaseListParams):
    """Query parameters for tool provider list endpoint."""

    # Override default limit for tool providers
    limit: int = Field(default=100, gt=0, le=100, description="Maximum number of results per page")


class ToolListParams(BaseListParams):
    """Query parameters for tool list endpoint."""

    # Override default limit for tools
    limit: int = Field(default=100, gt=0, le=100, description="Maximum number of results per page")
