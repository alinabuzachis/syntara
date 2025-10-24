"""Service layer for invocation business logic."""

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import func, select

from nexus.agent_orchestrator.models import Invocation, InvocationStatus
from nexus.core.utils.filters import Filter, apply_filters
from nexus.core.utils.labels import apply_label_filters
from nexus.core.utils.sorting import apply_sorting


class InvocationService:
    """Service for managing invocations.

    This service encapsulates business logic for invocations,
    separating it from HTTP/API concerns.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize service with database session.

        Args:
            session: Database session for queries

        """
        self.session = session

    async def create_invocation(
        self,
        prompt: str,
        created_by: UUID,
        session_id: str,
        context_data: dict[str, object] | None = None,
    ) -> Invocation:
        """Create a new invocation.

        Args:
            prompt: Natural language prompt
            created_by: User UUID who created it
            session_id: Session identifier
            context_data: Optional context data

        Returns:
            Created invocation

        """
        invocation = Invocation(
            prompt=prompt,
            created_by=created_by,
            session_id=session_id,
            status=InvocationStatus.RUNNING,
            context_data=context_data or {},
        )

        self.session.add(invocation)
        await self.session.flush()
        await self.session.refresh(invocation)

        return invocation

    async def list_invocations(
        self,
        filters: list[Filter] | None = None,
        label_filters: dict[str, str] | None = None,
        status_filter: InvocationStatus | None = None,
        sorting: list[tuple[str, Any]] | None = None,
        limit: int = 20,
        *,
        include_total: bool = False,
    ) -> tuple[list[Invocation], int | None]:
        """List invocations with filtering and sorting.

        Args:
            filters: Advanced filters to apply
            label_filters: Label key-value filters
            status_filter: Filter by status
            sorting: List of (field, direction) tuples
            limit: Maximum results
            include_total: Whether to count total

        Returns:
            Tuple of (invocations list, total count or None)

        """
        # Build queries
        query: Any = select(Invocation)
        count_query: Any = select(func.count()).select_from(Invocation)

        # Apply status filter
        if status_filter is not None:
            query = query.where(Invocation.status == status_filter)
            count_query = count_query.where(Invocation.status == status_filter)

        # Apply label filters
        if label_filters:
            query = apply_label_filters(query, label_filters, Invocation)
            count_query = apply_label_filters(count_query, label_filters, Invocation)

        # Apply advanced filters
        if filters:
            query = apply_filters(query, filters, Invocation)
            count_query = apply_filters(count_query, filters, Invocation)

        # Apply sorting
        if sorting:
            query = apply_sorting(query, sorting, Invocation)

        # Apply limit
        query = query.limit(limit)

        # Execute queries
        result = await self.session.execute(query)
        invocations = list(result.scalars().all())

        total_count = None
        if include_total:
            count_result = await self.session.execute(count_query)
            total_count = count_result.scalar_one()

        return invocations, total_count
