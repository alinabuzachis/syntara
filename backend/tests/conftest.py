"""Shared pytest fixtures for all backend tests.

DB-level factory fixtures (integration_factory, workflow_factory, etc.) are
loaded here so they override the API-level stubs registered by the
nexus_test_sdk entry-point plugin for the entire backend/tests/ tree.
"""

pytest_plugins = [
    "nexus_test_sdk.app.factories",
]
