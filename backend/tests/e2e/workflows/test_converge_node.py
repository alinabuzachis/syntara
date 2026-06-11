"""End-to-end tests for converge node strategies and timeout behaviors.

Tests converge node execution with different strategies (all, any),
timeout configurations, and branch failure scenarios using the full
Nexus stack (API, Temporal worker, containers).

Run with:
    APP_BASE_URL=http://localhost:8000 make test-e2e
"""

import pytest
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models.execution_status import ExecutionStatus

from tests.e2e.helpers import create_and_run_workflow


@pytest.mark.e2e
def test_converge_any_2_of_3_strategy(nexus_api: NexusApiRegistry):
    """Test any-2-of-3 converge strategy where one branch fails.

    Branches A and B succeed, meeting the any-2-of-3 threshold. Branch C
    fails immediately. The converge fires with the 2 successful branches.
    The workflow status is FAILED because branch C failed.
    """
    result = create_and_run_workflow(
        nexus_api,
        "e2e-converge-any-2-of-3",
        {
            "name": "converge",
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "branch_a",
                    "name": "Branch A",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Branch A completed"'},
                },
                {
                    "id": "branch_b",
                    "name": "Branch B",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Branch B completed"'},
                },
                {
                    "id": "branch_c",
                    "name": "Branch C (fails)",
                    "type": "script",
                    "config": {"language": "bash", "code": "exit 1"},
                },
                {
                    "id": "converge_node",
                    "name": "Converge Any 2 of 3",
                    "type": "converge",
                    "config": {
                        "strategy": "any",
                        "n_required": 2,
                    },
                },
                {
                    "id": "final_action",
                    "name": "Final Action",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Final action executed"'},
                },
            ],
            "edges": [
                {"from": "trigger", "to": "branch_a"},
                {"from": "trigger", "to": "branch_b"},
                {"from": "trigger", "to": "branch_c"},
                {"from": "branch_a", "to": "converge_node"},
                {"from": "branch_b", "to": "converge_node"},
                {"from": "branch_c", "to": "converge_node"},
                {"from": "converge_node", "to": "final_action"},
            ],
        },
    )

    assert result.status == ExecutionStatus.FAILED
    activities = {a.activity_id: a for a in (result.activities or [])}

    assert activities["branch_a"].status == "completed"
    assert activities["branch_b"].status == "completed"
    assert activities["branch_c"].status == "failed"
    assert activities["converge_node"].status == "completed"
    assert activities["final_action"].status == "completed"


@pytest.mark.e2e
def test_converge_timeout_continue(nexus_api: NexusApiRegistry):
    """Test converge timeout with on_timeout=continue.

    The slow branch (sleep 2) feeds through slow_intermediate before
    reaching converge. The fast branch connects directly. When the 1s
    timeout fires, slow_intermediate has not been scheduled yet (slow_branch
    is still in-flight), so it is skipped. The converge continues with
    partial results (fast_branch only).

    Trigger -> fast_branch ----------------------> converge -> final_action
            -> slow_branch -> slow_intermediate ->
    """
    result = create_and_run_workflow(
        nexus_api,
        "e2e-converge-timeout-continue",
        {
            "name": "converge",
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "fast_branch",
                    "name": "Fast Branch",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Fast branch done"'},
                },
                {
                    "id": "slow_branch",
                    "name": "Slow Branch",
                    "type": "script",
                    "config": {"language": "bash", "code": 'sleep 2 && echo "Slow branch done"'},
                },
                {
                    "id": "slow_intermediate",
                    "name": "Slow Intermediate (should be skipped)",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Intermediate"'},
                },
                {
                    "id": "converge_node",
                    "name": "Converge with timeout",
                    "type": "converge",
                    "config": {"on_timeout": "continue", "wait_duration": 1},
                },
                {
                    "id": "final_action",
                    "name": "Final Action",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Executed with partial results"'},
                },
            ],
            "edges": [
                {"from": "trigger", "to": "fast_branch"},
                {"from": "trigger", "to": "slow_branch"},
                {"from": "fast_branch", "to": "converge_node"},
                {"from": "slow_branch", "to": "slow_intermediate"},
                {"from": "slow_intermediate", "to": "converge_node"},
                {"from": "converge_node", "to": "final_action"},
            ],
        },
        timeout=10,
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}

    assert activities["fast_branch"].status == "completed"
    assert activities["slow_branch"].status == "completed"
    assert activities["slow_intermediate"].status == "skipped"
    assert activities["converge_node"].status == "completed"
    assert activities["final_action"].status == "completed"


@pytest.mark.e2e
def test_converge_all_strategy(nexus_api: NexusApiRegistry):
    """Test converge 'all' strategy (regression test).

    Verifies existing 'wait for all' behavior is not regressed.
    All branches must complete before converge executes.
    """
    result = create_and_run_workflow(
        nexus_api,
        "e2e-converge-all-strategy",
        {
            "name": "converge",
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "branch_a",
                    "name": "Branch A",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Branch A"'},
                },
                {
                    "id": "branch_b",
                    "name": "Branch B",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Branch B"'},
                },
                {
                    "id": "branch_c",
                    "name": "Branch C",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Branch C"'},
                },
                {
                    "id": "converge_node",
                    "name": "Converge All",
                    "type": "converge",
                    "config": {"strategy": "all"},
                },
                {
                    "id": "final_action",
                    "name": "Final Action",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "All branches completed"'},
                },
            ],
            "edges": [
                {"from": "trigger", "to": "branch_a"},
                {"from": "trigger", "to": "branch_b"},
                {"from": "trigger", "to": "branch_c"},
                {"from": "branch_a", "to": "converge_node"},
                {"from": "branch_b", "to": "converge_node"},
                {"from": "branch_c", "to": "converge_node"},
                {"from": "converge_node", "to": "final_action"},
            ],
        },
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}

    # Verify all branches completed
    assert activities["branch_a"].status == "completed"
    assert activities["branch_b"].status == "completed"
    assert activities["branch_c"].status == "completed"

    # Verify converge and final action executed
    assert activities["converge_node"].status == "completed"
    assert activities["final_action"].status == "completed"


# ---------------------------------------------------------------------------
# Timeout Tests
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_converge_timeout_fail_and_skip_downstream(nexus_api: NexusApiRegistry):
    """Test converge timeout with on_timeout=fail.

    A fast branch completes instantly, triggering the converge to start
    waiting (and the timeout handler). The slow branch feeds through an
    intermediate. When the 1s timeout fires, the intermediate has not
    been scheduled, so it is skipped. With on_timeout=fail the converge
    is marked as failed and downstream is skipped.

    Trigger -> fast_branch ----------------------> converge -> downstream
            -> slow_branch -> intermediate ->
    """
    result = create_and_run_workflow(
        nexus_api,
        "e2e-converge-timeout-fail",
        {
            "name": "converge",
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "fast_branch",
                    "name": "Fast Branch",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Fast"'},
                },
                {
                    "id": "slow_branch",
                    "name": "Slow Branch",
                    "type": "script",
                    "config": {"language": "bash", "code": 'sleep 2 && echo "Slow"'},
                },
                {
                    "id": "intermediate",
                    "name": "Intermediate (should be skipped)",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Intermediate"'},
                },
                {
                    "id": "converge_node",
                    "name": "Converge with fail on timeout",
                    "type": "converge",
                    "config": {"on_timeout": "fail", "wait_duration": 1},
                },
                {
                    "id": "downstream_action",
                    "name": "Downstream Action (should be skipped)",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "This should not execute"'},
                },
            ],
            "edges": [
                {"from": "trigger", "to": "fast_branch"},
                {"from": "trigger", "to": "slow_branch"},
                {"from": "fast_branch", "to": "converge_node"},
                {"from": "slow_branch", "to": "intermediate"},
                {"from": "intermediate", "to": "converge_node"},
                {"from": "converge_node", "to": "downstream_action"},
            ],
        },
        timeout=10,
    )

    assert result.status == ExecutionStatus.FAILED
    activities = {a.activity_id: a for a in (result.activities or [])}

    assert activities["fast_branch"].status == "completed"
    assert activities["slow_branch"].status == "completed"
    assert activities["intermediate"].status == "skipped"
    assert activities["converge_node"].status == "failed"
    assert activities["downstream_action"].status == "skipped"


@pytest.mark.e2e
def test_converge_timeout_with_partial_completions(nexus_api: NexusApiRegistry):
    """Test converge timeout with partial completions.

    The fast branch connects directly to converge. The slow branch
    feeds through an intermediate. When the 1s timeout fires, the fast
    branch has already completed but the slow intermediate has not
    been scheduled, so it is skipped. The converge continues with
    1 of 2 predecessors completed (on_timeout=continue).

    Trigger -> fast_branch ----------------------> converge -> final
            -> slow_branch -> slow_intermediate ->
    """
    result = create_and_run_workflow(
        nexus_api,
        "e2e-converge-timeout-partial",
        {
            "name": "converge",
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "fast_branch",
                    "name": "Fast Branch",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Fast"'},
                },
                {
                    "id": "slow_branch",
                    "name": "Slow Branch",
                    "type": "script",
                    "config": {"language": "bash", "code": 'sleep 2 && echo "Slow"'},
                },
                {
                    "id": "slow_intermediate",
                    "name": "Slow Intermediate (should be skipped)",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Intermediate"'},
                },
                {
                    "id": "converge_node",
                    "name": "Converge",
                    "type": "converge",
                    "config": {"on_timeout": "continue", "wait_duration": 1},
                },
                {
                    "id": "final_action",
                    "name": "Final Action",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Done"'},
                },
            ],
            "edges": [
                {"from": "trigger", "to": "fast_branch"},
                {"from": "trigger", "to": "slow_branch"},
                {"from": "fast_branch", "to": "converge_node"},
                {"from": "slow_branch", "to": "slow_intermediate"},
                {"from": "slow_intermediate", "to": "converge_node"},
                {"from": "converge_node", "to": "final_action"},
            ],
        },
        timeout=10,
    )

    assert result.status == ExecutionStatus.COMPLETED
    activities = {a.activity_id: a for a in (result.activities or [])}

    assert activities["fast_branch"].status == "completed"
    assert activities["slow_branch"].status == "completed"
    assert activities["slow_intermediate"].status == "skipped"
    assert activities["converge_node"].status == "completed"
    assert activities["final_action"].status == "completed"


@pytest.mark.e2e
def test_converge_no_timeout_when_all_complete(nexus_api: NexusApiRegistry):
    """Test converge timeout doesn't fire when all branches complete in time.

    Verifies that if all branches complete before the timeout, the timeout
    handler doesn't fire and the workflow completes normally.
    """
    result = create_and_run_workflow(
        nexus_api,
        "e2e-converge-no-timeout",
        {
            "name": "converge",
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "branch_a",
                    "name": "Branch A",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "A"'},
                },
                {
                    "id": "branch_b",
                    "name": "Branch B",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "B"'},
                },
                {
                    "id": "converge_node",
                    "name": "Converge with long timeout",
                    "type": "converge",
                    "config": {"on_timeout": "fail", "wait_duration": 1},
                },
                {
                    "id": "final_action",
                    "name": "Final Action",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Completed normally"'},
                },
            ],
            "edges": [
                {"from": "trigger", "to": "branch_a"},
                {"from": "trigger", "to": "branch_b"},
                {"from": "branch_a", "to": "converge_node"},
                {"from": "branch_b", "to": "converge_node"},
                {"from": "converge_node", "to": "final_action"},
            ],
        },
    )

    assert result.status == ExecutionStatus.COMPLETED
    activities = {a.activity_id: a for a in (result.activities or [])}

    # Verify all branches completed
    assert activities["branch_a"].status == "completed"
    assert activities["branch_b"].status == "completed"

    # Verify converge and final action executed normally
    assert activities["converge_node"].status == "completed"
    assert activities["final_action"].status == "completed"


# ---------------------------------------------------------------------------
# Branch Failure Tests
# ---------------------------------------------------------------------------


@pytest.mark.e2e
def test_converge_one_branch_fails_all_strategy(nexus_api: NexusApiRegistry):
    """Test converge behavior when one branch fails with 'all' strategy.

    The success branches sleep briefly so the failure is processed first.
    ALL strategy is strict: any predecessor failure fails the converge
    and skips downstream nodes.
    """
    result = create_and_run_workflow(
        nexus_api,
        "e2e-converge-branch-fail-all",
        {
            "name": "converge",
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "success_branch_a",
                    "name": "Success Branch A",
                    "type": "script",
                    "config": {"language": "bash", "code": 'sleep 1 && echo "Success A"'},
                },
                {
                    "id": "success_branch_b",
                    "name": "Success Branch B",
                    "type": "script",
                    "config": {"language": "bash", "code": 'sleep 1 && echo "Success B"'},
                },
                {
                    "id": "failing_branch",
                    "name": "Failing Branch",
                    "type": "script",
                    "config": {"language": "bash", "code": "exit 1"},
                },
                {
                    "id": "converge_node",
                    "name": "Converge All",
                    "type": "converge",
                    "config": {"strategy": "all"},
                },
                {
                    "id": "final_action",
                    "name": "Final Action",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Executed"'},
                },
            ],
            "edges": [
                {"from": "trigger", "to": "success_branch_a"},
                {"from": "trigger", "to": "success_branch_b"},
                {"from": "trigger", "to": "failing_branch"},
                {"from": "success_branch_a", "to": "converge_node"},
                {"from": "success_branch_b", "to": "converge_node"},
                {"from": "failing_branch", "to": "converge_node"},
                {"from": "converge_node", "to": "final_action"},
            ],
        },
        timeout=10,
    )

    assert result.status == ExecutionStatus.FAILED
    activities = {a.activity_id: a for a in (result.activities or [])}

    assert activities["success_branch_a"].status == "skipped"
    assert activities["success_branch_b"].status == "skipped"
    assert activities["failing_branch"].status == "failed"
    assert activities["converge_node"].status == "failed"
    assert activities["final_action"].status == "skipped"


@pytest.mark.e2e
def test_converge_branch_failure_any_strategy(nexus_api: NexusApiRegistry):
    """Test converge 'any' strategy with branch failures.

    With any-2-of-3 strategy, 2 branches fail and only 1 succeeds.
    The threshold of 2 completions cannot be met, so the converge
    should be skipped along with downstream nodes.
    """
    result = create_and_run_workflow(
        nexus_api,
        "e2e-converge-branch-failure-any",
        {
            "name": "converge",
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "success_branch",
                    "name": "Success Branch (slow to ensure failures processed first)",
                    "type": "script",
                    "config": {"language": "bash", "code": 'sleep 1 && echo "Success"'},
                },
                {
                    "id": "failing_branch_a",
                    "name": "Failing Branch A",
                    "type": "script",
                    "config": {"language": "bash", "code": "exit 1"},
                },
                {
                    "id": "failing_branch_b",
                    "name": "Failing Branch B",
                    "type": "script",
                    "config": {"language": "bash", "code": "exit 1"},
                },
                {
                    "id": "converge_node",
                    "name": "Converge Any 2 of 3",
                    "type": "converge",
                    "config": {
                        "strategy": "any",
                        "n_required": 2,
                    },
                },
                {
                    "id": "final_action",
                    "name": "Final Action (should not execute)",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Should not run"'},
                },
            ],
            "edges": [
                {"from": "trigger", "to": "success_branch"},
                {"from": "trigger", "to": "failing_branch_a"},
                {"from": "trigger", "to": "failing_branch_b"},
                {"from": "success_branch", "to": "converge_node"},
                {"from": "failing_branch_a", "to": "converge_node"},
                {"from": "failing_branch_b", "to": "converge_node"},
                {"from": "converge_node", "to": "final_action"},
            ],
        },
    )

    assert result.status == ExecutionStatus.FAILED
    activities = {a.activity_id: a for a in (result.activities or [])}

    assert activities["success_branch"].status == "completed"
    assert activities["failing_branch_a"].status == "failed"
    assert activities["failing_branch_b"].status == "failed"
    assert activities["converge_node"].status == "failed"
    assert activities["final_action"].status == "skipped"


@pytest.mark.e2e
def test_converge_all_branches_fail(nexus_api: NexusApiRegistry):
    """Test converge when all branches fail.

    Verifies that if all branches fail, the converge node is marked
    as failed (not skipped) because predecessor failures caused it.
    """
    result = create_and_run_workflow(
        nexus_api,
        "e2e-converge-all-fail",
        {
            "name": "converge",
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "failing_branch_a",
                    "name": "Failing Branch A",
                    "type": "script",
                    "config": {"language": "bash", "code": "exit 1"},
                },
                {
                    "id": "failing_branch_b",
                    "name": "Failing Branch B",
                    "type": "script",
                    "config": {"language": "bash", "code": "exit 1"},
                },
                {
                    "id": "failing_branch_c",
                    "name": "Failing Branch C",
                    "type": "script",
                    "config": {"language": "bash", "code": "exit 1"},
                },
                {
                    "id": "converge_node",
                    "name": "Converge",
                    "type": "converge",
                    "config": {},
                },
                {
                    "id": "final_action",
                    "name": "Final Action (should not execute)",
                    "type": "script",
                    "config": {"language": "bash", "code": 'echo "Should not run"'},
                },
            ],
            "edges": [
                {"from": "trigger", "to": "failing_branch_a"},
                {"from": "trigger", "to": "failing_branch_b"},
                {"from": "trigger", "to": "failing_branch_c"},
                {"from": "failing_branch_a", "to": "converge_node"},
                {"from": "failing_branch_b", "to": "converge_node"},
                {"from": "failing_branch_c", "to": "converge_node"},
                {"from": "converge_node", "to": "final_action"},
            ],
        },
    )

    assert result.status == ExecutionStatus.FAILED
    activities = {a.activity_id: a for a in (result.activities or [])}

    # Verify all branches failed
    assert activities["failing_branch_a"].status == "failed"
    assert activities["failing_branch_b"].status == "failed"
    assert activities["failing_branch_c"].status == "failed"

    # Verify converge is failed (predecessor failures) and downstream is skipped
    assert activities["converge_node"].status == "failed"
    assert activities["final_action"].status == "skipped"
