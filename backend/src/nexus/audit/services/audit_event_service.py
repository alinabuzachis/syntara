"""Audit event service for read-only queries.

Read operations are served by :meth:`BaseService.list_resources` using the
:class:`AuditEventConvertMixin` for ``AuditEventRecord`` → ``AuditEventRead``
conversion.  Write operations are handled by the transactional outbox pattern
(:mod:`nexus.audit.outbox`).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog

from nexus.audit.models.schemas import AuditEventRead
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

    from nexus.audit.models.audit_event_record import AuditEventRecord
    from nexus.core.models import User

logger = structlog.stdlib.get_logger(__name__)


class AuditEventConvertMixin(ConvertResourceMixin):
    """Convert AuditEventRecord to AuditEventRead response format."""

    def convert_resource(self, resource: AuditEventRecord) -> AuditEventRead:  # type: ignore[override]
        """Convert an AuditEventRecord to an AuditEventRead response."""
        return AuditEventRead.model_validate(resource)


class AuditEventService(BaseService):
    """Read-only service for audit event queries.

    Methods inherited from ``BaseService`` (notably ``list_resources``)
    handle request-scoped read operations.  Write operations are handled by
    the transactional outbox pattern (:mod:`nexus.audit.outbox`).
    """

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize with an audit database session."""
        super().__init__(session, user, convert_resource_mixin=AuditEventConvertMixin())
