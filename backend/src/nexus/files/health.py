"""File storage health check utilities.

Provides startup validation and runtime health probes for
the configured file storage backend.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

import structlog

from nexus.files.file_manager import get_file_manager
from nexus.files.models.file_metadata import StorageBackend

if TYPE_CHECKING:
    from nexus.core.config.base import Settings

logger = structlog.stdlib.get_logger(__name__)

HEALTH_CHECK_TIMEOUT_SECONDS = 10


async def validate_file_storage_at_startup(settings: Settings) -> None:
    """Validate file storage backend reachability at startup.

    Raises RuntimeError if S3 is the active backend but unreachable,
    preventing the application from starting in a broken state.
    """
    file_manager = get_file_manager()
    if settings.file_storage_backend == StorageBackend.S3:
        s3_retriever = file_manager.retrievers.get(StorageBackend.S3)
        if s3_retriever is None:
            msg = "S3 backend selected but S3 retriever not initialized — check APP_S3_ENDPOINT_URL"
            raise RuntimeError(msg)
        try:
            healthy = await asyncio.wait_for(
                s3_retriever.health_check(),
                timeout=HEALTH_CHECK_TIMEOUT_SECONDS,
            )
        except TimeoutError:
            healthy = False
        if not healthy:
            logger.error(
                "S3 file storage not reachable — cannot start with S3 backend",
                endpoint_url=settings.s3_endpoint_url,
                bucket_name=settings.s3_bucket_name,
            )
            msg = "S3 file storage not reachable"
            raise RuntimeError(msg)
        logger.info("S3 file storage connected", bucket_name=settings.s3_bucket_name)


async def check_file_storage_health() -> str:
    """Probe the active file storage backend.

    Returns one of: ``"ok"``, ``"degraded"``, ``"unavailable"``, ``"error"``.
    Never raises — all failures are caught and mapped to a status string.
    """
    try:
        file_manager = get_file_manager()
        retriever = file_manager.retrievers.get(file_manager.active_backend)
        if retriever is None:
            return "unavailable"
        healthy = await asyncio.wait_for(
            retriever.health_check(),
            timeout=HEALTH_CHECK_TIMEOUT_SECONDS,
        )
        return "ok" if healthy else "degraded"
    except TimeoutError:
        logger.debug("Health check: file storage timed out")
        return "degraded"
    except Exception:  # noqa: BLE001
        logger.debug("Health check: file storage check failed", exc_info=True)
        return "error"
