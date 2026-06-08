"""Cache client utilities for Redis-compatible backends.

Provides a base class (:class:`BaseRedisClient`) for shared connection
lifecycle, plus mixins and composed clients for streams, key-value
caching, pub/sub messaging, and settings.

Abstracted to support redis-compatible backends (Redis, KeyDB, Dragonfly, Valkey).
"""

from nexus.core.cache.base import BaseRedisClient
from nexus.core.cache.settings_client import SettingsRedisClient
from nexus.core.cache.stream import StreamClient

__all__ = ["BaseRedisClient", "SettingsRedisClient", "StreamClient"]
