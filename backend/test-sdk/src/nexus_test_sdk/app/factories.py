"""Factory fixtures for creating test data in bulk."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import pytest_asyncio
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.workflows.models import Workflow
from nexus_test_sdk.helpers.approval import ApprovalsFactory
from nexus_test_sdk.helpers.credential import CredentialFactory
from nexus_test_sdk.helpers.execution import ExecutionFactory
from nexus_test_sdk.helpers.identity_provider import IdentityProviderCreate
from nexus_test_sdk.helpers.integration import IntegrationFactory
from nexus_test_sdk.helpers.token_usage import TokenUsageFactory
from nexus_test_sdk.helpers.workflow import ActivitiesFactory, ExecutionsFactory, WorkflowFactory

if TYPE_CHECKING:
    from nexus.core.models import User


@pytest_asyncio.fixture
async def executions_factory(
    test_db_session: AsyncSession, test_workflow: Workflow, test_user: "User"
) -> ExecutionsFactory:
    """Create a factory fixture for multiple test executions with configurable properties."""
    return ExecutionsFactory(test_db_session, test_workflow, test_user)


@pytest_asyncio.fixture
async def activities_factory(test_db_session: AsyncSession) -> ActivitiesFactory:
    """Create a factory fixture for test activity executions."""
    return ActivitiesFactory(test_db_session)


@pytest_asyncio.fixture
async def workflow_factory(test_db_session: AsyncSession, test_user: "User") -> WorkflowFactory:
    """Factory for creating workflows with versions."""
    from nexus.authz.models.project import Project

    project = Project(name=f"wf-factory-project-{uuid4().hex[:8]}", description="Workflow factory project")
    test_db_session.add(project)
    await test_db_session.flush()
    return WorkflowFactory(test_db_session, test_user, project.id)


@pytest_asyncio.fixture
async def execution_factory(test_db_session: AsyncSession, test_user: "User") -> ExecutionFactory:
    """Factory for creating executions."""
    return ExecutionFactory(test_db_session, test_user)


@pytest_asyncio.fixture
async def credential_factory(test_db_session: AsyncSession, test_user: "User") -> CredentialFactory:
    """Factory for creating credentials and credential types."""
    return CredentialFactory(test_db_session, test_user)


@pytest_asyncio.fixture
async def token_usage_factory(
    test_db_session: AsyncSession, test_user: "User", test_project_id: UUID
) -> TokenUsageFactory:
    """Factory for creating invocations with linked token usage records."""
    return TokenUsageFactory(test_db_session, test_user, test_project_id)


@pytest_asyncio.fixture
async def identity_provider_create(test_db_session: AsyncSession, test_user: "User") -> IdentityProviderCreate:
    """Factory for creating identity providers for tests."""
    return IdentityProviderCreate(test_db_session, test_user)


@pytest_asyncio.fixture
async def integration_factory(test_db_session: AsyncSession, test_user: "User") -> IntegrationFactory:
    """Factory for creating integrations for tests."""
    return IntegrationFactory(test_db_session, test_user)


@pytest_asyncio.fixture
async def approvals_factory(
    test_db_session: AsyncSession, test_user: "User", test_workflow: Workflow
) -> ApprovalsFactory:
    """Create a factory fixture for multiple test approval requests."""
    return ApprovalsFactory(test_db_session, test_user, test_workflow.project_id)
