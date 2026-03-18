"""Integration test: agent metrics visible via /metrics after invocation.

Proves that the Agent Orchestrator (which runs as a FastAPI BackgroundTask
in the same process) shares the MetricsRecorder singleton with the
/api/v1/metrics endpoint.  After an invocation completes, agent timing
and status metrics must be queryable.
"""

import pytest
from httpx import AsyncClient

from tests.helpers.invocations import wait_for_invocation_execution


@pytest.mark.asyncio
async def test_agent_metrics_appear_after_invocation(
    auth_client_with_mocked_llm: AsyncClient,
) -> None:
    """Agent invocation metrics are visible at /api/v1/metrics after execution."""
    response = await auth_client_with_mocked_llm.post(
        "/api/v1/invocations",
        json={"prompt": "Hello, how are you?", "session_id": "metrics-integration-test"},
    )
    assert response.status_code == 202
    invocation_id = response.json()["id"]

    async with wait_for_invocation_execution(
        auth_client_with_mocked_llm, invocation_id, max_wait_time=10.0
    ) as final_data:
        assert final_data is not None, "Invocation did not reach terminal state"
        assert final_data["status"] == "completed"

    metrics_resp = await auth_client_with_mocked_llm.get("/api/v1/metrics", params={"category": "agent", "limit": 50})
    assert metrics_resp.status_code == 200
    records = metrics_resp.json()["resources"]
    metric_types = {r["metric_type"] for r in records}

    assert "agent_invocation_ms" in metric_types, (
        f"AGENT_INVOCATION_DURATION not found in agent metrics. Got: {metric_types}"
    )
    assert "agent_status" in metric_types, f"AGENT_STATUS not found in agent metrics. Got: {metric_types}"

    invocation_records = [r for r in records if r["metric_type"] == "agent_invocation_ms"]
    for record in invocation_records:
        assert record["value"] > 0, "Invocation duration should be positive"
        assert record["unit"] == "ms"


@pytest.mark.asyncio
async def test_agent_metrics_on_openmetrics_endpoint(
    auth_client_with_mocked_llm: AsyncClient,
) -> None:
    """Agent invocation causes Prometheus counters/histograms to be non-zero."""
    response = await auth_client_with_mocked_llm.post(
        "/api/v1/invocations",
        json={"prompt": "What is 2+2?", "session_id": "prom-metrics-test"},
    )
    assert response.status_code == 202
    invocation_id = response.json()["id"]

    async with wait_for_invocation_execution(auth_client_with_mocked_llm, invocation_id, max_wait_time=10.0):
        pass

    prom_resp = await auth_client_with_mocked_llm.get("/api/v1/metrics/openmetrics")
    assert prom_resp.status_code == 200
    body = prom_resp.text

    assert "nexus_requests_total" in body, "Prometheus output should contain request metrics"
