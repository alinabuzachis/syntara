"""Global token revocation utilities.

Provides helpers that check whether a token was issued before the
system-wide revocation timestamp stored in the
``global_revocation_timestamp`` database table.

Uses an in-process TTLCache (5 s) to avoid a DB query on every
authenticated request.

**Trade-off — post-revocation vulnerability window:**
After an admin triggers a global (or per-user / per-IdP) revocation,
previously issued tokens may still be accepted for up to 5 seconds
while the cached value remains fresh.  In a key-compromise or
bulk-account-takeover scenario this means an attacker with stolen
tokens has a brief window to make authenticated requests.  The 5 s
TTL was chosen to balance request-path performance (avoiding one DB
round-trip per request) against the size of that window.
"""

from __future__ import annotations

from datetime import UTC, datetime

import structlog
from cachetools import TTLCache
from sqlmodel import select

from nexus.auth.models.global_revocation_timestamp import GlobalRevocationTimestamp

logger = structlog.stdlib.get_logger(__name__)

# Cache the singleton value for 5 seconds to avoid a DB round-trip on
# every authenticated request.  maxsize=1 because there is only one
# global revocation timestamp.
_SENTINEL = object()
_revocation_ts_cache: TTLCache[str, datetime | None | object] = TTLCache(maxsize=1, ttl=5)
_CACHE_KEY = "global_revocation_ts"


def clear_global_revocation_cache() -> None:
    """Drop the cached revocation timestamp so the next call hits the DB."""
    _revocation_ts_cache.clear()


async def get_global_revocation_timestamp() -> datetime | None:
    """Return the global revocation timestamp, or ``None`` if unset.

    The value is read from the ``global_revocation_timestamp`` singleton
    table.  Returns ``None`` when no row exists or ``revoked_before``
    is ``NULL``.

    Results are cached for 5 seconds to reduce DB load.
    """
    cached = _revocation_ts_cache.get(_CACHE_KEY, _SENTINEL)
    if cached is not _SENTINEL:
        return cached  # type: ignore[return-value]

    # Lazy import so that test patches on AsyncSessionLocal take effect.
    from nexus.core.database.session import AsyncSessionLocal  # noqa: PLC0415

    async with AsyncSessionLocal() as session:
        result = await session.exec(select(GlobalRevocationTimestamp))
        row = result.one_or_none()

    value = None if (row is None or row.revoked_before is None) else row.revoked_before
    _revocation_ts_cache[_CACHE_KEY] = value
    return value


async def is_token_globally_revoked(iat: datetime | None) -> datetime | None:
    """Check if *iat* precedes the global revocation timestamp.

    Args:
        iat: The token's ``iat`` (issued-at) claim as a datetime.

    Returns:
        The revocation timestamp when the token should be rejected;
        ``None`` otherwise (including when no revocation timestamp is
        configured or *iat* is ``None``).

    """
    if iat is None:
        return None
    revocation_ts = await get_global_revocation_timestamp()
    if revocation_ts is None:
        return None
    # Ensure both are tz-aware for comparison
    if iat.tzinfo is None:
        iat = iat.replace(tzinfo=UTC)
    if revocation_ts.tzinfo is None:
        revocation_ts = revocation_ts.replace(tzinfo=UTC)
    if iat < revocation_ts:
        return revocation_ts
    return None
