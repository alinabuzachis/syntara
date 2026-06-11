"""E2E tests for execution list endpoint."""

import pytest
from nexus_api_client.api import NexusApiRegistry

pytestmark = [pytest.mark.e2e]


class TestExecutions:
    """E2E tests for execution GET endpoints."""

    def test_list_executions(self, nexus_api: NexusApiRegistry) -> None:
        executions = nexus_api.executions.list().assert_and_get()
        assert isinstance(executions.resources, list)
