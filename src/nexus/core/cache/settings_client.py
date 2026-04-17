"""Composite Redis client for the settings subsystem.

Combines :class:`CacheMixin` (key-value L2 cache) and
:class:`PubSubMixin` (change-notification pub/sub) into a single
client with one connection pool.
"""

from __future__ import annotations

from nexus.core.cache.base import BaseRedisClient
from nexus.core.cache.cache_client import CacheMixin
from nexus.core.cache.pubsub_client import PubSubMixin


class SettingsRedisClient(BaseRedisClient, CacheMixin, PubSubMixin):
    """Single-pool Redis client for the settings cache.

    Provides both key-value cache ops and pub/sub messaging through
    one underlying connection pool.
    """

    _client_name = "settings"
