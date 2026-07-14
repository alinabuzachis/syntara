"""App-level test infrastructure: env setup and FakeSettingsCache.

Pytest hooks (logging setup, performance marker, worker_id, cleanup) live in
nexus_test_sdk.app._hooks so that importing any app submodule (e.g. mcp_servers)
from a non-test context does not pull in pytest or the nexus package at import time.

All fixture definitions have been split into focused submodules registered via plugin.py:
  - database.py    DB engine, session, cache
  - client.py      session_app, base_client, auth_client, sync_test_client
  - users.py       user_factory, test_user, admin_user, etc.
  - groups.py      test_group, group_with_members, multiple_test_groups
  - temporal.py    temporal_env, temporal_worker, task_queue
  - tools.py       test_mcp_integration, test_tool, tool_factory
  - workflows.py   test_workflow, test_execution, test_activity
  - factories.py   executions_factory, workflow_factory, credential_factory, etc.
  - jwt.py         token_service, jwt_access_token, jwt_client, etc.
  - mocks.py       mock_openrouter_llm, mock_session_factory, mock_websocket, etc.
  - settings.py    override_settings, override_runtime_settings, fast_retry_settings
  - live.py        nexus_base_url, nexus_client, nexus_api

Shared helpers also available as submodules:
  - mock_mcp_provider    MockMCPProvider class
  - mcp_servers          ExampleMCPServer, ForbiddenMCPServer
  - mock_shared_resources  mock SQLModel table implementations
  - files                generate_large_file, get_fixtures_dir
"""

# Prevent local .env from leaking into tests. Must be set before Settings is
# imported, since _get_env_file() is evaluated at class-definition time.
import os as _os
from typing import Any

_os.environ.setdefault("APP_ENV_FILE_PATH", "/dev/null")
_os.environ.setdefault(
    "APP_SECRET_ENCRYPTION_KEY",
    "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
)


# ============================================================================
# FakeSettingsCache — used by temporal.py and settings.py via deferred import
# ============================================================================


class FakeSettingsCache:
    """In-memory SettingsCache replacement for tests.

    Seeded from SETTINGS_CATALOG defaults, with test-specific overrides applied on top.
    """

    def __init__(self, overrides: dict[str, object] | None = None) -> None:
        """Seed from catalog defaults and apply overrides."""
        from nexus.settings.catalog import SETTINGS_CATALOG

        self._store: dict[str, object] = {entry.key: entry.default_value for entry in SETTINGS_CATALOG}
        if overrides:
            unknown = [k for k in overrides if k not in self._store]
            if unknown:
                msg = f"Runtime setting(s) not in SETTINGS_CATALOG: {unknown}"
                raise KeyError(msg)
            self._store.update(overrides)

    async def get(self, key: str) -> Any:  # noqa: ANN401
        """Return the setting value, or None if unknown."""
        return self._store.get(key)

    async def _get_typed(
        self,
        key: str,
        expected_types: type | tuple[type, ...],
        type_name: str,
        *,
        default: Any = None,  # noqa: ANN401
        reject_bool: bool = False,
    ) -> Any:  # noqa: ANN401
        """Fetch a setting and validate its runtime type."""
        from nexus.settings.exceptions import SettingTypeError

        value = await self.get(key)
        if value is None:
            if default is not None:
                return default
            raise SettingTypeError(key, type_name, "None")
        if reject_bool and isinstance(value, bool):
            raise SettingTypeError(key, type_name, "bool")
        if not isinstance(value, expected_types):
            raise SettingTypeError(key, type_name, type(value).__name__)
        return self._validate_against_catalog(key, value, default)

    def _validate_against_catalog(
        self,
        key: str,
        value: Any,  # noqa: ANN401
        default: Any,  # noqa: ANN401
    ) -> Any:  # noqa: ANN401
        """Mirror SettingsCache._validate_against_catalog for test parity."""
        from nexus.settings.catalog import SETTINGS_CATALOG
        from nexus.settings.exceptions import SettingValidationError
        from nexus.settings.validators import validate_setting_value

        defn = next((d for d in SETTINGS_CATALOG if d.key == key), None)
        if defn is None or defn.validation_schema is None:
            return value

        try:
            validate_setting_value(
                key=key,
                value=value,
                value_type=defn.value_type,
                validation_schema=defn.validation_schema,
            )
        except SettingValidationError:
            return defn.default_value if defn.default_value is not None else default

        return value

    async def get_int(self, key: str, *, default: int | None = None) -> int:
        """Return the setting value as an ``int``."""
        return await self._get_typed(key, int, "int", default=default, reject_bool=True)  # type: ignore[no-any-return]

    async def get_float(self, key: str, *, default: float | None = None) -> float:
        """Return the setting value as a ``float``."""
        value = await self._get_typed(key, (int, float), "float", default=default, reject_bool=True)
        return float(value)

    async def get_str(self, key: str, *, default: str | None = None) -> str:
        """Return the setting value as a ``str``."""
        return await self._get_typed(key, str, "str", default=default)  # type: ignore[no-any-return]

    async def get_bool(self, key: str, *, default: bool | None = None) -> bool:
        """Return the setting value as a ``bool``."""
        return await self._get_typed(key, bool, "bool", default=default)  # type: ignore[no-any-return]

    async def invalidate(self, key: str) -> None:
        """Evict key from store."""
        self._store.pop(key, None)

    async def publish_change(self, key: str) -> None:
        """No-op in tests."""

    def on_change(self, key: str, callback: Any) -> None:  # noqa: ANN401
        """Register a callback (no-op in tests — no polling)."""

    def start_watching(self) -> None:
        """No-op in tests."""

    async def stop_watching(self) -> None:
        """No-op in tests."""
