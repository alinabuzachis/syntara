"""Pytest configuration for E2E tests.

E2E tests are isolated from the main API tests and don't require
database or Temporal fixtures.
"""

import pytest


def pytest_configure(config: pytest.Config) -> None:
    """Configure pytest for E2E tests.

    Args:
        config: pytest configuration object

    """
    # Register E2E test marker
    config.addinivalue_line(
        "markers",
        "e2e: mark test as end-to-end test (requires running agent)",
    )
