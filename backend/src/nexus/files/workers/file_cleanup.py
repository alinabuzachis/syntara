"""Periodic cleanup of expired files and stale S3 multipart uploads."""

from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import func
from sqlmodel import col, select

from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.core.config.base import get_settings
from nexus.core.database.session import AsyncSessionLocal
from nexus.core.workers.periodic import PeriodicWorker
from nexus.files.audit.file_cleaned_up import FileCleanedUpEvent
from nexus.files.exceptions import FileContentNotFoundError, FileError
from nexus.files.file_manager import get_file_manager
from nexus.files.models.file_metadata import FileMetadata, StorageBackend
from nexus.files.retrievers.s3 import S3FileRetriever

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from sqlmodel.ext.asyncio.session import AsyncSession

    from nexus.files.retrievers.base import BaseRetriever

logger = structlog.stdlib.get_logger(__name__)

_CLEANUP_MAX_BATCHES = 100


async def _try_delete_storage_files(
    retriever: BaseRetriever,
    metadata: FileMetadata,
) -> bool:
    """Delete storage files for a single FileMetadata row. Returns True if the DB row should be removed."""
    try:
        await retriever.delete_file(metadata.file_path)
    except FileContentNotFoundError:
        logger.debug("Storage file already gone", file_id=str(metadata.id), file_path=metadata.file_path)
    except (OSError, FileError):
        logger.warning(
            "Failed to delete storage file, will retry next cycle",
            file_id=str(metadata.id),
            file_path=metadata.file_path,
            exc_info=True,
        )
        return False
    if metadata.converted_content_path:
        try:
            await retriever.delete_file(metadata.converted_content_path)
        except (OSError, FileError):
            logger.debug(
                "Converted file cleanup failed",
                file_id=str(metadata.id),
                path=metadata.converted_content_path,
            )
    return True


async def cleanup_expired_files(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Delete expired files from storage and database, then abort stale S3 multipart uploads."""
    settings = get_settings()
    batch_size = settings.file_cleanup_batch_size
    file_manager = get_file_manager()
    total_deleted = 0

    for _ in range(_CLEANUP_MAX_BATCHES):
        async with session_factory() as session:
            stmt = (
                select(FileMetadata)
                .where(
                    col(FileMetadata.retention_expires_at).isnot(None),
                    col(FileMetadata.retention_expires_at) < func.now(),
                )
                .limit(batch_size)
            )
            rows = (await session.exec(stmt)).all()

        if not rows:
            break

        for metadata in rows:
            retriever = file_manager.retrievers.get(metadata.storage_backend)
            if retriever is None:
                logger.warning(
                    "No retriever for storage backend, deleting DB row only",
                    file_id=str(metadata.id),
                    storage_backend=metadata.storage_backend,
                )
            elif not await _try_delete_storage_files(retriever, metadata):
                continue

            async with session_factory() as session:
                record = await session.get(FileMetadata, metadata.id)
                if record is not None:
                    await session.delete(record)
                    await session.commit()
                    total_deleted += 1

        if len(rows) < batch_size:
            break
    else:
        logger.warning("file_cleanup_hit_batch_cap", deleted_so_far=total_deleted)

    # Phase 2: Abort stale S3 multipart uploads
    multipart_aborted = 0
    s3_retriever = file_manager.retrievers.get(StorageBackend.S3)
    if isinstance(s3_retriever, S3FileRetriever):
        multipart_aborted = await s3_retriever.cleanup_stale_multipart_uploads(
            threshold_hours=settings.file_multipart_cleanup_threshold_hours,
        )

    if total_deleted or multipart_aborted:
        logger.info(
            "file_cleanup_completed",
            files_deleted=total_deleted,
            multipart_uploads_aborted=multipart_aborted,
        )
        AuditEventDispatcher.dispatch(
            FileCleanedUpEvent(
                files_deleted=total_deleted,
                multipart_uploads_aborted=multipart_aborted,
            ),
        )


@lru_cache(maxsize=1)
def get_file_cleanup_worker() -> PeriodicWorker:
    """Create the periodic file cleanup worker."""
    settings = get_settings()
    return PeriodicWorker(
        name="file-lifecycle-cleanup",
        interval_seconds=settings.file_cleanup_interval_seconds,
        session_factory=AsyncSessionLocal,
        callback=cleanup_expired_files,
        coordinate=True,
    )
