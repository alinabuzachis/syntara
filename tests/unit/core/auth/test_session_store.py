# ruff: noqa: PT019
"""Unit tests for SessionStore."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from nexus.auth.session.session_store import (
    IDENTITY_SESSIONS_KEY_PREFIX,
    IDP_SESSIONS_KEY_PREFIX,
    REFRESH_TOKEN_KEY_PREFIX,
    RefreshTokenMetadata,
    SessionStore,
)


def _mock_settings() -> MagicMock:
    mock = MagicMock()
    mock.jwt_refresh_token_lifetime_hours = 8
    mock.redis_url = "redis://localhost:6379"
    return mock


def _make_redis_client(pipe: MagicMock | None = None) -> MagicMock:
    """Create a mock Redis client where pipeline() is sync but pipeline.execute() is async."""
    client = MagicMock()
    if pipe is None:
        pipe = MagicMock()
        pipe.execute = AsyncMock(return_value=[True])
    client.pipeline.return_value = pipe
    return client


class TestCreateIdpIndex:
    """Tests for IDP secondary index maintenance during session creation."""

    @pytest.mark.asyncio
    @patch("nexus.auth.session.session_store.get_settings", return_value=_mock_settings())
    async def test_create_adds_jti_to_idp_set_by_id(self, _patched_settings: MagicMock) -> None:
        """Should add JTI to idp_sessions:{idp_id} set with TTL when idp_id is provided."""
        mock_pipe = MagicMock()
        mock_pipe.execute = AsyncMock(return_value=[True, 1, True])
        mock_client = _make_redis_client(mock_pipe)

        store = SessionStore()
        store._client = mock_client

        await store.create(jti="test-jti", user_id="user-123", idp="Azure", idp_id="provider-uuid-456")

        mock_pipe.setex.assert_called_once()
        mock_pipe.sadd.assert_called_once_with(f"{IDP_SESSIONS_KEY_PREFIX}provider-uuid-456", "test-jti")
        mock_pipe.expire.assert_called_once()
        mock_pipe.execute.assert_called_once()

    @pytest.mark.asyncio
    @patch("nexus.auth.session.session_store.get_settings", return_value=_mock_settings())
    async def test_create_skips_idp_set_when_only_name_provided(self, _patched_settings: MagicMock) -> None:
        """Should not add to IDP set when only idp name is provided without idp_id."""
        mock_pipe = MagicMock()
        mock_pipe.execute = AsyncMock(return_value=[True])
        mock_client = _make_redis_client(mock_pipe)

        store = SessionStore()
        store._client = mock_client

        await store.create(jti="test-jti", user_id="user-123", idp="Azure")

        mock_pipe.setex.assert_called_once()
        mock_pipe.sadd.assert_not_called()

    @pytest.mark.asyncio
    @patch("nexus.auth.session.session_store.get_settings", return_value=_mock_settings())
    async def test_create_skips_idp_set_for_local_auth(self, _patched_settings: MagicMock) -> None:
        """Should not add to IDP set when idp is None (local auth)."""
        mock_pipe = MagicMock()
        mock_pipe.execute = AsyncMock(return_value=[True])
        mock_client = _make_redis_client(mock_pipe)

        store = SessionStore()
        store._client = mock_client

        await store.create(jti="test-jti", user_id="user-123")

        mock_pipe.setex.assert_called_once()
        mock_pipe.sadd.assert_not_called()

    @pytest.mark.asyncio
    @patch("nexus.auth.session.session_store.get_settings", return_value=_mock_settings())
    async def test_create_adds_jti_to_identity_set_when_provided(self, _patched_settings: MagicMock) -> None:
        """Should add JTI to identity_sessions:{identity_id} set with TTL when identity_id is provided."""
        mock_pipe = MagicMock()
        mock_pipe.execute = AsyncMock(return_value=[True, 1, True, 1, True])
        mock_client = _make_redis_client(mock_pipe)

        store = SessionStore()
        store._client = mock_client

        await store.create(
            jti="test-jti",
            user_id="user-123",
            idp="Azure",
            idp_id="provider-uuid-456",
            identity_id="identity-uuid-789",
            issuer="https://login.microsoftonline.com/tenant",
            subject="sub-claim-123",
        )

        mock_pipe.setex.assert_called_once()
        # Should call sadd twice: once for IDP, once for identity
        assert mock_pipe.sadd.call_count == 2
        # Check identity index call
        calls = [str(call) for call in mock_pipe.sadd.call_args_list]
        assert any(f"{IDENTITY_SESSIONS_KEY_PREFIX}identity-uuid-789" in call for call in calls)
        # Should set TTL for both indexes
        assert mock_pipe.expire.call_count == 2

    @pytest.mark.asyncio
    @patch("nexus.auth.session.session_store.get_settings", return_value=_mock_settings())
    async def test_create_skips_identity_set_for_local_auth(self, _patched_settings: MagicMock) -> None:
        """Should not add to identity set when identity_id is None (local auth)."""
        mock_pipe = MagicMock()
        mock_pipe.execute = AsyncMock(return_value=[True])
        mock_client = _make_redis_client(mock_pipe)

        store = SessionStore()
        store._client = mock_client

        await store.create(jti="test-jti", user_id="user-123", identity_id=None)

        mock_pipe.setex.assert_called_once()
        # Should not call sadd for identity index
        mock_pipe.sadd.assert_not_called()


class TestRevokeByIdp:
    """Tests for revoke_by_idp using secondary index."""

    @pytest.mark.asyncio
    async def test_revokes_sessions_using_idp_set(self) -> None:
        """Should use the IDP set index to find and delete sessions."""
        mock_client = _make_redis_client()
        mock_client.smembers = AsyncMock(return_value={b"jti-1", b"jti-2", b"jti-3"})
        mock_client.delete = AsyncMock(return_value=3)

        store = SessionStore()
        store._client = mock_client

        result = await store.revoke_by_idp("Azure")

        assert result == 3
        mock_client.smembers.assert_called_once_with(f"{IDP_SESSIONS_KEY_PREFIX}Azure")
        # Should delete session keys and the index set
        assert mock_client.delete.call_count == 2  # session keys + index set

    @pytest.mark.asyncio
    async def test_returns_zero_when_no_sessions(self) -> None:
        """Should return 0 when IDP has no sessions."""
        mock_client = _make_redis_client()
        mock_client.smembers = AsyncMock(return_value=set())

        store = SessionStore()
        store._client = mock_client

        result = await store.revoke_by_idp("Unknown")

        assert result == 0
        mock_client.delete.assert_not_called()

    @pytest.mark.asyncio
    async def test_cleans_up_index_set_after_revocation(self) -> None:
        """Should delete the IDP index set after revoking sessions."""
        mock_client = _make_redis_client()
        mock_client.smembers = AsyncMock(return_value={b"jti-1"})
        mock_client.delete = AsyncMock(return_value=1)

        store = SessionStore()
        store._client = mock_client

        await store.revoke_by_idp("Okta")

        # Second delete call should be for the index set
        calls = mock_client.delete.call_args_list
        index_key = f"{IDP_SESSIONS_KEY_PREFIX}Okta"
        assert any(index_key in str(call) for call in calls)

    @pytest.mark.asyncio
    async def test_raises_on_redis_error(self) -> None:
        """Should raise RedisConnectionError when Redis fails during revoke_by_idp."""
        mock_client = _make_redis_client()
        mock_client.smembers = AsyncMock(side_effect=RedisConnectionError("connection lost"))

        store = SessionStore()
        store._client = mock_client

        with pytest.raises(RedisConnectionError):
            await store.revoke_by_idp("FailingProvider")


class TestRevokeByIdentity:
    """Tests for revoke_by_identity using identity secondary index."""

    @pytest.mark.asyncio
    async def test_revokes_sessions_using_identity_set(self) -> None:
        """Should use the identity set index to find and delete sessions."""
        mock_client = _make_redis_client()
        mock_client.smembers = AsyncMock(return_value={b"jti-1", b"jti-2"})
        mock_client.delete = AsyncMock(return_value=2)

        store = SessionStore()
        store._client = mock_client

        result = await store.revoke_by_identity("identity-uuid-123")

        assert result == 2
        mock_client.smembers.assert_called_once_with(f"{IDENTITY_SESSIONS_KEY_PREFIX}identity-uuid-123")
        # Should delete session keys and the index set
        assert mock_client.delete.call_count == 2

    @pytest.mark.asyncio
    async def test_returns_zero_when_no_sessions(self) -> None:
        """Should return 0 when identity has no sessions."""
        mock_client = _make_redis_client()
        mock_client.smembers = AsyncMock(return_value=set())

        store = SessionStore()
        store._client = mock_client

        result = await store.revoke_by_identity("unknown-identity")

        assert result == 0
        mock_client.delete.assert_not_called()

    @pytest.mark.asyncio
    async def test_cleans_up_index_set_after_revocation(self) -> None:
        """Should delete the identity index set after revoking sessions."""
        mock_client = _make_redis_client()
        mock_client.smembers = AsyncMock(return_value={b"jti-1"})
        mock_client.delete = AsyncMock(return_value=1)

        store = SessionStore()
        store._client = mock_client

        await store.revoke_by_identity("identity-uuid-456")

        # Second delete call should be for the index set
        calls = mock_client.delete.call_args_list
        index_key = f"{IDENTITY_SESSIONS_KEY_PREFIX}identity-uuid-456"
        assert any(index_key in str(call) for call in calls)

    @pytest.mark.asyncio
    async def test_raises_on_redis_error(self) -> None:
        """Should raise RedisConnectionError when Redis fails during revoke_by_identity."""
        mock_client = _make_redis_client()
        mock_client.smembers = AsyncMock(side_effect=RedisConnectionError("connection lost"))

        store = SessionStore()
        store._client = mock_client

        with pytest.raises(RedisConnectionError):
            await store.revoke_by_identity("failing-identity")


class TestRpLogoutEnabledField:
    """Tests for rp_logout_enabled field on RefreshTokenMetadata and SessionInfo."""

    def test_metadata_serialization_roundtrip(self) -> None:
        """rp_logout_enabled should survive JSON serialization/deserialization."""
        metadata = RefreshTokenMetadata(
            user_id="user-123",
            issued_at=datetime.now(UTC).isoformat(),
            rp_logout_enabled=True,
        )
        json_str = metadata.to_json()
        restored = RefreshTokenMetadata.from_json(json_str)
        assert restored.rp_logout_enabled is True

    def test_metadata_defaults_to_false(self) -> None:
        """rp_logout_enabled should default to False."""
        metadata = RefreshTokenMetadata(
            user_id="user-123",
            issued_at=datetime.now(UTC).isoformat(),
        )
        assert metadata.rp_logout_enabled is False

    def test_metadata_backward_compat_missing_field(self) -> None:
        """Sessions created before the field was added should deserialize with False."""
        import json

        old_data = json.dumps(
            {
                "user_id": "user-123",
                "issued_at": datetime.now(UTC).isoformat(),
            }
        )
        restored = RefreshTokenMetadata.from_json(old_data)
        assert restored.rp_logout_enabled is False

    @pytest.mark.asyncio
    async def test_get_returns_rp_logout_enabled(self) -> None:
        """SessionStore.get should return rp_logout_enabled from stored metadata."""
        metadata = RefreshTokenMetadata(
            user_id="user-123",
            issued_at=datetime.now(UTC).isoformat(),
            rp_logout_enabled=True,
        )

        mock_pipe = MagicMock()
        mock_pipe.execute = AsyncMock(return_value=[metadata.to_json(), 3600])
        mock_client = _make_redis_client(mock_pipe)

        store = SessionStore()
        store._client = mock_client

        result = await store.get("test-jti")

        assert result is not None
        assert result.rp_logout_enabled is True

    @pytest.mark.asyncio
    @patch("nexus.auth.session.session_store.get_settings", return_value=_mock_settings())
    async def test_create_persists_rp_logout_enabled(self, _patched_settings: MagicMock) -> None:
        """SessionStore.create should include rp_logout_enabled in stored metadata."""
        import json

        mock_pipe = MagicMock()
        mock_pipe.execute = AsyncMock(return_value=[True])
        mock_client = _make_redis_client(mock_pipe)

        store = SessionStore()
        store._client = mock_client

        await store.create(jti="test-jti", user_id="user-123", rp_logout_enabled=True)

        # Extract the JSON that was passed to setex
        setex_call = mock_pipe.setex.call_args
        stored_json = setex_call[0][2]  # third positional arg is the value
        stored_data = json.loads(stored_json)
        assert stored_data["rp_logout_enabled"] is True


class TestEnsureConnected:
    """Tests for _ensure_connected."""

    @patch("nexus.auth.session.session_store.get_settings", return_value=_mock_settings())
    def test_raises_when_connect_fails(self, _patched_settings: MagicMock) -> None:
        """Should raise RedisConnectionError when connection cannot be established."""
        store = SessionStore()
        store._client = None
        with (
            patch.object(store, "connect", side_effect=RedisConnectionError("fail")),
            pytest.raises(RedisConnectionError),
        ):
            store._ensure_connected()

    @patch("nexus.auth.session.session_store.get_settings", return_value=_mock_settings())
    def test_returns_client_when_connected(self, _patched_settings: MagicMock) -> None:
        """Should return the client when already connected."""
        store = SessionStore()
        mock_client = MagicMock()
        store._client = mock_client
        assert store._ensure_connected() is mock_client


class TestConnect:
    """Tests for connect and disconnect."""

    @patch("nexus.auth.session.session_store.get_settings", return_value=_mock_settings())
    @patch("nexus.auth.session.session_store.redis.Redis")
    def test_connect_creates_client(self, mock_redis: MagicMock, _patched_settings: MagicMock) -> None:
        """Should create a Redis client on connect."""
        store = SessionStore()
        store.connect()
        mock_redis.assert_called_once()
        assert store._client is not None

    @pytest.mark.asyncio
    @patch("nexus.auth.session.session_store.get_settings", return_value=_mock_settings())
    async def test_disconnect_closes_client(self, _patched_settings: MagicMock) -> None:
        """Should close and clear the client on disconnect."""
        store = SessionStore()
        mock_client = AsyncMock()
        store._client = mock_client

        await store.disconnect()

        mock_client.aclose.assert_called_once()
        assert store._client is None

    @pytest.mark.asyncio
    @patch("nexus.auth.session.session_store.get_settings", return_value=_mock_settings())
    async def test_disconnect_handles_error(self, _patched_settings: MagicMock) -> None:
        """Should clear client even if disconnect fails."""
        store = SessionStore()
        mock_client = AsyncMock()
        mock_client.aclose.side_effect = OSError("connection reset")
        store._client = mock_client

        await store.disconnect()

        assert store._client is None


class TestGet:
    """Tests for SessionStore.get."""

    @pytest.mark.asyncio
    async def test_returns_session_info_when_found(self) -> None:
        """Should return SessionInfo when token exists in Redis."""
        metadata = RefreshTokenMetadata(
            user_id="user-123",
            issued_at=datetime.now(UTC).isoformat(),
            device="test-agent",
            ip_address="127.0.0.1",
            amr=["fed"],
            idp="Azure",
        )

        mock_pipe = MagicMock()
        mock_pipe.execute = AsyncMock(return_value=[metadata.to_json(), 3600])
        mock_client = _make_redis_client(mock_pipe)

        store = SessionStore()
        store._client = mock_client

        result = await store.get("test-jti")

        assert result is not None
        assert result.jti == "test-jti"
        assert result.user_id == "user-123"
        assert result.idp == "Azure"
        assert result.ttl == 3600

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self) -> None:
        """Should return None when token doesn't exist."""
        mock_pipe = MagicMock()
        mock_pipe.execute = AsyncMock(return_value=[None, -2])
        mock_client = _make_redis_client(mock_pipe)

        store = SessionStore()
        store._client = mock_client

        result = await store.get("missing-jti")

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_json_decode_error(self) -> None:
        """Should return None when stored data is not valid JSON."""
        mock_pipe = MagicMock()
        mock_pipe.execute = AsyncMock(return_value=["not-json{", 3600])
        mock_client = _make_redis_client(mock_pipe)

        store = SessionStore()
        store._client = mock_client

        result = await store.get("bad-jti")

        assert result is None


class TestRevoke:
    """Tests for SessionStore.revoke."""

    @pytest.mark.asyncio
    async def test_returns_true_when_deleted(self) -> None:
        """Should return True when token is found and deleted."""
        mock_client = _make_redis_client()
        mock_client.delete = AsyncMock(return_value=1)

        store = SessionStore()
        store._client = mock_client

        result = await store.revoke("test-jti")

        assert result is True
        mock_client.delete.assert_called_once_with(f"{REFRESH_TOKEN_KEY_PREFIX}test-jti")

    @pytest.mark.asyncio
    async def test_returns_false_when_not_found(self) -> None:
        """Should return False when token doesn't exist."""
        mock_client = _make_redis_client()
        mock_client.delete = AsyncMock(return_value=0)

        store = SessionStore()
        store._client = mock_client

        result = await store.revoke("missing-jti")

        assert result is False


class TestRevokeKeyIfOwned:
    """Tests for _revoke_key_if_owned."""

    @pytest.mark.asyncio
    async def test_returns_true_when_user_owns_key(self) -> None:
        """Should return True and delete when key belongs to user."""
        metadata = RefreshTokenMetadata(
            user_id="user-123",
            issued_at=datetime.now(UTC).isoformat(),
        )
        mock_client = _make_redis_client()
        mock_client.ttl = AsyncMock(return_value=3600)
        mock_client.getdel = AsyncMock(return_value=metadata.to_json())

        store = SessionStore()
        store._client = mock_client

        result = await store._revoke_key_if_owned(mock_client, "key", "user-123")

        assert result is True

    @pytest.mark.asyncio
    async def test_restores_key_when_user_does_not_own(self) -> None:
        """Should restore the key when it belongs to a different user."""
        metadata = RefreshTokenMetadata(
            user_id="other-user",
            issued_at=datetime.now(UTC).isoformat(),
        )
        mock_client = _make_redis_client()
        mock_client.ttl = AsyncMock(return_value=3600)
        mock_client.getdel = AsyncMock(return_value=metadata.to_json())
        mock_client.set = AsyncMock()

        store = SessionStore()
        store._client = mock_client

        result = await store._revoke_key_if_owned(mock_client, "key", "user-123")

        assert result is False
        mock_client.set.assert_called_once()

    @pytest.mark.asyncio
    async def test_returns_false_when_key_missing(self) -> None:
        """Should return False when key doesn't exist."""
        mock_client = _make_redis_client()
        mock_client.ttl = AsyncMock(return_value=-2)
        mock_client.getdel = AsyncMock(return_value=None)

        store = SessionStore()
        store._client = mock_client

        result = await store._revoke_key_if_owned(mock_client, "key", "user-123")

        assert result is False


class TestRevokeAllForUser:
    """Tests for revoke_all_for_user."""

    @pytest.mark.asyncio
    async def test_revokes_matching_keys(self) -> None:
        """Should scan and revoke all keys belonging to the user."""
        metadata = RefreshTokenMetadata(
            user_id="user-123",
            issued_at=datetime.now(UTC).isoformat(),
        )

        mock_client = _make_redis_client()
        mock_client.scan = AsyncMock(return_value=(0, [b"refresh_token:jti-1"]))
        mock_client.ttl = AsyncMock(return_value=3600)
        mock_client.getdel = AsyncMock(return_value=metadata.to_json())

        store = SessionStore()
        store._client = mock_client

        result = await store.revoke_all_for_user("user-123")

        assert result == 1


class TestListUserSessions:
    """Tests for list_user_sessions."""

    @pytest.mark.asyncio
    async def test_returns_sessions_for_user(self) -> None:
        """Should return sessions belonging to the user."""
        metadata = RefreshTokenMetadata(
            user_id="user-123",
            issued_at=datetime.now(UTC).isoformat(),
            amr=["pwd"],
            idp="local",
        )

        mock_pipe = MagicMock()
        mock_pipe.execute = AsyncMock(return_value=[metadata.to_json(), 3600])
        mock_client = _make_redis_client(mock_pipe)
        mock_client.scan = AsyncMock(return_value=(0, [b"refresh_token:jti-1"]))

        store = SessionStore()
        store._client = mock_client

        sessions = await store.list_user_sessions("user-123")

        assert len(sessions) == 1
        assert sessions[0].user_id == "user-123"

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_sessions(self) -> None:
        """Should return empty list when user has no sessions."""
        mock_client = _make_redis_client()
        mock_client.scan = AsyncMock(return_value=(0, []))

        store = SessionStore()
        store._client = mock_client

        sessions = await store.list_user_sessions("user-123")

        assert sessions == []

    @pytest.mark.asyncio
    async def test_filters_out_other_users(self) -> None:
        """Should not include sessions from other users."""
        metadata = RefreshTokenMetadata(
            user_id="other-user",
            issued_at=datetime.now(UTC).isoformat(),
        )

        mock_pipe = MagicMock()
        mock_pipe.execute = AsyncMock(return_value=[metadata.to_json(), 3600])
        mock_client = _make_redis_client(mock_pipe)
        mock_client.scan = AsyncMock(return_value=(0, [b"refresh_token:jti-1"]))

        store = SessionStore()
        store._client = mock_client

        sessions = await store.list_user_sessions("user-123")

        assert sessions == []
