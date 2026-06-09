"""E2E tests for approval list endpoint."""

import pytest
from nexus_api_client.api import NexusApiRegistry

pytestmark = [pytest.mark.e2e]


class TestApprovals:
    """E2E tests for approval GET endpoints."""

    def test_list_approvals(self, nexus_api: NexusApiRegistry) -> None:
        approvals = nexus_api.approvals.list().assert_and_get()
        assert isinstance(approvals.resources, list)
