"""Redis-based session store for refresh token management.

This module provides key-value operations for storing refresh token metadata
in Redis. Unlike the StreamClient (which is for Redis Streams), this class
provides standard key-value operations needed for session management.

Usage:
    from nexus.auth.session import SessionStore

    async with SessionStore() as store:
        # Store new refresh token
        await store.create(
            jti="abc123",
            user_id=user.id,
            device="Mozilla/5.0...",
            ip_address="192.168.1.1",
        )

        # Get token metadata
        session = await store.get("abc123")

        # Revoke token
        await store.revoke("abc123")
"""

import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from types import TracebackType
from uuid import UUID

import redis.asyncio as redis
import structlog
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import ResponseError

from nexus.core.config.base import get_settings

logger = structlog.stdlib.get_logger(__name__)

# Key patterns
REFRESH_TOKEN_KEY_PREFIX = "refresh_token:"  # noqa: S105

# Error messages
_CLIENT_NOT_CONNECTED_ERROR = "Session store client not connected"


@dataclass
class RefreshTokenMetadata:
    """Metadata stored in Redis for a refresh token.

    Attributes:
        user_id: UUID of the user who owns this token
        issued_at: When the token was issued
        device: User agent string or device identifier (for future session management UI)
        ip_address: IP address of the client (for future session management UI)
        amr: Authentication method references (e.g., ["pwd"], ["fed"])
        idp: Identity provider name (e.g., "local", "okta")

    """

    user_id: str
    issued_at: str
    device: str | None = None
    ip_address: str | None = None
    amr: list[str] | None = None
    idp: str | None = None

    def to_json(self) -> str:
        """Serialize to JSON string."""
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, data: str) -> "RefreshTokenMetadata":
        """Deserialize from JSON string."""
        parsed = json.loads(data)
        return cls(**parsed)


@dataclass
class SessionInfo:
    """Information about an active session.

    Attributes:
        jti: JWT ID of the refresh token
        user_id: UUID of the user
        issued_at: When the session was created
        device: User agent string (for future session management UI)
        ip_address: IP address (for future session management UI)
        ttl: Remaining time-to-live in seconds
        amr: Authentication method references
        idp: Identity provider name

    """

    jti: str
    user_id: str
    issued_at: datetime
    device: str | None
    ip_address: str | None
    ttl: int = field(default=-1)
    amr: list[str] | None = None
    idp: str | None = None


class SessionStore:
    """Redis-based session store for refresh token management.

    Provides key-value operations for storing and managing refresh token
    metadata. Uses connection pooling for efficient Redis access.

    Recommended usage is as an async context manager for automatic cleanup.
    """

    def __init__(self) -> None:
        """Initialize session store with configuration from settings."""
        self._client: redis.Redis | None = None
        self._settings = get_settings()

    async def __aenter__(self) -> "SessionStore":
        """Async context manager entry - establishes connection."""
        self.connect()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        """Async context manager exit - closes connection."""
        await self.disconnect()

    def connect(self) -> None:
        """Establish connection to Redis.

        Creates a Redis client with configured host, port, database, password,
        and connection pool size.

        Raises:
            RedisConnectionError: If client initialization fails

        """
        if self._client is None:
            try:
                self._client = redis.Redis(
                    host=self._settings.cache_host,
                    port=self._settings.cache_port,
                    db=self._settings.cache_db,
                    password=(
                        self._settings.cache_password.get_secret_value() if self._settings.cache_password else None
                    ),
                    decode_responses=True,
                    max_connections=self._settings.cache_connection_pool_size,
                )
                logger.info("Connected to session store")
            except RedisConnectionError:
                logger.exception("Failed to connect to session store")
                raise
            except OSError as e:
                logger.exception("Network error connecting to session store")
                msg = f"Network error: {e}"
                raise RedisConnectionError(msg) from e

    async def disconnect(self) -> None:
        """Close Redis connection and cleanup resources.

        Safe to call multiple times.
        """
        if self._client:
            try:
                await self._client.aclose()
                self._client = None
                logger.info("Disconnected from session store")
            except (RedisConnectionError, OSError) as e:
                logger.warning("Error during session store disconnect", error=str(e))
                self._client = None

    def _ensure_connected(self) -> redis.Redis:
        """Ensure client is connected and return it.

        Returns:
            Connected Redis client

        Raises:
            RedisConnectionError: If not connected

        """
        if self._client is None:
            self.connect()
        if self._client is None:
            raise RedisConnectionError(_CLIENT_NOT_CONNECTED_ERROR)
        return self._client

    def _make_key(self, jti: str) -> str:
        """Create Redis key for a refresh token JTI."""
        return f"{REFRESH_TOKEN_KEY_PREFIX}{jti}"

    async def create(
        self,
        jti: str,
        user_id: UUID | str,
        *,
        device: str | None = None,
        ip_address: str | None = None,
        ttl_seconds: int | None = None,
        amr: list[str] | None = None,
        idp: str | None = None,
    ) -> None:
        """Store refresh token metadata in Redis.

        Args:
            jti: JWT ID of the refresh token
            user_id: User UUID
            device: User agent string or device identifier
            ip_address: Client IP address
            ttl_seconds: Time-to-live in seconds (defaults to refresh token lifetime)
            amr: Authentication method references (e.g., ["pwd"], ["fed"])
            idp: Identity provider name (e.g., "local", "okta")

        Raises:
            RedisConnectionError: If connection fails

        """
        client = self._ensure_connected()

        if ttl_seconds is None:
            ttl_seconds = self._settings.jwt_refresh_token_lifetime_hours * 3600

        metadata = RefreshTokenMetadata(
            user_id=str(user_id),
            issued_at=datetime.now(UTC).isoformat(),
            device=device,
            ip_address=ip_address,
            amr=amr,
            idp=idp,
        )

        key = self._make_key(jti)

        try:
            await client.setex(key, ttl_seconds, metadata.to_json())
            logger.debug(
                "Created refresh token session",
                jti=jti,
                user_id=str(user_id),
                ttl_seconds=ttl_seconds,
            )
        except (RedisConnectionError, ResponseError) as e:
            logger.exception("Failed to create refresh token session", jti=jti)
            raise RedisConnectionError from e

    async def get(self, jti: str) -> SessionInfo | None:
        """Get refresh token metadata from Redis.

        Args:
            jti: JWT ID of the refresh token

        Returns:
            SessionInfo if found, None if not found or expired

        Raises:
            RedisConnectionError: If connection fails

        """
        client = self._ensure_connected()
        key = self._make_key(jti)

        try:
            # Get value and TTL in pipeline for efficiency
            pipe = client.pipeline()
            pipe.get(key)
            pipe.ttl(key)
            results = await pipe.execute()

            data, ttl = results[0], results[1]

            if data is None:
                logger.debug("Refresh token not found", jti=jti)
                return None

            metadata = RefreshTokenMetadata.from_json(data)

            return SessionInfo(
                jti=jti,
                user_id=metadata.user_id,
                issued_at=datetime.fromisoformat(metadata.issued_at),
                device=metadata.device,
                ip_address=metadata.ip_address,
                ttl=max(0, ttl),
                amr=metadata.amr,
                idp=metadata.idp,
            )

        except (RedisConnectionError, ResponseError) as e:
            logger.exception("Failed to get refresh token session", jti=jti)
            raise RedisConnectionError from e
        except json.JSONDecodeError:
            logger.exception("Failed to parse refresh token metadata", jti=jti)
            return None

    async def revoke(self, jti: str) -> bool:
        """Revoke (delete) a refresh token.

        Args:
            jti: JWT ID of the refresh token

        Returns:
            True if token was found and deleted, False if not found

        Raises:
            RedisConnectionError: If connection fails

        """
        client = self._ensure_connected()
        key = self._make_key(jti)

        try:
            deleted_count = await client.delete(key)
            if deleted_count > 0:
                logger.debug("Revoked refresh token", jti=jti)
                return True
            logger.debug("Refresh token not found for revocation", jti=jti)
            return False

        except (RedisConnectionError, ResponseError) as e:
            logger.exception("Failed to revoke refresh token", jti=jti)
            raise RedisConnectionError from e

    async def _revoke_key_if_owned(self, client: redis.Redis, key: str, user_id_str: str) -> bool:
        """Delete a refresh token key if it belongs to the given user.

        Captures the TTL before ``GETDEL`` so the key can be restored with
        its original expiration if it belongs to a different user.  Uses
        ``GETDEL`` for an atomic read-and-delete to prevent double-counting
        when multiple instances call ``revoke_all_for_user`` concurrently.

        Returns:
            True if the key was revoked, False otherwise.

        """
        # Capture TTL before deletion so we can restore it if needed
        remaining_ttl = await client.ttl(key)
        data = await client.getdel(key)
        if not data:
            return False
        try:
            metadata = RefreshTokenMetadata.from_json(data)
        except json.JSONDecodeError:
            return False
        if metadata.user_id != user_id_str:
            # Key belongs to a different user — restore with original TTL.
            if remaining_ttl > 0:
                await client.set(key, data, ex=remaining_ttl)
            else:
                await client.set(key, data)
            return False
        return True

    async def revoke_all_for_user(self, user_id: UUID | str) -> int:
        """Revoke all refresh tokens for a user.

        Scans all refresh tokens and deletes those belonging to the specified user.

        Args:
            user_id: User UUID

        Returns:
            Number of tokens revoked

        Raises:
            RedisConnectionError: If connection fails

        """
        client = self._ensure_connected()
        user_id_str = str(user_id)
        revoked_count = 0

        try:
            pattern = f"{REFRESH_TOKEN_KEY_PREFIX}*"
            cursor = 0

            while True:
                cursor, keys = await client.scan(cursor, match=pattern, count=100)

                for key in keys:
                    if await self._revoke_key_if_owned(client, key, user_id_str):
                        revoked_count += 1

                if cursor == 0:
                    break

            logger.info(
                "Revoked all refresh tokens for user",
                user_id=user_id_str,
                revoked_count=revoked_count,
            )
            return revoked_count

        except (RedisConnectionError, ResponseError) as e:
            logger.exception("Failed to revoke all tokens for user", user_id=user_id_str)
            raise RedisConnectionError from e

    async def _session_for_key(self, client: redis.Redis, key: str, user_id_str: str) -> SessionInfo | None:
        """Return a SessionInfo if the key belongs to the given user, else None."""
        pipe = client.pipeline()
        pipe.get(key)
        pipe.ttl(key)
        results = await pipe.execute()
        data, ttl = results[0], results[1]

        if not data:
            return None
        try:
            metadata = RefreshTokenMetadata.from_json(data)
        except json.JSONDecodeError:
            return None
        if metadata.user_id != user_id_str:
            return None

        jti = key[len(REFRESH_TOKEN_KEY_PREFIX) :]
        return SessionInfo(
            jti=jti,
            user_id=metadata.user_id,
            issued_at=datetime.fromisoformat(metadata.issued_at),
            device=metadata.device,
            ip_address=metadata.ip_address,
            ttl=max(0, ttl),
            amr=metadata.amr,
            idp=metadata.idp,
        )

    async def list_user_sessions(self, user_id: UUID | str) -> list[SessionInfo]:
        """List all active sessions for a user.

        Args:
            user_id: User UUID

        Returns:
            List of active sessions

        Raises:
            RedisConnectionError: If connection fails

        """
        client = self._ensure_connected()
        user_id_str = str(user_id)
        sessions: list[SessionInfo] = []

        try:
            pattern = f"{REFRESH_TOKEN_KEY_PREFIX}*"
            cursor = 0

            while True:
                cursor, keys = await client.scan(cursor, match=pattern, count=100)

                for key in keys:
                    session = await self._session_for_key(client, key, user_id_str)
                    if session:
                        sessions.append(session)

                if cursor == 0:
                    break

            return sessions

        except (RedisConnectionError, ResponseError) as e:
            logger.exception("Failed to list user sessions", user_id=user_id_str)
            raise RedisConnectionError from e
