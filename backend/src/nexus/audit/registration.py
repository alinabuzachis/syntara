"""Centralised audit/telemetry handler registration.

Provides :func:`discover_and_register_all_handlers` so the API server,
Temporal worker, and any other entry-point can share a single handler
list without duplicating imports or discovery calls.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog

from nexus.audit.discovery import discover_handlers
from nexus.audit.dispatcher import AuditEventDispatcher

if TYPE_CHECKING:
    from types import ModuleType

logger = structlog.stdlib.get_logger(__name__)


def _handler_packages() -> list[ModuleType]:
    """Return the ordered list of packages that contain audit/telemetry handlers."""
    import nexus.agent_orchestrator.audit  # noqa: PLC0415
    import nexus.approvals.audit  # noqa: PLC0415
    import nexus.audit.events  # noqa: PLC0415
    import nexus.auth.audit  # noqa: PLC0415
    import nexus.authz.audit  # noqa: PLC0415
    import nexus.credentials.audit  # noqa: PLC0415
    import nexus.files.audit  # noqa: PLC0415
    import nexus.identity_providers.audit  # noqa: PLC0415
    import nexus.settings.audit  # noqa: PLC0415
    import nexus.telemetry.handlers  # noqa: PLC0415
    import nexus.workflows.audit  # noqa: PLC0415

    return [
        nexus.agent_orchestrator.audit,
        nexus.approvals.audit,
        nexus.audit.events,
        nexus.auth.audit,
        nexus.authz.audit,
        nexus.credentials.audit,
        nexus.files.audit,
        nexus.identity_providers.audit,
        nexus.settings.audit,
        nexus.telemetry.handlers,
        nexus.workflows.audit,
    ]


def discover_and_register_all_handlers() -> None:
    """Discover audit/telemetry event handlers and register them with the dispatcher.

    Scoped to known sub-packages; add new domains to :func:`_handler_packages`.
    Continues startup if discovery fails — audit is observability, not critical path.
    """
    try:
        total = 0
        for package in _handler_packages():
            registry = discover_handlers(package)
            AuditEventDispatcher.register(registry)
            total += len(registry)

        logger.info("Audit event handlers discovered", handler_count=total)
    except Exception:
        logger.exception("Failed to discover and register audit handlers - audit system degraded")
