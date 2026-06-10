"""E2E tests for workflow list endpoint."""

import pytest
from nexus_api_client.api import NexusApiRegistry

pytestmark = [pytest.mark.e2e]


class TestWorkflows:
    """E2E tests for workflow GET endpoints."""

    def test_list_workflows(self, nexus_api: NexusApiRegistry) -> None:
        workflows = nexus_api.workflows.list().assert_and_get()
        assert isinstance(workflows.resources, list)
