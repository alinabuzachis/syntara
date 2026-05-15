"""Suite 3 — Temporal Worker: Failure Categorization KPI (3.5).

Test 3.5: Introduce deliberate activity failures
    KPI: Failure Categorization — by activity type and reason
    MetricType: ACTIVITY_DURATION

    Validation source:
        - GET /_internal/metrics/records?metric_type=activity_duration_ms
          → verify status labels carry activity type and failure reason

Run with:
    make test-performance
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING, Any

import pytest

from tests.performance.conftest import create_perf_test_workflow, submit_execution
from tests.performance.temporal_worker.conftest import poll_until_activities_stabilize

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

EXECUTIONS_PER_WORKFLOW = 5
MAX_WORKERS = 10

FAILING_WORKFLOW_DEFINITIONS: list[dict[str, Any]] = [
    {
        "schema_version": "2.0.0",
        "triggers": [
            {"id": "trigger_manual", "type": "manual_trigger", "config": {"inputs": {}}},
        ],
        "nodes": [
            {
                "id": "bad_bash",
                "name": "Failing Bash Script",
                "type": "script",
                "config": {"language": "bash", "code": "exit 1"},
            },
        ],
        "edges": [
            {"from": "trigger_manual", "to": "bad_bash"},
        ],
    },
    {
        "schema_version": "2.0.0",
        "triggers": [
            {"id": "trigger_manual", "type": "manual_trigger", "config": {"inputs": {}}},
        ],
        "nodes": [
            {
                "id": "bad_python",
                "name": "Failing Python Script",
                "type": "script",
                "config": {"language": "python", "code": "raise RuntimeError('deliberate failure')"},
            },
        ],
        "edges": [
            {"from": "trigger_manual", "to": "bad_python"},
        ],
    },
    {
        "schema_version": "2.0.0",
        "triggers": [
            {"id": "trigger_manual", "type": "manual_trigger", "config": {"inputs": {}}},
        ],
        "nodes": [
            {
                "id": "bad_http",
                "name": "Failing HTTP Tool",
                "type": "http_request",
                "config": {
                    "method": "GET",
                    "url": "http://localhost:1/nonexistent",
                    "timeout": 2,
                },
            },
        ],
        "edges": [
            {"from": "trigger_manual", "to": "bad_http"},
        ],
    },
]

PASSING_WORKFLOW_DEFINITION: dict[str, Any] = {
    "schema_version": "2.0.0",
    "triggers": [
        {"id": "trigger_manual", "type": "manual_trigger", "config": {"inputs": {}}},
    ],
    "nodes": [
        {
            "id": "good_script",
            "name": "Passing Script",
            "type": "script",
            "config": {"language": "bash", "code": "echo ok"},
        },
    ],
    "edges": [
        {"from": "trigger_manual", "to": "good_script"},
    ],
}


class TestFailureCategorization:
    """3.5 — Introduce deliberate activity failures.

    Submits workflows designed to fail (bad bash exit code, python
    exception, unreachable HTTP endpoint) alongside passing workflows,
    then verifies that ``ACTIVITY_DURATION`` records carry correct
    ``status`` and ``activity_name`` labels for categorisation.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_failure_records_have_status_labels(
        self,
        nexus_api: NexusApiRegistry,
        cleanup_workflow_ids: list[str],
    ) -> None:
        """Failed activities must carry status and activity_name labels."""
        workflow_ids: list[str] = []

        for i, definition in enumerate(FAILING_WORKFLOW_DEFINITIONS):
            wf_id = create_perf_test_workflow(
                nexus_api,
                f"perf-fail-{i}",
                definition,
            )
            assert wf_id is not None, f"Failed to create failing workflow {i}"
            workflow_ids.append(wf_id)

        pass_id = create_perf_test_workflow(
            nexus_api,
            "perf-pass",
            PASSING_WORKFLOW_DEFINITION,
        )
        assert pass_id is not None, "Failed to create passing workflow"
        workflow_ids.append(pass_id)

        cleanup_workflow_ids.extend(workflow_ids)

        total_accepted = 0
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = []
            for wf_id in workflow_ids:
                for _ in range(EXECUTIONS_PER_WORKFLOW):
                    futures.append(executor.submit(submit_execution, nexus_api, wf_id))
            for future in as_completed(futures):
                _, ok, _ = future.result()
                if ok:
                    total_accepted += 1

        assert total_accepted > 0, "No executions were accepted"

        poll_until_activities_stabilize(nexus_api, min_expected=total_accepted)

        records_response = nexus_api.internal_metrics.get_records(
            metric_type="activity_duration_ms",
            limit=10000,
        )
        records_response.assert_successful()
        records = records_response.parsed.to_dict() if records_response.parsed is not None else {}

        all_records = records.get("records", [])

        assert len(all_records) > 0, (
            f"No activity_duration_ms records found ({total_accepted} executions were submitted)"
        )

        statuses_seen: set[str] = set()
        activity_names_seen: set[str] = set()

        for rec in all_records:
            labels = rec.get("labels", {})
            assert "status" in labels, f"ACTIVITY_DURATION record missing 'status' label: {labels}"
            assert "activity_name" in labels, f"ACTIVITY_DURATION record missing 'activity_name' label: {labels}"
            statuses_seen.add(labels["status"])
            activity_names_seen.add(labels["activity_name"])

        missing = {"completed", "failed"} - statuses_seen
        assert not missing, (
            f"Expected both 'completed' and 'failed' in status labels, missing: {missing}, got: {statuses_seen}"
        )

        assert len(activity_names_seen) > 0, "No distinct activity_name values found in records"

    def test_failure_records_grouped_by_type(
        self,
        nexus_api: NexusApiRegistry,
        cleanup_workflow_ids: list[str],
    ) -> None:
        """Failure records should be groupable by activity type and status."""
        for i, definition in enumerate(FAILING_WORKFLOW_DEFINITIONS):
            wf_id = create_perf_test_workflow(
                nexus_api,
                f"perf-group-{i}",
                definition,
            )
            if wf_id is None:
                continue
            cleanup_workflow_ids.append(wf_id)
            for _ in range(EXECUTIONS_PER_WORKFLOW):
                submit_execution(nexus_api, wf_id)

        expected = len(cleanup_workflow_ids) * EXECUTIONS_PER_WORKFLOW
        poll_until_activities_stabilize(nexus_api, min_expected=expected)

        records_response = nexus_api.internal_metrics.get_records(
            metric_type="activity_duration_ms",
            limit=10000,
        )
        records_response.assert_successful()
        records = records_response.parsed.to_dict() if records_response.parsed is not None else {}

        by_type_and_status: dict[str, dict[str, int]] = {}
        for rec in records.get("records", []):
            labels = rec.get("labels", {})
            name = labels.get("activity_name", "unknown")
            status = labels.get("status", "unknown")
            by_type_and_status.setdefault(name, {})
            by_type_and_status[name][status] = by_type_and_status[name].get(status, 0) + 1

        assert len(by_type_and_status) > 0, "No activity records found to categorise by type and status"

        for activity_name, status_counts in by_type_and_status.items():
            for status in status_counts:
                assert status in {"completed", "failed", "cancelled", "skipped", "unknown"}, (
                    f"Unexpected status '{status}' for activity '{activity_name}'"
                )
