"""Shared pytest fixtures for all backend tests.

App-level fixtures are loaded here (not via the pytest11 entry point) so that
nexus.* imports happen AFTER pytest-cov starts its coverage tracer.
"""

pytest_plugins = [
    # Logging setup, performance marker, worker_id fixture, and cleanup hooks
    "tests.fixtures.hooks",
    # Shared fixtures used across unit, integration, performance, and E2E tests
    "tests.fixtures.database",
    "tests.fixtures.users",
    "tests.fixtures.tools",
    "tests.fixtures.mocks",
    "tests.fixtures.settings",
    "tests.fixtures.factories",
    # Integration-specific fixtures (FastAPI client, Temporal, group/user helpers, etc.)
    # Registered here so unit tests that depend on them transitively still resolve correctly.
    "tests.integration.fixtures.database",
    "tests.integration.fixtures.client",
    "tests.integration.fixtures.groups",
    "tests.integration.fixtures.temporal",
    "tests.integration.fixtures.workflows",
    "tests.integration.fixtures.factories",
    "tests.integration.fixtures.jwt",
    "tests.integration.fixtures.mocks",
    "tests.integration.fixtures.settings",
    "tests.integration.fixtures.tools",
    "tests.integration.fixtures.users",
]
