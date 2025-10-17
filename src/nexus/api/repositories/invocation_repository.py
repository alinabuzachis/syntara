"""Repository for invocation persistence operations using SQLAlchemy."""

from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.api.models.invocation import Invocation
from nexus.api.schemas.invocation import InvocationStatus


class InvocationRepository:
    """Repository for managing invocation persistence with SQLAlchemy."""

    def __init__(self, session: AsyncSession) -> None:
        """Initialize repository with database session.

        Args:
            session: SQLAlchemy async session

        """
        self.session = session

    async def create(
        self,
        *,
        prompt: str,
        user_id: str,
        session_id: str,
        context_data: dict[str, Any] | None = None,
    ) -> Invocation:
        """Create a new invocation in the database.

        Args:
            prompt: Natural language user request
            user_id: User identifier
            session_id: Session identifier for multi-tenant isolation
            context_data: Optional context data

        Returns:
            Created invocation ORM model

        Raises:
            Exception: If database operation fails

        """
        invocation = Invocation(
            prompt=prompt,
            user_id=user_id,
            session_id=session_id,
            status=InvocationStatus.RUNNING.value,
            context_data=context_data or {},
        )

        self.session.add(invocation)
        await self.session.flush()  # Flush to populate generated fields
        await self.session.refresh(invocation)  # Refresh to get all defaults

        return invocation

    async def get_by_id(self, invocation_id: UUID) -> Invocation | None:
        """Get invocation by ID.

        Args:
            invocation_id: Invocation UUID

        Returns:
            Invocation ORM model if found, None otherwise

        """
        result = await self.session.execute(select(Invocation).where(Invocation.id == invocation_id))
        return result.scalar_one_or_none()

    async def list_by_status(
        self,
        *,
        status: InvocationStatus | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[Invocation], int]:
        """List invocations with optional status filter.

        Args:
            status: Optional status filter
            limit: Maximum number of results
            offset: Number of results to skip

        Returns:
            Tuple of (list of invocations, total count)

        """
        # Build base query
        query = select(Invocation)

        if status is not None:
            query = query.where(Invocation.status == status.value)

        # Order by created_at descending
        query = query.order_by(Invocation.created_at.desc())

        # Get total count
        count_query = select(func.count()).select_from(Invocation)
        if status is not None:
            count_query = count_query.where(Invocation.status == status.value)

        total_result = await self.session.execute(count_query)
        total = total_result.scalar_one()

        # Apply pagination
        query = query.limit(limit).offset(offset)

        # Execute query
        result = await self.session.execute(query)
        invocations = list(result.scalars().all())

        return invocations, total
