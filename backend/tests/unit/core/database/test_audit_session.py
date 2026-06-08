"""Unit tests for audit database session management."""

import importlib
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException, status
from sqlalchemy.exc import DatabaseError

from nexus.core.config import base as config_module
from nexus.core.database import audit_session as audit_session_module


@pytest.mark.asyncio
async def test_engine_pool_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    """Engine pool settings should reflect configured values."""
    monkeypatch.setenv("APP_AUDIT_DB_POOL_SIZE", "10")
    monkeypatch.setenv("APP_AUDIT_DB_MAX_OVERFLOW", "5")
    monkeypatch.setenv("APP_AUDIT_DB_POOL_TIMEOUT_SECONDS", "20")

    try:
        await audit_session_module.audit_engine.dispose()
        config_module.get_settings.cache_clear()

        reloaded = importlib.reload(audit_session_module)
        pool = reloaded.audit_engine.sync_engine.pool

        assert pool.size() == 10
        assert pool.timeout() == 20
        assert pool._max_overflow == 5
    finally:
        await audit_session_module.audit_engine.dispose()
        monkeypatch.undo()
        config_module.get_settings.cache_clear()
        importlib.reload(audit_session_module)


@pytest.mark.asyncio
async def test_get_audit_db_commits_on_success() -> None:
    """Session should be committed when no exception is raised."""
    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch.object(audit_session_module, "AuditSessionLocal", return_value=mock_session):
        gen = audit_session_module.get_audit_db()
        session = await gen.__anext__()
        assert session is mock_session
        with pytest.raises(StopAsyncIteration):
            await gen.__anext__()

    mock_session.commit.assert_awaited_once()
    mock_session.rollback.assert_not_awaited()
    mock_session.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_audit_db_raises_503_on_database_error() -> None:
    """DatabaseError should be converted to an HTTP 503 response."""
    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    orig_exc = DatabaseError("connection refused", params=None, orig=Exception("conn refused"))

    async def _raise_after_yield() -> None:
        gen = audit_session_module.get_audit_db()
        await gen.__anext__()
        await gen.athrow(orig_exc)

    with (
        patch.object(audit_session_module, "AuditSessionLocal", return_value=mock_session),
        pytest.raises(HTTPException) as exc_info,
    ):
        await _raise_after_yield()

    assert exc_info.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert "temporarily unavailable" in exc_info.value.detail
    mock_session.rollback.assert_awaited_once()
    mock_session.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_audit_db_reraises_non_database_errors() -> None:
    """Non-DatabaseError exceptions should propagate unchanged."""
    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    async def _raise_after_yield() -> None:
        gen = audit_session_module.get_audit_db()
        await gen.__anext__()
        await gen.athrow(ValueError("unexpected"))

    with (
        patch.object(audit_session_module, "AuditSessionLocal", return_value=mock_session),
        pytest.raises(ValueError, match="unexpected"),
    ):
        await _raise_after_yield()

    mock_session.rollback.assert_awaited_once()
    mock_session.close.assert_awaited_once()
