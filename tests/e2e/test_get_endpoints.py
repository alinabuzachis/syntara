"""E2E tests for GET endpoints: workflows, executions, and approvals."""

import pytest
from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.e2e


class TestWorkflows:
    """E2E tests for workflow GET endpoints."""

    def test_list_workflows(self, nexus_api: NexusApiRegistry) -> None:
        workflows = nexus_api.workflows.list().assert_and_get()
        assert isinstance(workflows.resources, list)


class TestExecutions:
    """E2E tests for execution GET endpoints."""

    def test_list_executions(self, nexus_api: NexusApiRegistry) -> None:
        executions = nexus_api.executions.list().assert_and_get()
        assert isinstance(executions.resources, list)


class TestApprovals:
    """E2E tests for approval GET endpoints."""

    def test_list_approvals(self, nexus_api: NexusApiRegistry) -> None:
        approvals = nexus_api.approvals.list().assert_and_get()
        assert isinstance(approvals.resources, list)
