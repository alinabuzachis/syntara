"""Test fixtures and helpers for tool provider tests."""

from uuid import uuid4

from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from nexus.tool_manager.models.tool_provider import ToolProvider


class ToolProviderFactory:
    """Factory for creating tool providers."""

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize with database session and user."""
        self.session = session
        self.user = user

    async def create(
        self,
        name: str | None = None,
        *,
        enabled: bool = True,
        provider_type: str = "mcp",
        base_url: str = "http://localhost:8080",
    ) -> ToolProvider:
        """Create a single tool provider."""
        tp = ToolProvider(
            name=name or f"tp-{uuid4().hex[:8]}",
            enabled=enabled,
            created_by=self.user.id,
            configuration={"provider_type": provider_type, "base_url": base_url},
        )
        self.session.add(tp)
        await self.session.flush()
        return tp

    async def create_many(
        self,
        count: int,
        *,
        prefix: str = "tp",
        enabled: bool = True,
        provider_type: str = "mcp",
    ) -> list[ToolProvider]:
        """Create multiple tool providers."""
        return [await self.create(f"{prefix}-{i}", enabled=enabled, provider_type=provider_type) for i in range(count)]
