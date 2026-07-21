"""Pytest plugin entry point — registers E2E fixtures via pytest11 entry point.

App-level fixtures (database, client, temporal, etc.) that import from nexus.*
are registered via pytest_plugins in the repo's tests/conftest.py instead.
This keeps nexus.* out of the entry-point import chain, which runs before
pytest-cov can start its tracer.
"""

pytest_plugins = [
    "nexus_test_sdk.e2e.hooks",
    "nexus_test_sdk.e2e.factories",
    # Factory fixtures (create_workflow, create_user, etc.) — these only import
    # from nexus_api_client, not nexus.*, so they're safe in the entry point.
    "nexus_test_sdk.factories.credentials",
    "nexus_test_sdk.factories.groups",
    "nexus_test_sdk.factories.identity_providers",
    "nexus_test_sdk.factories.policies",
    "nexus_test_sdk.factories.projects",
    "nexus_test_sdk.factories.roles",
    "nexus_test_sdk.factories.users",
    "nexus_test_sdk.factories.workflows",
]
