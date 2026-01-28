"""Cache client utilities for event streaming.

This module provides generic cache Stream clients for flexible event handling.
Currently implemented using Valkey, but abstracted to support other Redis-compatible backends.
"""

from nexus.core.cache.stream import StreamClient

__all__ = ["StreamClient"]
