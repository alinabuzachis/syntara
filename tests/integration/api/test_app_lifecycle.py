"""Integration tests for application lifecycle - audit system startup and shutdown."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from nexus.api.main import app
from nexus.audit.dispatcher import AuditEventDispatcher


@asynccontextmanager
async def _test_lifespan_context() -> AsyncGenerator[None, None]:
    """Run the app lifespan with minimal mocking for audit system testing."""
    # Mock OPA client so the lifespan health check passes
    mock_opa_client = AsyncMock()
    mock_opa_client.health = AsyncMock(return_value=True)
    mock_opa_client.start = MagicMock()
    mock_opa_client.stop = AsyncMock()

    with patch("nexus.api.main.OPAClient", return_value=mock_opa_client):
        async with app.router.lifespan_context(app):
            yield


@pytest.mark.asyncio
async def test_audit_dispatcher_registers_handlers_on_startup() -> None:
    """Verify that audit handlers are discovered and registered during app startup (I0).

    This test ensures that the dispatcher bootstrap in main.py successfully:
    1. Discovers handlers from nexus.auth.audit
    2. Registers them with AuditEventDispatcher
    3. Results in a non-empty registry after startup
    """
    # Clear any pre-existing state
    AuditEventDispatcher.reset()
    assert len(AuditEventDispatcher._registry) == 0

    # Run the lifespan - startup should discover and register handlers
    async with _test_lifespan_context():
        # Verify handlers were registered
        assert len(AuditEventDispatcher._registry) > 0, (
            "Expected audit handlers to be registered during startup, but registry is empty"
        )


@pytest.mark.asyncio
async def test_audit_dispatcher_reset_on_shutdown() -> None:
    """Verify that audit dispatcher is reset during app shutdown (I1).

    This test ensures that the shutdown logic in main.py successfully:
    1. Clears the dispatcher registry
    2. Prevents handler accumulation across multiple startup/shutdown cycles
    3. Maintains test isolation
    """
    # Clear any pre-existing state
    AuditEventDispatcher.reset()

    # Run the lifespan cycle - should register on startup and reset on shutdown
    async with _test_lifespan_context():
        # Verify handlers are registered during the lifespan
        assert len(AuditEventDispatcher._registry) > 0

    # After lifespan exits (shutdown complete), registry should be empty
    assert len(AuditEventDispatcher._registry) == 0, (
        "Expected audit dispatcher to be reset on shutdown, but registry still has handlers"
    )


@pytest.mark.asyncio
async def test_multiple_startup_shutdown_cycles_do_not_accumulate_handlers() -> None:
    """Verify that multiple startup/shutdown cycles don't accumulate handlers (I1).

    This test ensures that handlers are properly cleaned up between cycles
    and don't leak across test sessions or app restarts.
    """
    # Clear any pre-existing state
    AuditEventDispatcher.reset()

    # First cycle
    async with _test_lifespan_context():
        first_count = len(AuditEventDispatcher._registry)
        assert first_count > 0

    # Verify cleanup after first cycle
    assert len(AuditEventDispatcher._registry) == 0

    # Second cycle - should register the same number of handlers
    async with _test_lifespan_context():
        second_count = len(AuditEventDispatcher._registry)
        assert second_count == first_count, (
            f"Expected {first_count} handlers in second cycle, but got {second_count}. "
            "Handlers may be accumulating across cycles."
        )

    # Verify cleanup after second cycle
    assert len(AuditEventDispatcher._registry) == 0
