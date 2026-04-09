"""OIDC authentication service.

Handles the full OpenID Connect authorization code flow with PKCE:
- OIDC discovery configuration fetching
- Authorization URL generation with state/nonce/PKCE
- Authorization code exchange for tokens
- ID token validation (signature, issuer, audience, nonce)
- User claim extraction
"""

import hashlib
import ipaddress
import json
import secrets
import socket
from base64 import urlsafe_b64encode
from functools import lru_cache
from types import TracebackType
from typing import Any
from urllib.parse import urlencode, urlparse
from uuid import UUID

import httpx
import jwt as pyjwt
import redis.asyncio as aioredis
import structlog
from jwt import PyJWKClient
from redis.exceptions import ConnectionError as RedisConnectionError
from starlette import status

from nexus.core.config.base import get_settings

logger = structlog.stdlib.get_logger(__name__)

OIDC_STATE_KEY_PREFIX = "oidc_state:"
OIDC_STATE_TTL_SECONDS = 600  # 10 minutes

# Bounded cache for PyJWKClient instances keyed by jwks_uri.
# PyJWKClient has built-in JWKS caching, but a new instance per call loses the cache.
# LRU eviction prevents unbounded growth when providers are deleted/recreated.
_MAX_JWKS_CLIENTS = 32


@lru_cache(maxsize=_MAX_JWKS_CLIENTS)
def _get_jwks_client(jwks_uri: str) -> PyJWKClient:
    """Return a cached PyJWKClient for the given JWKS URI.

    The LRU cache ensures we reuse the same client (and its internal JWKS
    key-set cache) across calls for the same ``jwks_uri``.  ``PyJWKClient``
    caches the fetched key-set for ``lifespan`` seconds, so repeated
    ``get_signing_key_from_jwt`` calls within that window avoid a network
    round-trip.  See:
    https://github.com/ansible/django-ansible-base/commit/7dfca80
    """
    return PyJWKClient(jwks_uri, timeout=10, cache_jwk_set=True, lifespan=300)


class OIDCError(Exception):
    """Base exception for OIDC flow errors."""


class OIDCService:
    """Service for OIDC authorization code flow with PKCE.

    Manages a single Redis connection for the lifetime of the service instance.
    Use as an async context manager for automatic cleanup:

        async with OIDCService() as svc:
            await svc.store_oidc_state(...)
    """

    def __init__(self) -> None:
        """Initialize OIDC service."""
        self._client: aioredis.Redis | None = None
        self._settings = get_settings()

    async def __aenter__(self) -> "OIDCService":
        """Async context manager entry - establishes Redis connection."""
        self._connect()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        """Async context manager exit - closes Redis connection."""
        await self._disconnect()

    def _connect(self) -> None:
        """Establish connection to Redis."""
        if self._client is None:
            self._client = aioredis.Redis(
                host=self._settings.cache_host,
                port=self._settings.cache_port,
                db=self._settings.cache_db,
                password=(self._settings.cache_password.get_secret_value() if self._settings.cache_password else None),
                decode_responses=True,
            )

    async def _disconnect(self) -> None:
        """Close Redis connection. Safe to call multiple times."""
        if self._client:
            try:
                await self._client.aclose()
            except (RedisConnectionError, OSError) as e:
                logger.warning("Error during OIDC Redis disconnect", error=str(e))
            finally:
                self._client = None

    def _ensure_connected(self) -> aioredis.Redis:
        """Return Redis client, raising if not connected."""
        if self._client is None:
            msg = "OIDCService Redis client not connected. Use 'async with OIDCService()' as context manager."
            raise RuntimeError(msg)
        return self._client

    def _validate_url(self, url: str) -> None:
        """Validate a URL to mitigate SSRF attacks.

        Applied to all outbound OIDC HTTP requests (discovery, token exchange)
        to prevent an attacker-controlled IdP configuration from targeting
        internal services.

        Checks:
        1. URL scheme must be HTTPS (HTTP allowed when private networks enabled).
        2. Hostname must not resolve to a private/internal IP address.

        Note: a TOCTOU DNS rebinding gap exists between this validation and the
        subsequent HTTP request (the hostname is resolved again by httpx).  This
        is an accepted risk.  DNS-pinning (connecting directly to the validated
        IP) was evaluated but rejected because it breaks TLS certificate
        validation, SNI routing, and CDN/WAF compatibility with real-world OIDC
        providers (Azure AD, Google, Okta).  Exploiting the gap requires admin
        access (only admins configure IdPs), control of a DNS server, and
        sub-millisecond timing — an admin already has full system access.

        Args:
            url: The URL to validate

        Raises:
            OIDCError: If the URL fails validation

        """
        parsed = urlparse(url)
        allow_private = self._settings.oidc_allow_private_networks

        # Scheme check: require HTTPS unless private networks are allowed
        if parsed.scheme == "http" and not allow_private:
            msg = "OIDC issuer URL must use HTTPS"
            raise OIDCError(msg)
        if parsed.scheme not in ("https", "http"):
            msg = "OIDC issuer URL must use HTTPS"
            raise OIDCError(msg)

        if allow_private:
            return

        # Hostname resolution check: reject private/internal IPs to prevent SSRF
        hostname = parsed.hostname
        if not hostname:
            msg = "OIDC issuer URL has no hostname"
            raise OIDCError(msg)

        try:
            addr_infos = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
        except socket.gaierror as e:
            msg = f"Cannot resolve OIDC issuer hostname: {hostname}"
            raise OIDCError(msg) from e

        for addr_info in addr_infos:
            ip = ipaddress.ip_address(addr_info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                # Log the actual IP for diagnostics but don't expose it to the caller
                logger.warning("OIDC issuer resolves to private IP", hostname=hostname, ip=str(ip))
                msg = "OIDC issuer URL resolves to a private or internal network address"
                raise OIDCError(msg)

    async def fetch_discovery_config(self, issuer_url: str) -> dict[str, Any]:
        """Fetch OIDC discovery configuration from the provider.

        Args:
            issuer_url: The OIDC issuer URL

        Returns:
            Discovery configuration dictionary

        Raises:
            OIDCError: If discovery fails

        """
        discovery_url = f"{issuer_url.rstrip('/')}/.well-known/openid-configuration"

        # SSRF mitigation: validate URL scheme and resolved IPs.
        # See _validate_url docstring for TOCTOU DNS rebinding notes.
        #
        # Note: follow_redirects=True is intentionally kept on all OIDC HTTP
        # clients.  A redirect-based SSRF bypass would require an admin-configured
        # provider URL to redirect to internal infrastructure; since provider
        # config is admin-only, this is an accepted risk.  Disabling redirects
        # would break legitimate providers behind load balancers or HTTP→HTTPS
        # upgrades.  If stricter controls are needed, a redirect-validating
        # httpx transport hook can be added without breaking existing configs.
        self._validate_url(discovery_url)

        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.get(discovery_url)

            if response.status_code != status.HTTP_200_OK:
                msg = f"Discovery endpoint returned HTTP {response.status_code}"
                raise OIDCError(msg)

            data: dict[str, Any] = response.json()

            required = {"authorization_endpoint", "token_endpoint", "issuer", "jwks_uri"}
            missing = required - set(data.keys())
            if missing:
                msg = f"Discovery response missing: {', '.join(sorted(missing))}"
                raise OIDCError(msg)

            return data

        except httpx.TimeoutException as e:
            msg = f"Discovery request timed out for {issuer_url}"
            raise OIDCError(msg) from e
        except httpx.RequestError as e:
            msg = f"Discovery request failed: {e}"
            raise OIDCError(msg) from e
        except ValueError as e:
            # Covers JSONDecodeError (subclass of ValueError) when the response is not valid JSON
            msg = f"Discovery response is not valid JSON from {issuer_url}"
            raise OIDCError(msg) from e

    def generate_pkce(self) -> tuple[str, str]:
        """Generate PKCE code verifier and challenge.

        Returns:
            Tuple of (code_verifier, code_challenge)

        """
        code_verifier = secrets.token_urlsafe(64)
        digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
        code_challenge = urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
        return code_verifier, code_challenge

    def generate_state_and_nonce(self) -> tuple[str, str]:
        """Generate cryptographically secure state and nonce values.

        Returns:
            Tuple of (state, nonce)

        """
        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(32)
        return state, nonce

    async def store_oidc_state(
        self,
        state: str,
        provider_id: UUID,
        nonce: str,
        code_verifier: str,
        redirect_to: str | None = None,
        origin: str | None = None,
    ) -> None:
        """Store OIDC state in Redis for callback verification.

        Args:
            state: The state parameter
            provider_id: Identity provider UUID
            nonce: The nonce value
            code_verifier: PKCE code verifier
            redirect_to: URL to redirect the user to after successful login
            origin: Frontend origin captured from the authorize request (Referer)

        """
        client = self._ensure_connected()
        key = f"{OIDC_STATE_KEY_PREFIX}{state}"
        state_payload: dict[str, str] = {
            "provider_id": str(provider_id),
            "nonce": nonce,
            "code_verifier": code_verifier,
        }
        if redirect_to:
            state_payload["redirect_to"] = redirect_to
        if origin:
            state_payload["origin"] = origin
        await client.setex(key, OIDC_STATE_TTL_SECONDS, json.dumps(state_payload))
        logger.debug("Stored OIDC state", state=state[:8] + "...")

    async def retrieve_oidc_state(self, state: str) -> dict[str, str] | None:
        """Retrieve and delete OIDC state from Redis.

        Args:
            state: The state parameter from the callback

        Returns:
            State data dict or None if not found/expired

        """
        client = self._ensure_connected()
        key = f"{OIDC_STATE_KEY_PREFIX}{state}"
        pipe = client.pipeline()
        pipe.get(key)
        pipe.delete(key)
        results = await pipe.execute()
        data = results[0]

        if data is None:
            return None

        result: dict[str, str] = json.loads(data)
        return result

    async def exchange_code_for_tokens(
        self,
        token_endpoint: str,
        code: str,
        redirect_uri: str,
        client_id: str,
        client_secret: str,
        code_verifier: str,
    ) -> dict[str, Any]:
        """Exchange authorization code for tokens at the token endpoint.

        Args:
            token_endpoint: Provider's token endpoint URL
            code: Authorization code from the callback
            redirect_uri: The redirect URI used in the authorize request
            client_id: OAuth 2.0 client ID
            client_secret: OAuth 2.0 client secret
            code_verifier: PKCE code verifier

        Returns:
            Token response dictionary containing access_token, id_token, etc.

        Raises:
            OIDCError: If token exchange fails

        """
        # SSRF mitigation: validate token endpoint URL before making the request.
        # The token_endpoint may come from discovery or manual IdP configuration;
        # an attacker who controls IdP config could target internal services (AAP-71276).
        self._validate_url(token_endpoint)

        try:
            token_data: dict[str, str] = {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": client_id,
            }
            if client_secret:
                token_data["client_secret"] = client_secret
            if code_verifier:
                token_data["code_verifier"] = code_verifier

            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.post(
                    token_endpoint,
                    data=token_data,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )

            if response.status_code not in (status.HTTP_200_OK, status.HTTP_201_CREATED):
                error_body = response.text
                logger.warning("Token exchange failed", status=response.status_code, body=error_body[:500])
                msg = f"Token exchange failed with HTTP {response.status_code}"
                raise OIDCError(msg)

            result: dict[str, Any] = response.json()
            return result

        except httpx.TimeoutException as e:
            msg = "Token exchange request timed out"
            raise OIDCError(msg) from e
        except httpx.RequestError as e:
            msg = f"Token exchange request failed: {e}"
            raise OIDCError(msg) from e

    def validate_id_token(
        self,
        id_token: str,
        jwks_uri: str,
        issuer: str,
        client_id: str,
        nonce: str,
    ) -> dict[str, Any]:
        """Validate an OIDC ID token.

        Verifies signature via provider's JWKS, validates issuer, audience, and nonce.

        Args:
            id_token: The raw ID token JWT
            jwks_uri: URL to the provider's JWKS endpoint
            issuer: Expected issuer claim
            client_id: Expected audience claim
            nonce: Expected nonce claim

        Returns:
            Decoded ID token claims

        Raises:
            OIDCError: If validation fails

        """
        # SSRF mitigation: validate jwks_uri before fetching keys.
        # The URI may come from discovery or manual config (AAP-71276).
        self._validate_url(jwks_uri)

        try:
            # PyJWKClient instance is cached via _get_jwks_client (LRU).  Its
            # internal JWKS response cache avoids repeated network fetches, but
            # the signing-key *lookup* itself (~38ms) is performed each call.
            # The LRU on _get_jwks_client ensures we reuse the same client (and
            # its built-in lifespan cache) across calls for the same jwks_uri,
            # which amortises the cost.  See:
            # https://github.com/ansible/django-ansible-base/commit/7dfca80
            jwks_client = _get_jwks_client(jwks_uri)
            signing_key = jwks_client.get_signing_key_from_jwt(id_token)

            claims: dict[str, Any] = pyjwt.decode(
                id_token,
                signing_key.key,
                algorithms=["RS256", "ES256", "PS256"],
                audience=client_id,
                issuer=issuer,
            )

            if claims.get("nonce") != nonce:
                msg = "ID token nonce mismatch"
                raise OIDCError(msg)

            return claims

        except pyjwt.ExpiredSignatureError as e:
            msg = "ID token has expired"
            raise OIDCError(msg) from e
        except pyjwt.InvalidIssuerError as e:
            msg = "ID token issuer mismatch"
            raise OIDCError(msg) from e
        except pyjwt.InvalidAudienceError as e:
            msg = "ID token audience mismatch"
            raise OIDCError(msg) from e
        except pyjwt.PyJWTError as e:
            msg = f"ID token validation failed: {e}"
            raise OIDCError(msg) from e

    async def fetch_userinfo(self, userinfo_endpoint: str, access_token: str) -> dict[str, Any]:
        """Fetch user claims from the OIDC userinfo endpoint.

        Per OIDC Core §5.3, the userinfo endpoint returns claims about the
        authenticated user.  This supplements the ID token when it contains
        only minimal claims (e.g. just ``sub``).

        Args:
            userinfo_endpoint: Provider's userinfo endpoint URL
            access_token: Bearer access token from the token exchange

        Returns:
            Userinfo claims dictionary

        Raises:
            OIDCError: If the request fails

        """
        self._validate_url(userinfo_endpoint)

        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.get(
                    userinfo_endpoint,
                    headers={"Authorization": f"Bearer {access_token}"},
                )

            if response.status_code != status.HTTP_200_OK:
                msg = f"Userinfo endpoint returned HTTP {response.status_code}"
                raise OIDCError(msg)

            result: dict[str, Any] = response.json()
            return result

        except httpx.TimeoutException as e:
            msg = "Userinfo request timed out"
            raise OIDCError(msg) from e
        except httpx.RequestError as e:
            msg = f"Userinfo request failed: {e}"
            raise OIDCError(msg) from e
        except ValueError as e:
            msg = "Userinfo response is not valid JSON"
            raise OIDCError(msg) from e

    def extract_user_claims(self, id_token_claims: dict[str, Any]) -> dict[str, str | None]:
        """Extract user information from ID token claims.

        Args:
            id_token_claims: Decoded ID token claims

        Returns:
            Dict with sub, email, name, preferred_username

        """
        return {
            "sub": id_token_claims.get("sub"),
            "email": id_token_claims.get("email"),
            "name": id_token_claims.get("name"),
            "preferred_username": id_token_claims.get("preferred_username"),
        }

    def build_authorization_url(
        self,
        authorization_endpoint: str,
        client_id: str,
        redirect_uri: str,
        scopes: str,
        state: str,
        nonce: str,
        code_challenge: str | None = None,
    ) -> str:
        """Build the OIDC authorization URL.

        Args:
            authorization_endpoint: Provider's authorization endpoint
            client_id: OAuth 2.0 client ID
            redirect_uri: Callback URL
            scopes: Space-separated scopes
            state: State parameter
            nonce: Nonce parameter
            code_challenge: PKCE code challenge (omit for confidential clients)

        Returns:
            Full authorization URL

        """
        params: dict[str, str] = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": scopes,
            "state": state,
            "nonce": nonce,
        }

        if code_challenge:
            params["code_challenge"] = code_challenge
            params["code_challenge_method"] = "S256"

        return f"{authorization_endpoint}?{urlencode(params)}"
