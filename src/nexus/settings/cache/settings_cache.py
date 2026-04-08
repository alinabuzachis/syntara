"""Runtime settings reader.

Provides a thin async interface for reading runtime settings from the
database. Each :meth:`SettingsCache.get` call opens a short-lived session,
fetches the setting row, and resolves the effective value (``value`` if set,
else ``default_value``).

Caching (Redis-backed) will be added in a future iteration. The
:meth:`invalidate` method is retained as a no-op to keep the interface
stable for that transition.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import structlog

from nexus.settings.exceptions import SettingTypeError
from nexus.settings.store import SettingsStore

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = structlog.stdlib.get_logger(__name__)

_runtime_settings: SettingsCache | None = None


class SettingsCache:
    """Async reader for runtime settings backed by the database.

    Each :meth:`get` call fetches the setting directly from the database.
    A caching layer (e.g. Redis) will be added in a future iteration.

    Args:
        session_factory: Async session factory — an ``async_sessionmaker`` or
            any callable returning an async context manager that yields an
            :class:`~sqlmodel.ext.asyncio.session.AsyncSession`.

    """

    def __init__(self, *, session_factory: Any) -> None:  # noqa: ANN401
        """Initialise with an async session factory.

        Args:
            session_factory: Callable returning an async context manager
                that yields an :class:`~sqlmodel.ext.asyncio.session.AsyncSession`.

        """
        self._session_factory = session_factory

    async def get(self, key: str) -> Any:  # noqa: ANN401
        """Return the effective value for a setting key.

        Fetches the setting row from the database, resolves the effective
        value (``value`` if set, else ``default_value``), and returns it.

        Args:
            key: Dot-namespaced setting key, e.g.
                ``'context_manager.max_total_tokens'``.

        Returns:
            The resolved value as a native Python type, or ``None`` if the
            key does not exist or both ``value`` and ``default_value`` are
            ``None``.

        """
        async with self._session_factory() as session:
            session_obj: AsyncSession = session
            store = SettingsStore(session=session_obj)
            setting = await store.get(key)
            if setting is None:
                logger.debug("settings.not_found", key=key)
                return None
            return setting.value if setting.value is not None else setting.default_value

    async def _get_typed(
        self,
        key: str,
        expected_types: type | tuple[type, ...],
        type_name: str,
        *,
        default: Any = None,  # noqa: ANN401
        reject_bool: bool = False,
    ) -> Any:  # noqa: ANN401
        """Fetch a setting and validate its runtime type.

        Args:
            key: Dot-namespaced setting key.
            expected_types: Acceptable Python type(s) for the value.
            type_name: Human-readable type name for error messages.
            default: Fallback when the resolved value is ``None``.
            reject_bool: If ``True``, reject ``bool`` values even though
                ``isinstance(True, int)`` is ``True``.

        Returns:
            The validated value.

        Raises:
            SettingTypeError: If the value is ``None`` (with no default) or
                does not match *expected_types*.

        """
        value = await self.get(key)
        if value is None:
            if default is not None:
                return default
            raise SettingTypeError(key, type_name, "None")
        if reject_bool and isinstance(value, bool):
            raise SettingTypeError(key, type_name, "bool")
        if not isinstance(value, expected_types):
            raise SettingTypeError(key, type_name, type(value).__name__)
        return value

    async def get_int(self, key: str, *, default: int | None = None) -> int:
        """Return the setting value as an ``int``.

        Args:
            key: Dot-namespaced setting key.
            default: Fallback when the resolved value is ``None``.

        Raises:
            SettingTypeError: If the value is not an integer.

        """
        return await self._get_typed(key, int, "int", default=default, reject_bool=True)  # type: ignore[no-any-return]

    async def get_float(self, key: str, *, default: float | None = None) -> float:
        """Return the setting value as a ``float``.

        Accepts both ``int`` and ``float`` values; integers are coerced to
        ``float``.

        Args:
            key: Dot-namespaced setting key.
            default: Fallback when the resolved value is ``None``.

        Raises:
            SettingTypeError: If the value is not numeric.

        """
        value = await self._get_typed(key, (int, float), "float", default=default, reject_bool=True)
        return float(value)

    async def get_str(self, key: str, *, default: str | None = None) -> str:
        """Return the setting value as a ``str``.

        Args:
            key: Dot-namespaced setting key.
            default: Fallback when the resolved value is ``None``.

        Raises:
            SettingTypeError: If the value is not a string.

        """
        return await self._get_typed(key, str, "str", default=default)  # type: ignore[no-any-return]

    async def get_bool(self, key: str, *, default: bool | None = None) -> bool:
        """Return the setting value as a ``bool``.

        Args:
            key: Dot-namespaced setting key.
            default: Fallback when the resolved value is ``None``.

        Raises:
            SettingTypeError: If the value is not a boolean.

        """
        return await self._get_typed(key, bool, "bool", default=default)  # type: ignore[no-any-return]

    def invalidate(self, key: str) -> None:
        """No-op placeholder for future cache invalidation.

        Will be used to evict a key when a caching layer (e.g. Redis) is added.
        Retained now to keep the interface stable.

        Args:
            key: Dot-namespaced setting key to evict.

        """


def set_runtime_settings(cache: SettingsCache) -> None:
    """Register the process-wide :class:`SettingsCache` singleton.

    Should be called once during application startup after the session factory
    is ready. Subsequent calls replace the existing singleton.

    Args:
        cache: The :class:`SettingsCache` instance to register.

    """
    global _runtime_settings  # noqa: PLW0603
    _runtime_settings = cache


def get_runtime_settings() -> SettingsCache:
    """Return the process-wide :class:`SettingsCache` singleton.

    Raises:
        RuntimeError: If :func:`set_runtime_settings` has not been called.

    """
    if _runtime_settings is None:
        msg = "SettingsCache has not been initialised. Call set_runtime_settings() at startup."
        raise RuntimeError(msg)
    return _runtime_settings
