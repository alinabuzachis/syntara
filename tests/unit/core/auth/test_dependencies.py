"""Unit tests for auth dependencies (get_current_user, get_token_payload)."""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.security import HTTPAuthorizationCredentials

from nexus.auth.dependencies import (
    _user_from_payload,
    get_current_user,
    get_token_payload,
)
from nexus.auth.exceptions import AuthenticationRequiredError, InvalidTokenError
from nexus.auth.services.token_service import TokenPayload


def _make_payload(
    *,
    sub: str | None = None,
    preferred_username: str = "testuser",
    email: str = "test@example.com",
) -> TokenPayload:
    return TokenPayload(
        sub=sub or str(uuid4()),
        iss="http://localhost:8000",
        iat=datetime.now(UTC),
        exp=datetime.now(UTC) + timedelta(minutes=15),
        token_type="access",  # noqa: S106
        preferred_username=preferred_username,
        email=email,
        groups=["eng"],
        amr=["pwd"],
        idp="local",
    )


class TestUserFromPayload:
    """Tests for _user_from_payload helper."""

    def test_constructs_user_from_valid_payload(self) -> None:
        """Should build a User with correct fields from token claims."""
        user_id = uuid4()
        payload = _make_payload(sub=str(user_id), preferred_username="alice", email="alice@x.com")

        user = _user_from_payload(payload)

        assert user.id == user_id
        assert user.username == "alice"
        assert user.email == "alice@x.com"
        assert user.is_enabled is True

    def test_raises_invalid_token_for_non_uuid_sub(self) -> None:
        """Should raise InvalidTokenError when sub is not a valid UUID."""
        payload = _make_payload(sub="not-a-uuid")

        with pytest.raises(InvalidTokenError):
            _user_from_payload(payload)

    def test_falls_back_when_optional_claims_are_none(self) -> None:
        """Missing preferred_username and email should fall back to sub-based values."""
        payload = _make_payload()
        payload.preferred_username = None
        payload.email = None
        payload.name = None

        user = _user_from_payload(payload)

        assert user.username == payload.sub
        assert user.email == f"{payload.sub}@unknown"
        assert user.full_name == payload.sub


class TestGetCurrentUser:
    """Tests for get_current_user dependency."""

    @pytest.mark.asyncio
    async def test_raises_when_no_credentials(self) -> None:
        """Should raise AuthenticationRequiredError when credentials are None."""
        request = MagicMock()
        request.headers = {}

        with pytest.raises(AuthenticationRequiredError):
            await get_current_user(request, credentials=None)

    @pytest.mark.asyncio
    async def test_returns_user_for_valid_token(self) -> None:
        """Should return a User for a valid access token."""
        user_id = uuid4()
        payload = _make_payload(sub=str(user_id), preferred_username="bob")

        mock_token_service = MagicMock()
        mock_token_service.decode_token.return_value = payload

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-jwt")
        request = MagicMock()
        request.headers = {}

        with (
            patch("nexus.auth.dependencies._get_token_service", return_value=mock_token_service),
            patch("nexus.auth.services.global_revocation.is_token_globally_revoked", return_value=None),
        ):
            user = await get_current_user(request, credentials=credentials)

        assert user.id == user_id
        assert user.username == "bob"
        mock_token_service.decode_token.assert_called_once_with("valid-jwt", token_type="access")  # noqa: S106

    @pytest.mark.asyncio
    async def test_propagates_invalid_token_error(self) -> None:
        """Should propagate InvalidTokenError from token service."""
        mock_token_service = MagicMock()
        mock_token_service.decode_token.side_effect = InvalidTokenError

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad-jwt")
        request = MagicMock()
        request.headers = {}

        with (
            patch("nexus.auth.dependencies._get_token_service", return_value=mock_token_service),
            pytest.raises(InvalidTokenError),
        ):
            await get_current_user(request, credentials=credentials)


class TestGetTokenPayload:
    """Tests for get_token_payload dependency."""

    @pytest.mark.asyncio
    async def test_raises_when_no_credentials(self) -> None:
        """Should raise AuthenticationRequiredError when credentials are None."""
        request = MagicMock()

        with pytest.raises(AuthenticationRequiredError):
            get_token_payload(request, credentials=None)

    @pytest.mark.asyncio
    async def test_returns_payload_for_valid_token(self) -> None:
        """Should return TokenPayload for a valid access token."""
        payload = _make_payload()

        mock_token_service = MagicMock()
        mock_token_service.decode_token.return_value = payload

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-jwt")
        request = MagicMock()

        with patch("nexus.auth.dependencies._get_token_service", return_value=mock_token_service):
            result = get_token_payload(request, credentials=credentials)

        assert result is payload
