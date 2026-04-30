"""Test fixtures and helpers for credential tests."""

from uuid import uuid4

from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models import Project
from nexus.core.models import User
from nexus.credentials.models.credential import Credential
from nexus.credentials.models.credential_type import CredentialType


class CredentialFactory:
    """Factory for creating credentials and credential types."""

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize with database session and user."""
        self.session = session
        self.user = user

    async def create_type(self, name: str) -> CredentialType:
        """Create a credential type."""
        ct = CredentialType(
            name=name,
            description=f"Test {name}",
            inputs={"fields": [], "required": []},
            injectors={"extra_vars": {}, "env": {}, "file": {}},
            managed=True,
        )
        self.session.add(ct)
        await self.session.flush()
        return ct

    async def create_project(self, name: str | None = None) -> Project:
        """Create a project for credential assignment."""
        project = Project(
            name=name or f"proj-{uuid4().hex[:8]}",
            description="Test project",
        )
        self.session.add(project)
        await self.session.flush()
        return project

    async def create(
        self,
        credential_type: CredentialType,
        project: Project,
        name: str | None = None,
        *,
        enabled: bool = True,
    ) -> Credential:
        """Create a single credential."""
        cred = Credential(
            name=name or f"cred-{uuid4().hex[:8]}",
            credential_type_id=credential_type.id,
            project_id=project.id,
            created_by=self.user.id,
            enabled=enabled,
        )
        self.session.add(cred)
        await self.session.flush()
        return cred

    async def create_many(
        self,
        credential_type: CredentialType,
        project: Project,
        count: int,
        *,
        prefix: str = "cred",
        enabled: bool = True,
    ) -> list[Credential]:
        """Create multiple credentials of the same type."""
        return [
            await self.create(credential_type, project, name=f"{prefix}-{i}", enabled=enabled) for i in range(count)
        ]
