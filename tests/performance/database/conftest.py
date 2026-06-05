"""Shared fixtures for Suite 8: Database performance tests.

These tests run against a live Nexus deployment (typically OpenShift) and
validate the Database KPIs from the Nexus Performance Test Plan.

Suite-wide fixtures (perf_test_mode_enabled, compute_percentile) are
defined in the parent tests/performance/conftest.py and inherited
automatically.  This file adds database-specific helpers.

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any

import pytest
import structlog

if TYPE_CHECKING:
    from collections.abc import Callable

    from nexus_api_client.api import NexusApiRegistry

from tests.performance.conftest import (
    SIMPLE_WORKFLOW_DEFINITION,
    _extract_status_code,
    create_perf_test_workflow,
    log_request_failure,
)

logger = structlog.stdlib.get_logger(__name__)

TARGET_SIMPLE_QUERY_P95_MS = 50
TARGET_COMPLEX_QUERY_P95_MS = 200

CRUD_ITERATION_COUNT = 50


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def reset_metrics_store(
    nexus_api: NexusApiRegistry,
    perf_test_mode_enabled: None,
) -> None:
    """Reset metrics store before each database performance test.

    Ensures clean state for metric collection and validation.
    Applied automatically to all tests in this suite.
    """
    nexus_api.internal_metrics.reset_store().assert_successful()


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def create_workflow_pool(
    nexus_api: NexusApiRegistry,
    name_prefix: str,
    count: int,
) -> list[str]:
    """Create a pool of workflows for performance testing.

    Args:
        nexus_api: Authenticated API client registry.
        name_prefix: Prefix for workflow names.
        count: Number of workflows to create.

    Returns:
        List of created workflow IDs.

    """
    workflow_ids: list[str] = []
    for _ in range(count):
        wf_id = create_perf_test_workflow(nexus_api, name_prefix, SIMPLE_WORKFLOW_DEFINITION)
        if wf_id:
            workflow_ids.append(wf_id)
    return workflow_ids


def cleanup_workflows(
    nexus_api: NexusApiRegistry,
    workflow_ids: list[str],
) -> None:
    """Clean up test workflows, logging any deletion errors.

    Args:
        nexus_api: Authenticated API client registry.
        workflow_ids: List of workflow IDs to delete.

    """
    for wf_id in workflow_ids:
        try:
            nexus_api.workflows.delete(workflow_id=wf_id)
        except Exception as exc:
            logger.warning(
                "Failed to delete workflow during cleanup",
                workflow_id=wf_id,
                error_type=type(exc).__name__,
                status_code=_extract_status_code(exc),
            )


def measure_api_call(
    func: Callable[..., Any],
    *args: object,
    **kwargs: object,
) -> tuple[float, bool]:
    """Time an API call and return (elapsed_ms, success).

    Args:
        func: The API method to call.
        *args: Positional arguments for the API method.
        **kwargs: Keyword arguments for the API method.

    Returns:
        Tuple of (elapsed_ms, success).

    """
    start = time.monotonic()
    try:
        r = func(*args, **kwargs)
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, r.is_success
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        log_request_failure(exc, context="measure_api_call")
        return elapsed_ms, False


def measure_list_api_call(
    func: Callable[..., Any],
    **kwargs: object,
) -> tuple[float, bool, int]:
    """Time a list API call and return (elapsed_ms, success, item_count).

    Args:
        func: The API list method to call.
        **kwargs: Keyword arguments for the list method.

    Returns:
        Tuple of (elapsed_ms, success, item_count).

    """
    start = time.monotonic()
    try:
        r = func(**kwargs)
        elapsed_ms = (time.monotonic() - start) * 1000
        item_count = 0
        if r.is_success and r.parsed:
            parsed = r.parsed.to_dict()
            items = parsed.get("items", [])
            item_count = len(items)
        return elapsed_ms, r.is_success, item_count
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        log_request_failure(exc, context="measure_list_api_call")
        return elapsed_ms, False, 0
