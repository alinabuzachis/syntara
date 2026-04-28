# ruff: noqa: S105, S106, SIM117
"""Unit tests for OIDC service.

Tests cover:
- Discovery configuration fetching
- PKCE generation
- State and nonce generation
- Redis state storage and retrieval
- Token exchange
- ID token validation
- User claims extraction
- Authorization URL building
"""

import hashlib
import json
from base64 import urlsafe_b64encode
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import httpx
import jwt as pyjwt
import pytest
from starlette import status

from nexus.auth.services.oidc_service import (
    OIDC_STATE_KEY_PREFIX,
    OIDC_STATE_TTL_SECONDS,
    OIDCError,
    OIDCService,
)
from nexus.identity_providers.models.identity_provider_configuration import OIDCClaimMapping


@pytest.fixture
def oidc_service() -> OIDCService:
    """Create an OIDCService instance."""
    return OIDCService()


class TestFetchDiscoveryConfig:
    """Tests for fetch_discovery_config method."""

    @pytest.mark.asyncio
    async def test_successful_discovery(self, oidc_service: OIDCService) -> None:
        """Test successful discovery configuration fetch."""
        mock_response = MagicMock()
        mock_response.status_code = status.HTTP_200_OK
        mock_response.json.return_value = {
            "issuer": "https://example.com",
            "authorization_endpoint": "https://example.com/authorize",
            "token_endpoint": "https://example.com/token",
            "jwks_uri": "https://example.com/jwks",
            "userinfo_endpoint": "https://example.com/userinfo",
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("nexus.auth.services.oidc_service.httpx.AsyncClient", return_value=mock_client):
            config = await oidc_service.fetch_discovery_config("https://example.com")

        assert config["issuer"] == "https://example.com"
        assert config["authorization_endpoint"] == "https://example.com/authorize"
        assert config["token_endpoint"] == "https://example.com/token"
        assert config["jwks_uri"] == "https://example.com/jwks"

        mock_client.get.assert_called_once_with("https://example.com/.well-known/openid-configuration")

    @pytest.mark.asyncio
    async def test_discovery_timeout(self, oidc_service: OIDCService) -> None:
        """Test discovery request timeout."""
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("nexus.auth.services.oidc_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(OIDCError, match="Discovery request timed out"):
                await oidc_service.fetch_discovery_config("https://example.com")

    @pytest.mark.asyncio
    async def test_discovery_non_200_status(self, oidc_service: OIDCService) -> None:
        """Test discovery with non-200 status code."""
        mock_response = MagicMock()
        mock_response.status_code = status.HTTP_404_NOT_FOUND

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("nexus.auth.services.oidc_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(OIDCError, match="Discovery endpoint returned HTTP 404"):
                await oidc_service.fetch_discovery_config("https://example.com")

    @pytest.mark.asyncio
    async def test_discovery_missing_required_fields(self, oidc_service: OIDCService) -> None:
        """Test discovery with missing required fields."""
        mock_response = MagicMock()
        mock_response.status_code = status.HTTP_200_OK
        mock_response.json.return_value = {
            "issuer": "https://example.com",
            "authorization_endpoint": "https://example.com/authorize",
            # Missing token_endpoint and jwks_uri
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("nexus.auth.services.oidc_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(OIDCError, match="Discovery response missing"):
                await oidc_service.fetch_discovery_config("https://example.com")

    @pytest.mark.asyncio
    async def test_discovery_request_error(self, oidc_service: OIDCService) -> None:
        """Test discovery with request error."""
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.RequestError("Connection failed", request=MagicMock()))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("nexus.auth.services.oidc_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(OIDCError, match="Discovery request failed"):
                await oidc_service.fetch_discovery_config("https://example.com")

    @pytest.mark.asyncio
    async def test_discovery_follows_redirects(self, oidc_service: OIDCService) -> None:
        """Test that discovery request follows redirects."""
        mock_response = MagicMock()
        mock_response.status_code = status.HTTP_200_OK
        mock_response.json.return_value = {
            "issuer": "https://example.com",
            "authorization_endpoint": "https://example.com/authorize",
            "token_endpoint": "https://example.com/token",
            "jwks_uri": "https://example.com/jwks",
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("nexus.auth.services.oidc_service.httpx.AsyncClient") as mock_async_client:
            mock_async_client.return_value = mock_client
            await oidc_service.fetch_discovery_config("https://example.com")

            # Verify AsyncClient was created with follow_redirects=True
            mock_async_client.assert_called_once_with(timeout=10.0, follow_redirects=True)


class TestGeneratePKCE:
    """Tests for generate_pkce method."""

    def test_generates_verifier_and_challenge(self, oidc_service: OIDCService) -> None:
        """Test that PKCE generates both verifier and challenge."""
        code_verifier, code_challenge = oidc_service.generate_pkce()

        assert isinstance(code_verifier, str)
        assert isinstance(code_challenge, str)
        assert len(code_verifier) > 0
        assert len(code_challenge) > 0

    def test_challenge_is_sha256_of_verifier(self, oidc_service: OIDCService) -> None:
        """Test that code challenge is S256 of verifier."""
        code_verifier, code_challenge = oidc_service.generate_pkce()

        # Manually compute expected challenge
        digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
        expected_challenge = urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")

        assert code_challenge == expected_challenge

    def test_generates_unique_values(self, oidc_service: OIDCService) -> None:
        """Test that multiple calls generate unique values."""
        verifier1, challenge1 = oidc_service.generate_pkce()
        verifier2, challenge2 = oidc_service.generate_pkce()

        assert verifier1 != verifier2
        assert challenge1 != challenge2


class TestGenerateStateAndNonce:
    """Tests for generate_state_and_nonce method."""

    def test_generates_state_and_nonce(self, oidc_service: OIDCService) -> None:
        """Test that state and nonce are generated."""
        state, nonce = oidc_service.generate_state_and_nonce()

        assert isinstance(state, str)
        assert isinstance(nonce, str)
        assert len(state) > 0
        assert len(nonce) > 0

    def test_generates_unique_values(self, oidc_service: OIDCService) -> None:
        """Test that multiple calls generate unique values."""
        state1, nonce1 = oidc_service.generate_state_and_nonce()
        state2, nonce2 = oidc_service.generate_state_and_nonce()

        assert state1 != state2
        assert nonce1 != nonce2


class TestStoreOidcState:
    """Tests for store_oidc_state method."""

    @pytest.mark.asyncio
    async def test_stores_state_in_redis_with_ttl(self, oidc_service: OIDCService) -> None:
        """Test that state is stored in Redis with correct TTL."""
        provider_id = uuid4()
        state = "test-state-123"
        nonce = "test-nonce-456"
        code_verifier = "test-verifier-789"

        mock_redis = AsyncMock()
        mock_redis.setex = AsyncMock()
        oidc_service._client = mock_redis

        await oidc_service.store_oidc_state(state, provider_id, nonce, code_verifier)

        expected_key = f"{OIDC_STATE_KEY_PREFIX}{state}"
        mock_redis.setex.assert_called_once()
        call_args = mock_redis.setex.call_args
        assert call_args[0][0] == expected_key
        assert call_args[0][1] == OIDC_STATE_TTL_SECONDS
        # Verify stored envelope contains data and HMAC
        envelope = json.loads(call_args[0][2])
        assert envelope["data"]["provider_id"] == str(provider_id)
        assert envelope["data"]["nonce"] == nonce
        assert envelope["data"]["code_verifier"] == code_verifier
        assert "mac" in envelope


class TestRetrieveOidcState:
    """Tests for retrieve_oidc_state method."""

    @pytest.mark.asyncio
    async def test_retrieves_and_deletes_state(self, oidc_service: OIDCService) -> None:
        """Test that state is retrieved and deleted from Redis."""
        state = "test-state-123"
        provider_id = str(uuid4())
        payload = {
            "provider_id": provider_id,
            "nonce": "test-nonce",
            "code_verifier": "test-verifier",
        }
        raw = json.dumps(payload, sort_keys=True)
        mac = OIDCService._compute_state_hmac(raw)
        stored_data = json.dumps({"data": payload, "mac": mac})

        mock_pipeline = AsyncMock()
        mock_pipeline.get = MagicMock()
        mock_pipeline.delete = MagicMock()
        mock_pipeline.execute = AsyncMock(return_value=[stored_data, 1])

        mock_redis = AsyncMock()
        mock_redis.pipeline = MagicMock(return_value=mock_pipeline)
        oidc_service._client = mock_redis

        result = await oidc_service.retrieve_oidc_state(state)

        assert result is not None
        assert result["provider_id"] == provider_id
        assert result["nonce"] == "test-nonce"
        assert result["code_verifier"] == "test-verifier"

        expected_key = f"{OIDC_STATE_KEY_PREFIX}{state}"
        mock_pipeline.get.assert_called_once_with(expected_key)
        mock_pipeline.delete.assert_called_once_with(expected_key)

    @pytest.mark.asyncio
    async def test_returns_none_for_missing_state(self, oidc_service: OIDCService) -> None:
        """Test that None is returned for missing/expired state."""
        state = "missing-state"

        mock_pipeline = AsyncMock()
        mock_pipeline.get = MagicMock()
        mock_pipeline.delete = MagicMock()
        mock_pipeline.execute = AsyncMock(return_value=[None, 0])

        mock_redis = AsyncMock()
        mock_redis.pipeline = MagicMock(return_value=mock_pipeline)
        oidc_service._client = mock_redis

        result = await oidc_service.retrieve_oidc_state(state)

        assert result is None


class TestExchangeCodeForTokens:
    """Tests for exchange_code_for_tokens method."""

    @pytest.mark.asyncio
    async def test_successful_exchange_200(self, oidc_service: OIDCService) -> None:
        """Test successful token exchange with 200 status."""
        mock_response = MagicMock()
        mock_response.status_code = status.HTTP_200_OK
        mock_response.json.return_value = {
            "access_token": "access-token-123",
            "id_token": "id-token-456",
            "token_type": "Bearer",
            "expires_in": 3600,
        }

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("nexus.auth.services.oidc_service.httpx.AsyncClient", return_value=mock_client):
            tokens = await oidc_service.exchange_code_for_tokens(
                token_endpoint="https://example.com/token",
                code="auth-code-123",
                redirect_uri="https://app.example.com/callback",
                client_id="client-123",
                client_secret="secret-456",
                code_verifier="verifier-789",
            )

        assert tokens["access_token"] == "access-token-123"
        assert tokens["id_token"] == "id-token-456"
        assert tokens["token_type"] == "Bearer"

        # Verify the request was made correctly
        call_args = mock_client.post.call_args
        assert call_args[0][0] == "https://example.com/token"
        assert call_args[1]["data"]["grant_type"] == "authorization_code"
        assert call_args[1]["data"]["code"] == "auth-code-123"
        assert call_args[1]["data"]["code_verifier"] == "verifier-789"

    @pytest.mark.asyncio
    async def test_successful_exchange_201(self, oidc_service: OIDCService) -> None:
        """Test successful token exchange with 201 status."""
        mock_response = MagicMock()
        mock_response.status_code = status.HTTP_201_CREATED
        mock_response.json.return_value = {
            "access_token": "access-token-123",
            "id_token": "id-token-456",
        }

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("nexus.auth.services.oidc_service.httpx.AsyncClient", return_value=mock_client):
            tokens = await oidc_service.exchange_code_for_tokens(
                token_endpoint="https://example.com/token",
                code="auth-code-123",
                redirect_uri="https://app.example.com/callback",
                client_id="client-123",
                client_secret="secret-456",
                code_verifier="verifier-789",
            )

        assert tokens["access_token"] == "access-token-123"
        assert tokens["id_token"] == "id-token-456"

    @pytest.mark.asyncio
    async def test_exchange_failure(self, oidc_service: OIDCService) -> None:
        """Test token exchange failure with error status."""
        mock_response = MagicMock()
        mock_response.status_code = status.HTTP_400_BAD_REQUEST
        mock_response.text = "invalid_grant"

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("nexus.auth.services.oidc_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(OIDCError, match="Token exchange failed with HTTP 400"):
                await oidc_service.exchange_code_for_tokens(
                    token_endpoint="https://example.com/token",
                    code="invalid-code",
                    redirect_uri="https://app.example.com/callback",
                    client_id="client-123",
                    client_secret="secret-456",
                    code_verifier="verifier-789",
                )

    @pytest.mark.asyncio
    async def test_exchange_timeout(self, oidc_service: OIDCService) -> None:
        """Test token exchange timeout."""
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("nexus.auth.services.oidc_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(OIDCError, match="Token exchange request timed out"):
                await oidc_service.exchange_code_for_tokens(
                    token_endpoint="https://example.com/token",
                    code="auth-code-123",
                    redirect_uri="https://app.example.com/callback",
                    client_id="client-123",
                    client_secret="secret-456",
                    code_verifier="verifier-789",
                )

    @pytest.mark.asyncio
    async def test_rejects_http_token_endpoint(self, oidc_service: OIDCService) -> None:
        """Test that token exchange rejects HTTP endpoints (SSRF, AAP-71276)."""
        oidc_service._settings = MagicMock(oidc_allow_private_networks=False)
        with pytest.raises(OIDCError, match="OIDC issuer URL must use HTTPS"):
            await oidc_service.exchange_code_for_tokens(
                token_endpoint="http://example.com/token",
                code="auth-code-123",
                redirect_uri="https://app.example.com/callback",
                client_id="client-123",
                client_secret="secret-456",
                code_verifier="verifier-789",
            )

    @pytest.mark.asyncio
    async def test_rejects_private_ip_token_endpoint(self, oidc_service: OIDCService) -> None:
        """Test that token exchange rejects endpoints resolving to private IPs (SSRF, AAP-71276)."""
        oidc_service._settings = MagicMock(oidc_allow_private_networks=False)
        with patch("nexus.auth.services.oidc_service.socket.getaddrinfo") as mock_getaddrinfo:
            mock_getaddrinfo.return_value = [(None, None, None, None, ("127.0.0.1", 443))]
            with pytest.raises(OIDCError, match="private or internal network"):
                await oidc_service.exchange_code_for_tokens(
                    token_endpoint="https://evil-idp.com/token",
                    code="auth-code-123",
                    redirect_uri="https://app.example.com/callback",
                    client_id="client-123",
                    client_secret="secret-456",
                    code_verifier="verifier-789",
                )

    @pytest.mark.asyncio
    async def test_rejects_non_http_scheme_token_endpoint(self, oidc_service: OIDCService) -> None:
        """Test that token exchange rejects non-HTTP(S) schemes (SSRF, AAP-71276)."""
        oidc_service._settings = MagicMock(oidc_allow_private_networks=False)
        with pytest.raises(OIDCError, match="OIDC issuer URL must use HTTPS"):
            await oidc_service.exchange_code_for_tokens(
                token_endpoint="ftp://example.com/token",
                code="auth-code-123",
                redirect_uri="https://app.example.com/callback",
                client_id="client-123",
                client_secret="secret-456",
                code_verifier="verifier-789",
            )


class TestFetchUserinfo:
    """Tests for fetch_userinfo method (OIDC Core §5.3)."""

    @pytest.mark.asyncio
    async def test_successful_userinfo_fetch(self, oidc_service: OIDCService) -> None:
        """Test successful userinfo fetch returns claims."""
        mock_response = MagicMock()
        mock_response.status_code = status.HTTP_200_OK
        mock_response.json.return_value = {
            "sub": "user-123",
            "email": "user@example.com",
            "name": "Test User",
            "preferred_username": "testuser",
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("nexus.auth.services.oidc_service.httpx.AsyncClient", return_value=mock_client):
            claims = await oidc_service.fetch_userinfo(
                userinfo_endpoint="https://example.com/userinfo",
                access_token="access-token-123",
            )

        assert claims["email"] == "user@example.com"
        assert claims["name"] == "Test User"
        mock_client.get.assert_called_once_with(
            "https://example.com/userinfo",
            headers={"Authorization": "Bearer access-token-123"},
        )

    @pytest.mark.asyncio
    async def test_userinfo_non_200_status(self, oidc_service: OIDCService) -> None:
        """Test userinfo failure with non-200 status."""
        mock_response = MagicMock()
        mock_response.status_code = status.HTTP_401_UNAUTHORIZED

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("nexus.auth.services.oidc_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(OIDCError, match="Userinfo endpoint returned HTTP 401"):
                await oidc_service.fetch_userinfo(
                    userinfo_endpoint="https://example.com/userinfo",
                    access_token="bad-token",
                )

    @pytest.mark.asyncio
    async def test_userinfo_timeout(self, oidc_service: OIDCService) -> None:
        """Test userinfo request timeout."""
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("nexus.auth.services.oidc_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(OIDCError, match="Userinfo request timed out"):
                await oidc_service.fetch_userinfo(
                    userinfo_endpoint="https://example.com/userinfo",
                    access_token="access-token-123",
                )

    @pytest.mark.asyncio
    async def test_userinfo_invalid_json(self, oidc_service: OIDCService) -> None:
        """Test userinfo response with invalid JSON."""
        mock_response = MagicMock()
        mock_response.status_code = status.HTTP_200_OK
        mock_response.json.side_effect = ValueError("Invalid JSON")

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("nexus.auth.services.oidc_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(OIDCError, match="Userinfo response is not valid JSON"):
                await oidc_service.fetch_userinfo(
                    userinfo_endpoint="https://example.com/userinfo",
                    access_token="access-token-123",
                )

    @pytest.mark.asyncio
    async def test_userinfo_ssrf_validation(self, oidc_service: OIDCService) -> None:
        """Test that userinfo endpoint is validated against SSRF."""
        oidc_service._settings = MagicMock(oidc_allow_private_networks=False)
        with pytest.raises(OIDCError, match="OIDC issuer URL must use HTTPS"):
            await oidc_service.fetch_userinfo(
                userinfo_endpoint="http://example.com/userinfo",
                access_token="access-token-123",
            )


class TestValidateIdToken:
    """Tests for validate_id_token method."""

    def test_successful_validation(self, oidc_service: OIDCService) -> None:
        """Test successful ID token validation."""
        claims = {
            "sub": "user-123",
            "iss": "https://example.com",
            "aud": "client-123",
            "nonce": "nonce-456",
            "email": "user@example.com",
            "name": "Test User",
            "exp": int((datetime.now(UTC) + timedelta(hours=1)).timestamp()),
            "iat": int(datetime.now(UTC).timestamp()),
        }

        mock_signing_key = MagicMock()
        mock_signing_key.key = "mock-key"

        mock_jwks_client = MagicMock()
        mock_jwks_client.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with patch("nexus.auth.services.oidc_service._get_jwks_client", return_value=mock_jwks_client):
            with patch("nexus.auth.services.oidc_service.pyjwt.decode", return_value=claims):
                result = oidc_service.validate_id_token(
                    id_token="mock-id-token",
                    jwks_uri="https://example.com/jwks",
                    issuer="https://example.com",
                    client_id="client-123",
                    nonce="nonce-456",
                )

        assert result["sub"] == "user-123"
        assert result["email"] == "user@example.com"
        assert result["nonce"] == "nonce-456"

    def test_expired_token(self, oidc_service: OIDCService) -> None:
        """Test validation fails for expired token."""
        mock_signing_key = MagicMock()
        mock_signing_key.key = "mock-key"

        mock_jwks_client = MagicMock()
        mock_jwks_client.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with (
            patch("nexus.auth.services.oidc_service._get_jwks_client", return_value=mock_jwks_client),
            patch(
                "nexus.auth.services.oidc_service.pyjwt.decode",
                side_effect=pyjwt.ExpiredSignatureError("Token expired"),
            ),
            pytest.raises(OIDCError, match="ID token has expired"),
        ):
            oidc_service.validate_id_token(
                id_token="expired-token",
                jwks_uri="https://example.com/jwks",
                issuer="https://example.com",
                client_id="client-123",
                nonce="nonce-456",
            )

    def test_issuer_mismatch(self, oidc_service: OIDCService) -> None:
        """Test validation fails for issuer mismatch."""
        mock_signing_key = MagicMock()
        mock_signing_key.key = "mock-key"

        mock_jwks_client = MagicMock()
        mock_jwks_client.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with (
            patch("nexus.auth.services.oidc_service._get_jwks_client", return_value=mock_jwks_client),
            patch(
                "nexus.auth.services.oidc_service.pyjwt.decode",
                side_effect=pyjwt.InvalidIssuerError("Issuer mismatch"),
            ),
            pytest.raises(OIDCError, match="ID token issuer mismatch"),
        ):
            oidc_service.validate_id_token(
                id_token="token-with-wrong-issuer",
                jwks_uri="https://example.com/jwks",
                issuer="https://example.com",
                client_id="client-123",
                nonce="nonce-456",
            )

    def test_audience_mismatch(self, oidc_service: OIDCService) -> None:
        """Test validation fails for audience mismatch."""
        mock_signing_key = MagicMock()
        mock_signing_key.key = "mock-key"

        mock_jwks_client = MagicMock()
        mock_jwks_client.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with (
            patch("nexus.auth.services.oidc_service._get_jwks_client", return_value=mock_jwks_client),
            patch(
                "nexus.auth.services.oidc_service.pyjwt.decode",
                side_effect=pyjwt.InvalidAudienceError("Audience mismatch"),
            ),
            pytest.raises(OIDCError, match="ID token audience mismatch"),
        ):
            oidc_service.validate_id_token(
                id_token="token-with-wrong-audience",
                jwks_uri="https://example.com/jwks",
                issuer="https://example.com",
                client_id="client-123",
                nonce="nonce-456",
            )

    def test_nonce_mismatch(self, oidc_service: OIDCService) -> None:
        """Test validation fails for nonce mismatch."""
        claims = {
            "sub": "user-123",
            "iss": "https://example.com",
            "aud": "client-123",
            "nonce": "wrong-nonce",
            "exp": int((datetime.now(UTC) + timedelta(hours=1)).timestamp()),
        }

        mock_signing_key = MagicMock()
        mock_signing_key.key = "mock-key"

        mock_jwks_client = MagicMock()
        mock_jwks_client.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with patch("nexus.auth.services.oidc_service._get_jwks_client", return_value=mock_jwks_client):
            with patch("nexus.auth.services.oidc_service.pyjwt.decode", return_value=claims):
                with pytest.raises(OIDCError, match="ID token nonce mismatch"):
                    oidc_service.validate_id_token(
                        id_token="token-with-wrong-nonce",
                        jwks_uri="https://example.com/jwks",
                        issuer="https://example.com",
                        client_id="client-123",
                        nonce="expected-nonce",
                    )

    def test_rejects_http_jwks_uri(self, oidc_service: OIDCService) -> None:
        """Test that ID token validation rejects HTTP jwks_uri (SSRF, AAP-71276)."""
        oidc_service._settings = MagicMock(oidc_allow_private_networks=False)
        with pytest.raises(OIDCError, match="OIDC issuer URL must use HTTPS"):
            oidc_service.validate_id_token(
                id_token="mock-token",
                jwks_uri="http://example.com/jwks",
                issuer="https://example.com",
                client_id="client-123",
                nonce="nonce-456",
            )

    def test_rejects_private_ip_jwks_uri(self, oidc_service: OIDCService) -> None:
        """Test that ID token validation rejects jwks_uri resolving to private IPs (SSRF, AAP-71276)."""
        oidc_service._settings = MagicMock(oidc_allow_private_networks=False)
        with patch("nexus.auth.services.oidc_service.socket.getaddrinfo") as mock_getaddrinfo:
            mock_getaddrinfo.return_value = [(None, None, None, None, ("10.0.0.1", 443))]
            with pytest.raises(OIDCError, match="private or internal network"):
                oidc_service.validate_id_token(
                    id_token="mock-token",
                    jwks_uri="https://evil-idp.com/jwks",
                    issuer="https://example.com",
                    client_id="client-123",
                    nonce="nonce-456",
                )


class TestExtractUserClaims:
    """Tests for extract_user_claims method."""

    def test_extracts_all_fields(self, oidc_service: OIDCService) -> None:
        """Test extraction of all user claim fields."""
        id_token_claims = {
            "sub": "user-123",
            "email": "user@example.com",
            "name": "Test User",
            "preferred_username": "testuser",
            "other_field": "ignored",
        }

        result = oidc_service.extract_user_claims(id_token_claims)

        assert result["sub"] == "user-123"
        assert result["email"] == "user@example.com"
        assert result["name"] == "Test User"
        assert result["preferred_username"] == "testuser"
        assert "other_field" not in result

    def test_handles_missing_fields(self, oidc_service: OIDCService) -> None:
        """Test extraction with missing optional fields."""
        id_token_claims = {
            "sub": "user-123",
            # All other fields missing
        }

        result = oidc_service.extract_user_claims(id_token_claims)

        assert result["sub"] == "user-123"
        assert result["email"] is None
        assert result["name"] is None
        assert result["preferred_username"] is None

    def test_custom_claim_mapping(self, oidc_service: OIDCService) -> None:
        """Test extraction with custom claim mapping (e.g. Azure AD 'mail' instead of 'email')."""
        mapping = OIDCClaimMapping(
            subject="sub",
            email="mail",
            username="upn",
            full_name="displayName",
        )
        id_token_claims = {
            "sub": "user-456",
            "mail": "azure-user@example.com",
            "upn": "azure-user",
            "displayName": "Azure User",
        }

        result = oidc_service.extract_user_claims(id_token_claims, mapping)

        assert result["sub"] == "user-456"
        assert result["email"] == "azure-user@example.com"
        assert result["preferred_username"] == "azure-user"
        assert result["name"] == "Azure User"

    def test_custom_claim_mapping_with_groups(self, oidc_service: OIDCService) -> None:
        """Test extraction with groups claim mapping."""
        mapping = OIDCClaimMapping(
            subject="sub",
            email="email",
            username="preferred_username",
            full_name="name",
            groups="memberOf",
        )
        id_token_claims = {
            "sub": "user-789",
            "email": "user@example.com",
            "preferred_username": "testuser",
            "name": "Test User",
            "memberOf": "group1,group2",
        }

        result = oidc_service.extract_user_claims(id_token_claims, mapping)

        assert result["groups"] == "group1,group2"

    def test_default_mapping_has_no_groups_key(self, oidc_service: OIDCService) -> None:
        """Test that default mapping does not include groups in result."""
        id_token_claims = {
            "sub": "user-123",
            "groups": "should-be-ignored",
        }

        result = oidc_service.extract_user_claims(id_token_claims)

        assert "groups" not in result


class TestBuildAuthorizationUrl:
    """Tests for build_authorization_url method."""

    def test_builds_url_with_pkce(self, oidc_service: OIDCService) -> None:
        """Test building authorization URL with PKCE."""
        url = oidc_service.build_authorization_url(
            authorization_endpoint="https://example.com/authorize",
            client_id="client-123",
            redirect_uri="https://app.example.com/callback",
            scopes="openid profile email",
            state="state-456",
            nonce="nonce-789",
            code_challenge="challenge-abc",
        )

        assert url.startswith("https://example.com/authorize?")
        assert "response_type=code" in url
        assert "client_id=client-123" in url
        assert "redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback" in url
        assert "scope=openid+profile+email" in url
        assert "state=state-456" in url
        assert "nonce=nonce-789" in url
        assert "code_challenge=challenge-abc" in url
        assert "code_challenge_method=S256" in url

    def test_builds_url_without_pkce(self, oidc_service: OIDCService) -> None:
        """Test building authorization URL without PKCE."""
        url = oidc_service.build_authorization_url(
            authorization_endpoint="https://example.com/authorize",
            client_id="client-123",
            redirect_uri="https://app.example.com/callback",
            scopes="openid profile email",
            state="state-456",
            nonce="nonce-789",
            code_challenge=None,
        )

        assert url.startswith("https://example.com/authorize?")
        assert "response_type=code" in url
        assert "client_id=client-123" in url
        assert "code_challenge" not in url
        assert "code_challenge_method" not in url

    def test_proper_url_encoding(self, oidc_service: OIDCService) -> None:
        """Test that special characters are properly URL encoded."""
        url = oidc_service.build_authorization_url(
            authorization_endpoint="https://example.com/authorize",
            client_id="client with spaces",
            redirect_uri="https://app.example.com/callback?param=value",
            scopes="openid profile email",
            state="state+special/chars",
            nonce="nonce-789",
            code_challenge=None,
        )

        assert "client_id=client+with+spaces" in url
        assert "redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback%3Fparam%3Dvalue" in url
        assert "state=state%2Bspecial%2Fchars" in url
