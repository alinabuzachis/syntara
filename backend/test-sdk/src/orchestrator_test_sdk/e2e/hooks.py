"""Pipeline marker pytest hooks for shift-left E2E test filtering."""

from __future__ import annotations

import pytest


def pytest_addoption(parser: pytest.Parser) -> None:
    """Add custom command-line options for E2E test filtering."""
    parser.addoption(
        "--test-phase",
        action="store",
        type=str,
        default=None,
        help="Filter E2E tests by pipeline test_phase value",
    )
    parser.addoption(
        "--exclude-test-phase",
        action="store",
        type=str,
        default=None,
        help="Exclude E2E tests with specific pipeline test_phase value",
    )


def pytest_configure(config: pytest.Config) -> None:
    """Register pipeline marker for E2E test classification."""
    config.addinivalue_line(
        "markers",
        "pipeline(test_phase=str): Pipeline test classification for shift-left testing",
    )


def _matches_pipeline_filter(
    item: pytest.Item,
    test_phase: str | None,
    exclude_test_phase: str | None,
) -> bool:
    """Check if a test item matches the pipeline filter criteria.

    Implements shift-left testing pattern:
    - --test-phase: Include ONLY tests with matching marker (unmarked excluded)
    - --exclude-test-phase: Include all tests EXCEPT those with matching marker (unmarked included)

    Args:
        item: pytest test item
        test_phase: Include tests with this test_phase marker value
        exclude_test_phase: Exclude tests with this test_phase marker value

    Returns:
        True if test should be included, False otherwise

    """
    pipeline_markers = list(item.iter_markers(name="pipeline"))

    # When using --test-phase (inclusion), unmarked tests are excluded
    if test_phase is not None:
        if not pipeline_markers:
            return False
        return any(marker.kwargs.get("test_phase") == test_phase for marker in pipeline_markers)

    # When using --exclude-test-phase (exclusion), unmarked tests are included
    if exclude_test_phase is not None:
        if not pipeline_markers:
            return True  # Unmarked tests pass exclusion filter
        return all(marker.kwargs.get("test_phase") != exclude_test_phase for marker in pipeline_markers)

    # No filtering - shouldn't happen, but include the test
    return True


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    """Filter E2E tests by pipeline marker parameters (test_phase)."""
    test_phase = config.getoption("--test-phase", None)
    exclude_test_phase = config.getoption("--exclude-test-phase", None)

    if test_phase is None and exclude_test_phase is None:
        return  # No filtering needed

    selected = []
    deselected = []

    for item in items:
        if _matches_pipeline_filter(item, test_phase, exclude_test_phase):
            selected.append(item)
        else:
            deselected.append(item)

    config.hook.pytest_deselected(items=deselected)
    items[:] = selected
