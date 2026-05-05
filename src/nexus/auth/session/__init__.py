"""Session management for refresh token storage."""

from __future__ import annotations

from typing import TYPE_CHECKING

from nexus.auth.session.session_store import SessionInfo, SessionStore

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession


def _invalidate_token_version_cache(user_id: str) -> None:
    from nexus.auth.middleware import _token_version_cache  # noqa: PLC0415

    _token_version_cache.pop(user_id, None)


def create_session_store(db: AsyncSession) -> SessionStore:
    """Create a SessionStore wired with token-version cache invalidation."""
    return SessionStore(db, on_token_version_invalidated=_invalidate_token_version_cache)


__all__ = ["SessionInfo", "SessionStore", "create_session_store"]
