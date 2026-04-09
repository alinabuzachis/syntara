"""Integration tests for SessionStore with real Redis instance.

These tests require a running Redis instance (configured via environment variables).
They test real interactions including:
- Session creation with TTL
- Session retrieval with metadata
- Session revocation
- Bulk revocation for a user
- Listing user sessions
- TTL expiry behavior
"""

import asyncio
from collections.abc import AsyncGenerator
from uuid import uuid4

import pytest
import pytest_asyncio
import redis.asyncio as redis

from nexus.auth.session.session_store import (
    REFRESH_TOKEN_KEY_PREFIX,
    SessionStore,
)
from nexus.core.config.base import get_settings

pytestmark = pytest.mark.integration


# ============================================================================
# Fixtures
# ============================================================================


@pytest_asyncio.fixture(autouse=True)
async def cleanup_sessions() -> AsyncGenerator[None, None]:
    """Clean up all test session keys before and after each test."""
    settings = get_settings()

    async def _cleanup() -> None:
        client = redis.Redis(
            host=settings.cache_host,
            port=settings.cache_port,
            db=settings.cache_db,
            password=settings.cache_password.get_secret_value() if settings.cache_password else None,
            decode_responses=True,
        )
        try:
            pattern = f"{REFRESH_TOKEN_KEY_PREFIX}*"
            cursor = 0
            while True:
                cursor, keys = await client.scan(cursor, match=pattern, count=100)
                if keys:
                    await client.delete(*keys)
                if cursor == 0:
                    break
        finally:
            await client.aclose()

    await _cleanup()
    yield
    await _cleanup()


# ============================================================================
# Tests
# ============================================================================


class TestSessionCreate:
    """Tests for session creation."""

    @pytest.mark.asyncio
    async def test_create_stores_session(self) -> None:
        """Creating a session should store it in Redis."""
        jti = f"test-{uuid4()}"
        user_id = uuid4()

        async with SessionStore() as store:
            await store.create(
                jti=jti,
                user_id=user_id,
                device="pytest-agent",
                ip_address="127.0.0.1",
            )
            session = await store.get(jti)

        assert session is not None
        assert session.jti == jti
        assert session.user_id == str(user_id)
        assert session.device == "pytest-agent"
        assert session.ip_address == "127.0.0.1"

    @pytest.mark.asyncio
    async def test_create_with_custom_ttl(self) -> None:
        """Session should respect custom TTL."""
        jti = f"test-{uuid4()}"

        async with SessionStore() as store:
            await store.create(
                jti=jti,
                user_id=uuid4(),
                ttl_seconds=60,
            )
            session = await store.get(jti)

        assert session is not None
        assert 0 < session.ttl <= 60

    @pytest.mark.asyncio
    async def test_create_without_optional_fields(self) -> None:
        """Session can be created without device and ip_address."""
        jti = f"test-{uuid4()}"

        async with SessionStore() as store:
            await store.create(jti=jti, user_id=uuid4())
            session = await store.get(jti)

        assert session is not None
        assert session.device is None
        assert session.ip_address is None


class TestSessionGet:
    """Tests for session retrieval."""

    @pytest.mark.asyncio
    async def test_get_nonexistent_returns_none(self) -> None:
        """Getting a nonexistent session should return None."""
        async with SessionStore() as store:
            session = await store.get("nonexistent-jti")

        assert session is None

    @pytest.mark.asyncio
    async def test_get_returns_correct_metadata(self) -> None:
        """Retrieved session should contain all stored metadata."""
        jti = f"test-{uuid4()}"
        user_id = uuid4()

        async with SessionStore() as store:
            await store.create(
                jti=jti,
                user_id=user_id,
                device="Chrome/120",
                ip_address="10.0.0.1",
                ttl_seconds=3600,
            )
            session = await store.get(jti)

        assert session is not None
        assert session.jti == jti
        assert session.user_id == str(user_id)
        assert session.device == "Chrome/120"
        assert session.ip_address == "10.0.0.1"
        assert session.issued_at is not None
        assert session.ttl > 0

    @pytest.mark.asyncio
    async def test_get_expired_session_returns_none(self) -> None:
        """A session with a very short TTL should expire and return None."""
        jti = f"test-{uuid4()}"

        async with SessionStore() as store:
            await store.create(jti=jti, user_id=uuid4(), ttl_seconds=1)
            await asyncio.sleep(1.5)
            session = await store.get(jti)

        assert session is None


class TestSessionRevoke:
    """Tests for session revocation."""

    @pytest.mark.asyncio
    async def test_revoke_existing_returns_true(self) -> None:
        """Revoking an existing session should return True."""
        jti = f"test-{uuid4()}"

        async with SessionStore() as store:
            await store.create(jti=jti, user_id=uuid4(), ttl_seconds=300)
            result = await store.revoke(jti)

        assert result is True

    @pytest.mark.asyncio
    async def test_revoke_removes_session(self) -> None:
        """Revoked session should no longer be retrievable."""
        jti = f"test-{uuid4()}"

        async with SessionStore() as store:
            await store.create(jti=jti, user_id=uuid4(), ttl_seconds=300)
            await store.revoke(jti)
            session = await store.get(jti)

        assert session is None

    @pytest.mark.asyncio
    async def test_revoke_nonexistent_returns_false(self) -> None:
        """Revoking a nonexistent session should return False."""
        async with SessionStore() as store:
            result = await store.revoke("nonexistent-jti")

        assert result is False

    @pytest.mark.asyncio
    async def test_revoke_idempotent(self) -> None:
        """Revoking the same session twice should return False the second time."""
        jti = f"test-{uuid4()}"

        async with SessionStore() as store:
            await store.create(jti=jti, user_id=uuid4(), ttl_seconds=300)
            first = await store.revoke(jti)
            second = await store.revoke(jti)

        assert first is True
        assert second is False


class TestRevokeAllForUser:
    """Tests for bulk user session revocation."""

    @pytest.mark.asyncio
    async def test_revokes_all_sessions_for_user(self) -> None:
        """Should revoke all sessions belonging to a specific user."""
        user_id = uuid4()

        async with SessionStore() as store:
            await store.create(jti=f"test-{uuid4()}", user_id=user_id, ttl_seconds=300)
            await store.create(jti=f"test-{uuid4()}", user_id=user_id, ttl_seconds=300)
            await store.create(jti=f"test-{uuid4()}", user_id=user_id, ttl_seconds=300)

            count = await store.revoke_all_for_user(user_id)

        assert count == 3

    @pytest.mark.asyncio
    async def test_does_not_revoke_other_users_sessions(self) -> None:
        """Should not revoke sessions belonging to other users."""
        user_a = uuid4()
        user_b = uuid4()
        jti_b = f"test-{uuid4()}"

        async with SessionStore() as store:
            await store.create(jti=f"test-{uuid4()}", user_id=user_a, ttl_seconds=300)
            await store.create(jti=jti_b, user_id=user_b, ttl_seconds=300)

            await store.revoke_all_for_user(user_a)

            session_b = await store.get(jti_b)

        assert session_b is not None
        assert session_b.user_id == str(user_b)

    @pytest.mark.asyncio
    async def test_returns_zero_when_no_sessions(self) -> None:
        """Should return 0 when user has no sessions."""
        async with SessionStore() as store:
            count = await store.revoke_all_for_user(uuid4())

        assert count == 0


class TestListUserSessions:
    """Tests for listing user sessions."""

    @pytest.mark.asyncio
    async def test_lists_all_sessions_for_user(self) -> None:
        """Should return all active sessions for a user."""
        user_id = uuid4()

        async with SessionStore() as store:
            await store.create(jti=f"test-{uuid4()}", user_id=user_id, device="Chrome", ttl_seconds=300)
            await store.create(jti=f"test-{uuid4()}", user_id=user_id, device="Firefox", ttl_seconds=300)

            sessions = await store.list_user_sessions(user_id)

        assert len(sessions) == 2
        devices = {s.device for s in sessions}
        assert devices == {"Chrome", "Firefox"}

    @pytest.mark.asyncio
    async def test_does_not_include_other_users(self) -> None:
        """Should only return sessions for the requested user."""
        user_a = uuid4()
        user_b = uuid4()

        async with SessionStore() as store:
            await store.create(jti=f"test-{uuid4()}", user_id=user_a, ttl_seconds=300)
            await store.create(jti=f"test-{uuid4()}", user_id=user_b, ttl_seconds=300)

            sessions = await store.list_user_sessions(user_a)

        assert len(sessions) == 1
        assert sessions[0].user_id == str(user_a)

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_sessions(self) -> None:
        """Should return empty list when user has no sessions."""
        async with SessionStore() as store:
            sessions = await store.list_user_sessions(uuid4())

        assert sessions == []


class TestSessionStoreContextManager:
    """Tests for the async context manager behavior."""

    @pytest.mark.asyncio
    async def test_connects_and_disconnects(self) -> None:
        """Context manager should establish and tear down connection."""
        store = SessionStore()
        assert store._client is None

        async with store:
            assert store._client is not None

        assert store._client is None  # type: ignore[unreachable]

    @pytest.mark.asyncio
    async def test_operations_work_across_context_reuse(self) -> None:
        """Multiple context manager uses should each work independently."""
        jti = f"test-{uuid4()}"
        user_id = uuid4()

        async with SessionStore() as store:
            await store.create(jti=jti, user_id=user_id, ttl_seconds=300)

        async with SessionStore() as store:
            session = await store.get(jti)

        assert session is not None
        assert session.user_id == str(user_id)
