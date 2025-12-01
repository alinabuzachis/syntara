"""Pytest configuration for performance tests.

All tests in this directory and subdirectories are automatically marked
with @pytest.mark.performance and excluded from default test runs.

Run with: pytest --run-performance
"""

import pytest

pytestmark = pytest.mark.performance
