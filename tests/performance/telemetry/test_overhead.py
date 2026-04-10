"""Performance test for telemetry overhead (SC-002).

Validates that telemetry event collection and transmission adds less than
5% overhead to workflow-equivalent operations.

The Segment client is initialized with an invalid write key and an
endpoint on localhost that refuses connections immediately.  This
exercises the full SDK code path (serialization, batching, queuing)
without mocking, while ensuring the consumer threads never block on
TCP timeouts so ``shutdown()`` returns promptly.

Each iteration executes real ``execute_bash_script`` activities (subprocess
creation, Pydantic config validation, template resolution, env setup) so
the baseline faithfully represents the actual cost of workflow activity
execution.

Run with: pytest --run-performance tests/performance/telemetry/
"""

import logging
import statistics
import sys
import time
import uuid

import pytest

from nexus.telemetry.client import TelemetryClientRegistry
from nexus.telemetry.collector import TelemetryCollector
from nexus.workflows.workflow_engine.activities.script_activity import execute_script_activity
from nexus.workflows.workflow_engine.models.workflow_definition import (
    ActivityTerminalStatus,
    NodeType,
    WorkflowTerminalStatus,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
handler = logging.StreamHandler(sys.stdout)
handler.setLevel(logging.INFO)
handler.setFormatter(logging.Formatter("%(message)s"))
logger.addHandler(handler)

# Number of simulated workflow executions per measurement
_ITERATIONS = 50

# Activities per workflow execution
_ACTIVITIES_PER_WORKFLOW = 5

# Activity definitions used for telemetry event construction.
_ACTIVITY_DEFS: list[dict[str, object]] = [
    {
        "id": f"step-{i}",
        "type": "script",
        "config": {"language": "bash", "code": "echo ok"},
    }
    for i in range(_ACTIVITIES_PER_WORKFLOW)
]

# Script activity config passed to execute_script_activity.
# The script performs a SHA-256 hash computation to simulate a lightweight
# but realistic workload.  Real activities (API calls, AAP job templates)
# take 100 ms to minutes; this is intentionally fast to stress the overhead
# measurement while remaining representative of actual subprocess work.
_SCRIPT_CONFIG: dict[str, str] = {
    "language": "bash",
    "code": 'for i in $(seq 1 5); do echo "payload-$i" | sha256sum > /dev/null; done',
}


async def _run_workflow_activities() -> None:
    """Execute real bash script activities like a workflow would."""
    for _ in range(_ACTIVITIES_PER_WORKFLOW):
        await execute_script_activity(_SCRIPT_CONFIG, None)


async def _run_baseline(iterations: int) -> list[float]:
    """Run workflow activities without telemetry."""
    latencies: list[float] = []
    for _ in range(iterations):
        start = time.perf_counter()
        await _run_workflow_activities()
        latencies.append((time.perf_counter() - start) * 1000)
    return latencies


async def _run_with_telemetry(collector: TelemetryCollector, iterations: int) -> list[float]:
    """Run workflow activities with telemetry event emission."""
    latencies: list[float] = []
    for _ in range(iterations):
        wf_id = str(uuid.uuid4())

        start = time.perf_counter()

        collector.capture_workflow_start(workflow_execution_id=wf_id)
        await _run_workflow_activities()

        for i in range(_ACTIVITIES_PER_WORKFLOW):
            collector.capture_node_executed(
                workflow_execution_id=wf_id,
                node_type=NodeType.SCRIPT,
                node_def=_ACTIVITY_DEFS[i],
                status=ActivityTerminalStatus.COMPLETED,
                duration_ms=10,
            )
        collector.capture_workflow_completed(
            workflow_execution_id=wf_id,
            status=WorkflowTerminalStatus.COMPLETED,
            duration_ms=50,
            node_count=_ACTIVITIES_PER_WORKFLOW,
            error_count=0,
        )

        latencies.append((time.perf_counter() - start) * 1000)
    return latencies


class TestTelemetryOverhead:
    """Validate telemetry adds <5% overhead (SC-002)."""

    @pytest.mark.asyncio
    async def test_telemetry_overhead_below_threshold(self) -> None:
        """Telemetry overhead must stay below 5% of baseline execution time."""
        # Use a real Segment client with bogus credentials.
        # localhost:1 gives instant "Connection refused" so the SDK
        # never blocks on TCP timeouts.  We also override retries and
        # upload_interval so consumer threads drain the queue quickly
        # and shutdown() returns without delay.
        registry = TelemetryClientRegistry()
        registry.initialize(
            write_key="invalid-key",
            host="http://127.0.0.1:1",
            entitlement_id="perf-test",
        )
        client = registry.get_client()
        # Disable retries so failed sends return immediately and the
        # consumer thread never blocks during shutdown().
        client.max_retries = 0
        for consumer in client.consumers:
            consumer.retries = 0
        collector = TelemetryCollector(registry=registry)

        try:
            # Warmup
            await _run_baseline(5)
            await _run_with_telemetry(collector, 5)

            # Measure
            baseline = await _run_baseline(_ITERATIONS)
            with_telemetry = await _run_with_telemetry(collector, _ITERATIONS)

            mean_baseline = statistics.mean(baseline)
            mean_telemetry = statistics.mean(with_telemetry)
            overhead_pct = ((mean_telemetry - mean_baseline) / mean_baseline) * 100

            logger.info("\nTelemetry Overhead (n=%d):", _ITERATIONS)
            logger.info("  Baseline mean:   %.3fms", mean_baseline)
            logger.info("  Telemetry mean:  %.3fms", mean_telemetry)
            logger.info("  Overhead:        %.2f%%", overhead_pct)
            logger.info("  Baseline p95:    %.3fms", sorted(baseline)[int(0.95 * len(baseline))])
            logger.info("  Telemetry p95:   %.3fms", sorted(with_telemetry)[int(0.95 * len(with_telemetry))])

            assert overhead_pct < 5.0, f"Telemetry overhead {overhead_pct:.2f}% exceeds 5% threshold"
            logger.info("  PASS: telemetry overhead is within 5%% budget")
        finally:
            registry.get_client().shutdown()
