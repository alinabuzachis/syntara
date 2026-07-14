"""Shared fixtures for integration/services tests."""

from collections.abc import Generator

import pytest
from nexus_test_sdk.app import FakeSettingsCache


@pytest.fixture(autouse=True)
def _ensure_runtime_settings() -> Generator[None, None, None]:
    """Ensure the SettingsCache singleton is initialised for temporal tests.

    Activities like ``execute_script_activity`` call ``get_runtime_settings()``
    which raises ``RuntimeError`` if the singleton has not been set.
    """
    import nexus.settings.cache.settings_cache as _settings_mod

    original = _settings_mod._runtime_settings
    _settings_mod._runtime_settings = FakeSettingsCache()  # type: ignore[assignment]
    try:
        yield
    finally:
        _settings_mod._runtime_settings = original
