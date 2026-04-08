"""SettingsStore: internal read-only data access layer for runtime settings.

Provides direct database access for internal consumers (SettingsCache,
seeder). This is intentionally NOT a Service — it has no user context,
no pagination, and no router. It must not be exposed via FastAPI.

A proper ``SettingsService(BaseService)`` will be introduced when the
REST API for modifying settings is added.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlmodel import select

from nexus.settings.models.runtime_setting import RuntimeSetting

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession


class SettingsStore:
    """Read-only data access layer for runtime settings.

    This store is for **internal use only** — it backs ``SettingsCache`` and
    the startup seeder. It must NOT be connected to a FastAPI router.

    When a REST API for modifying settings is introduced, it should be backed
    by a proper ``SettingsService(BaseService)`` that layers user context,
    validation, optimistic locking, and pagination on top of this store.

    Args:
        session: Async database session for queries.

    """

    def __init__(self, *, session: AsyncSession) -> None:
        """Initialise with an injected async database session."""
        self._session = session

    async def get(self, key: str) -> RuntimeSetting | None:
        """Fetch a single setting by its dot-namespaced key.

        Args:
            key: Dot-namespaced setting key, e.g. ``'context_manager.max_total_tokens'``.

        Returns:
            The matching :class:`RuntimeSetting`, or ``None`` if not found.

        """
        result = await self._session.exec(select(RuntimeSetting).where(RuntimeSetting.key == key))
        return result.one_or_none()
