"""Query parameter models for integration endpoints."""

from sqlmodel import Field

from nexus.core.models.base import BaseListParams
from nexus.integrations.models.integration import (
    IntegrationScope,
    IntegrationStatus,
    IntegrationType,
)


class IntegrationListParams(BaseListParams):
    """Query parameters for integration list endpoint."""

    integration_type: IntegrationType | None = Field(default=None, description="Filter by integration type")
    status: IntegrationStatus | None = Field(default=None, description="Filter by integration status")
    enabled: bool | None = Field(default=None, description="Filter by enabled status")
    scope: IntegrationScope | None = Field(default=None, description="Filter by visibility scope")
