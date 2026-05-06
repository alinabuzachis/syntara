"""Unit tests for global token revocation utilities and enforcement."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.security import HTTPAuthorizationCredentials

from nexus.auth.dependencies import get_current_user
from nexus.auth.exceptions import TokenGloballyRevokedError
from nexus.auth.models.global_revocation_timestamp import GlobalRevocationTimestamp
from nexus.auth.services.global_revocation import (
    clear_global_revocation_cache,
    get_global_revocation_timestamp,
    is_token_globally_revoked,
)
from nexus.auth.services.token_service import TokenPayload

_SESSION_LOCAL_PATCH = "nexus.core.database.session.AsyncSessionLocal"


def _make_payload(
    *,
    sub: str | None = None,
    iat: datetime | None = None,
) -> TokenPayload:
    now = datetime.now(UTC)
    return TokenPayload(
        sub=sub or str(uuid4()),
        iss="http://localhost:8000",
        iat=iat or now,
        exp=now + timedelta(minutes=15),
        token_type="access",  # noqa: S106
        preferred_username="testuser",
        email="test@example.com",
        groups=["eng"],
        amr=["pwd"],
        idp="local",
    )


def _mock_db_session_with_row(row: GlobalRevocationTimestamp | None) -> AsyncMock:
    """Build a mock AsyncSessionLocal that returns the given row from exec()."""
    mock_exec_result = MagicMock()
    mock_exec_result.one_or_none.return_value = row

    mock_session = AsyncMock()
    mock_session.exec = AsyncMock(return_value=mock_exec_result)

    return AsyncMock(
        __aenter__=AsyncMock(return_value=mock_session),
        __aexit__=AsyncMock(return_value=False),
    )


# ---------------------------------------------------------------------------
# get_global_revocation_timestamp
# ---------------------------------------------------------------------------


class TestGetGlobalRevocationTimestamp:
    """Tests for get_global_revocation_timestamp."""

    def setup_method(self) -> None:
        clear_global_revocation_cache()

    @pytest.mark.asyncio
    async def test_returns_none_when_no_row(self) -> None:
        """Should return None when no row exists in the table."""
        with patch(
            _SESSION_LOCAL_PATCH,
            return_value=_mock_db_session_with_row(None),
        ):
            result = await get_global_revocation_timestamp()

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_revoked_before_is_null(self) -> None:
        """Should return None when the row exists but revoked_before is NULL."""
        row = MagicMock(spec=GlobalRevocationTimestamp)
        row.revoked_before = None

        with patch(
            _SESSION_LOCAL_PATCH,
            return_value=_mock_db_session_with_row(row),
        ):
            result = await get_global_revocation_timestamp()

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_datetime_when_set(self) -> None:
        """Should return the revocation timestamp when set."""
        ts = datetime(2025, 1, 15, 10, 30, 0, tzinfo=UTC)
        row = MagicMock(spec=GlobalRevocationTimestamp)
        row.revoked_before = ts

        with patch(
            _SESSION_LOCAL_PATCH,
            return_value=_mock_db_session_with_row(row),
        ):
            result = await get_global_revocation_timestamp()

        assert result is not None
        assert result.year == 2025
        assert result.month == 1
        assert result.day == 15


# ---------------------------------------------------------------------------
# is_token_globally_revoked
# ---------------------------------------------------------------------------


class TestIsTokenGloballyRevoked:
    """Tests for is_token_globally_revoked."""

    def setup_method(self) -> None:
        clear_global_revocation_cache()

    @pytest.mark.asyncio
    async def test_returns_none_when_iat_is_none(self) -> None:
        """Should return None when iat is None."""
        result = await is_token_globally_revoked(None)
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_no_revocation_timestamp(self) -> None:
        """Should return None when no revocation timestamp is configured."""
        with patch(
            _SESSION_LOCAL_PATCH,
            return_value=_mock_db_session_with_row(None),
        ):
            result = await is_token_globally_revoked(datetime.now(UTC))

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_revocation_ts_when_iat_before_revocation(self) -> None:
        """Should return revocation timestamp when token was issued before it."""
        revocation_time = datetime.now(UTC)
        token_iat = revocation_time - timedelta(hours=1)

        row = MagicMock(spec=GlobalRevocationTimestamp)
        row.revoked_before = revocation_time

        with patch(
            _SESSION_LOCAL_PATCH,
            return_value=_mock_db_session_with_row(row),
        ):
            result = await is_token_globally_revoked(token_iat)

        assert result is not None
        assert result == revocation_time

    @pytest.mark.asyncio
    async def test_returns_none_when_iat_after_revocation(self) -> None:
        """Should return None when token was issued after revocation timestamp."""
        revocation_time = datetime.now(UTC) - timedelta(hours=1)
        token_iat = datetime.now(UTC)

        row = MagicMock(spec=GlobalRevocationTimestamp)
        row.revoked_before = revocation_time

        with patch(
            _SESSION_LOCAL_PATCH,
            return_value=_mock_db_session_with_row(row),
        ):
            result = await is_token_globally_revoked(token_iat)

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_iat_equals_revocation(self) -> None:
        """Should return None when token was issued at exactly the revocation timestamp."""
        revocation_time = datetime.now(UTC)

        row = MagicMock(spec=GlobalRevocationTimestamp)
        row.revoked_before = revocation_time

        with patch(
            _SESSION_LOCAL_PATCH,
            return_value=_mock_db_session_with_row(row),
        ):
            result = await is_token_globally_revoked(revocation_time)

        assert result is None


# ---------------------------------------------------------------------------
# get_current_user with global revocation
# ---------------------------------------------------------------------------


class TestGetCurrentUserGlobalRevocation:
    """Tests for get_current_user global revocation enforcement."""

    def setup_method(self) -> None:
        clear_global_revocation_cache()

    @pytest.mark.asyncio
    async def test_raises_when_token_globally_revoked(self) -> None:
        """Should raise TokenGloballyRevokedError for pre-revocation tokens."""
        revocation_time = datetime.now(UTC)
        payload = _make_payload(iat=revocation_time - timedelta(hours=1))

        mock_token_service = MagicMock()
        mock_token_service.decode_token.return_value = payload

        row = MagicMock(spec=GlobalRevocationTimestamp)
        row.revoked_before = revocation_time

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="old-jwt")
        request = MagicMock()

        with (
            patch("nexus.auth.dependencies._get_token_service", return_value=mock_token_service),
            patch(
                _SESSION_LOCAL_PATCH,
                return_value=_mock_db_session_with_row(row),
            ),
            patch("nexus.audit.dispatcher.AuditEventDispatcher.dispatch"),
            pytest.raises(TokenGloballyRevokedError),
        ):
            await get_current_user(request, credentials=credentials)

    @pytest.mark.asyncio
    async def test_allows_token_after_revocation(self) -> None:
        """Should allow tokens issued after the revocation timestamp."""
        revocation_time = datetime.now(UTC) - timedelta(hours=1)
        payload = _make_payload(iat=datetime.now(UTC))

        mock_token_service = MagicMock()
        mock_token_service.decode_token.return_value = payload

        row = MagicMock(spec=GlobalRevocationTimestamp)
        row.revoked_before = revocation_time

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="new-jwt")
        request = MagicMock()

        with (
            patch("nexus.auth.dependencies._get_token_service", return_value=mock_token_service),
            patch(
                _SESSION_LOCAL_PATCH,
                return_value=_mock_db_session_with_row(row),
            ),
        ):
            user = await get_current_user(request, credentials=credentials)

        assert user is not None
