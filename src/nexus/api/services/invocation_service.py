"""Service for invocation business logic."""

from sqlalchemy.ext.asyncio import AsyncSession

from nexus.api.models.invocation import Invocation
from nexus.api.repositories.invocation_repository import InvocationRepository
from nexus.api.schemas.invocation import InvocationStatus, InvokeRequest


class InvocationService:
    """Service for managing invocations."""

    def __init__(self, session: AsyncSession) -> None:
        """Initialize service with database session.

        Args:
            session: SQLAlchemy async session

        """
        self.session = session
        self.repository = InvocationRepository(session)

    async def accept_invocation(self, request: InvokeRequest) -> Invocation:
        """Accept an async invocation request and persist it.

        Args:
            request: Invocation request

        Returns:
            Created invocation

        Raises:
            Exception: If creation fails

        """
        return await self.repository.create(
            prompt=request.prompt,
            user_id=request.user_id,
            session_id=request.session_id,
            context_data=request.context,
        )

    async def list_invocations(
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
            Tuple of (invocations list, total count)

        """
        return await self.repository.list_by_status(
            status=status,
            limit=limit,
            offset=offset,
        )
