"""Settings override fixtures for tests."""

from __future__ import annotations

from collections.abc import Generator
from contextlib import AbstractContextManager, contextmanager
from typing import TYPE_CHECKING, Callable

import pytest

if TYPE_CHECKING:
    from nexus.core.config.base import Settings
    from nexus_test_sdk.app import FakeSettingsCache


@pytest.fixture
def override_settings() -> Callable[..., AbstractContextManager[object]]:
    """Fixture for temporarily overriding settings in tests.

    Example:
        def test_meaning_of_life(override_settings):
            with override_settings(meaning_of_life=42):
                settings = get_settings()
                assert settings.meaning_of_life == 42
    """
    from contextlib import ExitStack
    from unittest.mock import patch

    from nexus.core.config.base import get_settings

    @contextmanager
    def _override(**overrides: object) -> Generator["Settings", None, None]:
        settings = get_settings()
        with ExitStack() as stack:
            for name, value in overrides.items():
                if not hasattr(settings, name):
                    msg = f"Setting '{name}' does not exist on Settings object"
                    raise AttributeError(msg)
                stack.enter_context(patch.object(settings, name, value))
            yield settings

    return _override


@pytest.fixture
def override_runtime_settings() -> Callable[..., AbstractContextManager["FakeSettingsCache"]]:
    """Temporarily override runtime settings in tests.

    Swaps the process-wide SettingsCache singleton with a FakeSettingsCache
    seeded from SETTINGS_CATALOG defaults.

    Example:
        def test_custom_timeout(override_runtime_settings):
            with override_runtime_settings({"context_manager.request_timeout_seconds": 3}):
                ...
    """
    from contextlib import contextmanager

    from nexus_test_sdk.app import FakeSettingsCache

    @contextmanager
    def _override(
        overrides: dict[str, object] | None = None,
        /,
    ) -> Generator["FakeSettingsCache", None, None]:
        import nexus.settings.cache.settings_cache as _mod

        original = _mod._runtime_settings
        fake = FakeSettingsCache(overrides)
        _mod._runtime_settings = fake  # type: ignore[assignment]
        try:
            yield fake
        finally:
            _mod._runtime_settings = original

    return _override


@pytest.fixture
def fast_retry_settings(
    override_settings: Callable[..., AbstractContextManager[object]],
) -> Generator[None, None, None]:
    """Configure fast retry settings for agent orchestrator tests."""
    with override_settings(
        adapter_max_retries=3,
        adapter_initial_backoff_seconds=0.1,
        adapter_backoff_growth_factor=2.0,
        adapter_max_backoff_seconds=1.0,
        adapter_request_timeout_seconds=5.0,
    ):
        yield


@pytest.fixture
def disabled_retry_settings(
    override_settings: Callable[..., AbstractContextManager[object]],
) -> Generator[None, None, None]:
    """Configure disabled retry settings for immediate failure scenarios."""
    with override_settings(
        adapter_max_retries=0,
        adapter_initial_backoff_seconds=1.0,
        adapter_backoff_growth_factor=2.0,
        adapter_max_backoff_seconds=10.0,
        adapter_request_timeout_seconds=30.0,
    ):
        yield


@pytest.fixture
def fast_workflow_client_settings(
    override_settings: Callable[..., AbstractContextManager[object]],
) -> Generator[None, None, None]:
    """Configure fast workflow client settings for approval tests."""
    with override_settings(
        workflow_client_max_retries=2,
        workflow_client_initial_backoff_seconds=0.01,
        workflow_client_backoff_growth_factor=2.0,
        workflow_client_max_backoff_seconds=0.1,
        workflow_client_request_timeout_seconds=1.0,
    ):
        yield
