"""Shared pytest fixtures for all backend tests.

App-level fixtures are loaded here (not via the pytest11 entry point) so that
nexus.* imports happen AFTER pytest-cov starts its coverage tracer.
"""

pytest_plugins = [
    # app/_hooks.py: logging setup, performance marker, worker_id, cleanup
    "nexus_test_sdk.app._hooks",
    # app submodules — each registers its own fixtures as a pytest plugin
    "nexus_test_sdk.app.database",
    "nexus_test_sdk.app.client",
    "nexus_test_sdk.app.users",
    "nexus_test_sdk.app.groups",
    "nexus_test_sdk.app.temporal",
    "nexus_test_sdk.app.tools",
    "nexus_test_sdk.app.workflows",
    "nexus_test_sdk.app.jwt",
    "nexus_test_sdk.app.mocks",
    "nexus_test_sdk.app.settings",
    "nexus_test_sdk.app.live",
    # DB-level factory fixtures override the API-level stubs from e2e.factories
    "nexus_test_sdk.app.factories",
]
