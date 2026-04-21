"""Shared fixtures for credential integration tests."""

from uuid import uuid4

import pytest_asyncio
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models import Project


@pytest_asyncio.fixture
async def test_project_id(test_db_session: AsyncSession) -> str:
    """Create a test project and return its ID as a string.

    All credentials require a project_id (Option B — no global credentials).
    This fixture provides a default project for tests that don't care about
    project isolation specifically.
    """
    project = Project(name=f"test-project-{uuid4().hex[:8]}", description="Test project for credentials")
    test_db_session.add(project)
    await test_db_session.commit()
    await test_db_session.refresh(project)
    return str(project.id)
