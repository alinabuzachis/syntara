"""Cache client utilities for event streaming.

This module provides generic cache Stream clients for flexible event handling.
Abstracted to support redis-compatible backends (Redis, KeyDB, Dragonfly, Valkey).
"""

from nexus.core.cache.stream import StreamClient

__all__ = ["StreamClient"]
