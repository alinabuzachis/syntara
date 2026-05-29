"""Shared fixtures for Suite 4: Execution Service performance tests.

These tests run against a live Nexus deployment (typically OpenShift) and
validate the Execution Service KPIs from the Nexus Performance Test Plan.

Suite-wide fixtures (perf_test_mode_enabled, compute_percentile) are
defined in the parent tests/performance/conftest.py and inherited
automatically.  This file adds execution-service-specific helpers.

Run with:
    make test-performance
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from nexus_api_client.models.workflow_definition import WorkflowDefinition

from tests.performance.workflow_engine.conftest import (
    SIMPLE_WORKFLOW_DEFINITION,
)

EXECUTION_WORKFLOW_DEFINITION: WorkflowDefinition = SIMPLE_WORKFLOW_DEFINITION

TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})

POLL_INTERVAL_SECONDS = 2.0
POLL_TIMEOUT_SECONDS = 120.0
