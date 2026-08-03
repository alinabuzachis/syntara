"""E2E tests for approval list endpoint."""

import pytest
from syntara_api_client.api import SyntaraApiRegistry

pytestmark = [pytest.mark.e2e]


class TestApprovals:
    """E2E tests for approval GET endpoints."""

    def test_list_approvals(self, nexus_api: SyntaraApiRegistry) -> None:
        approvals = nexus_api.approvals.list().assert_and_get()
        assert isinstance(approvals.resources, list)
