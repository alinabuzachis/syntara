"""Factory functions for document conversion services.

This module provides factory functions for creating instances of document conversion
services with proper dependency injection.
"""

from collections.abc import AsyncGenerator, Callable

from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator.context_manager.file_manager import create_file_manager
from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.services.document_conversion_service import (  # noqa: E501
    DocumentConversionService,
)
from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.services.document_conversion_task import (  # noqa: E501
    DocumentConversionTask,
)


def create_conversion_service() -> DocumentConversionService:
    """Create a DocumentConversionService instance with fresh dependencies.

    Returns:
        DocumentConversionService: Fresh service instance

    Example:
        service = create_conversion_service()
        conversion_state = await service.convert_file(file_metadata, status_updater)

    """
    file_manager = create_file_manager()
    return DocumentConversionService(file_manager)


def create_conversion_task(
    session_factory: Callable[[], AsyncGenerator[AsyncSession, None]] | None = None,
) -> DocumentConversionTask:
    """Create a DocumentConversionTask instance with fresh dependencies.

    Args:
        session_factory: Optional session factory for database operations.
                        If None, uses default get_db factory.

    Returns:
        DocumentConversionTask: Fresh task instance

    Example:
        # Default usage
        task = create_conversion_task()
        await task.convert(invocation_id)

        # With custom session factory (e.g., for testing)
        task = create_conversion_task(session_factory=test_db_factory)
        await task.convert(invocation_id)

    """
    service = create_conversion_service()
    if session_factory:
        return DocumentConversionTask(service, session_factory)
    return DocumentConversionTask(service)
