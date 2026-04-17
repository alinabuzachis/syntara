"""Audit event service for read-only queries.

Provides ``list_audit_events()`` and ``get_audit_event_by_id()`` backed by
``BaseService``.  Write operations are handled by :mod:`nexus.audit.services.writer`.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog

from nexus.audit.models import AuditEventRecord
from nexus.audit.schemas import AuditEventListResponse, AuditEventRead
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin

if TYPE_CHECKING:
    from collections.abc import Iterable

    from sqlmodel.ext.asyncio.session import AsyncSession

    from nexus.core.models import User

logger = structlog.stdlib.get_logger(__name__)


class AuditEventConvertMixin(ConvertResourceMixin):
    """Convert AuditEventRecord to AuditEventRead response format."""

    def convert_resource(self, resource: AuditEventRecord) -> AuditEventRead:  # type: ignore[override]
        """Convert an AuditEventRecord to an AuditEventRead response."""
        return AuditEventRead.model_validate(resource)


class AuditEventService(BaseService):
    """Read-only service for audit event queries.

    Instance methods inherited from ``BaseService`` handle request-scoped
    read operations.  Write operations are handled by
    :class:`~nexus.audit.services.writer.AuditEventWriter`.
    """

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize with an audit database session."""
        super().__init__(session, user, convert_resource_mixin=AuditEventConvertMixin())

    async def list_audit_events(
        self,
        limit: int = 20,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
    ) -> AuditEventListResponse:
        """List audit events with filtering, sorting, and pagination."""
        return await self.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            limit=limit,
            cursor=cursor,
            sort=sort or "-created_at",
            query_params_items=query_params_items,
            include_total=include_total,
        )
