"""Supplementary tests for NexusWorkflow execution engine (task 6.3 — TEST).

Covers gaps not addressed by the DEV tests:
- _is_unreachable: transitive unreachability detection
- activity_signal: signal storage for async callbacks
- _execute_executor_node: unknown executor type fallback
- _mark_downstream_as_skipped: already-completed successor not re-skipped
- _mark_remaining_unreachable_nodes: final pass catches un-executed nodes
- _loop_body_complete: empty body and nested-loop-still-iterating edge cases
- _clear_loop_body: non-dict results, multiple-iteration accumulation
- get_skipped_nodes: includes failed-downstream nodes
- per-node timeout: config.timeout overrides DEFAULT_ACTIVITY_TIMEOUT_SECONDS
"""

import asyncio
from collections.abc import Generator
from datetime import timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from nexus.workflows.utils.namespace_resolver import NamespaceResolver
from nexus.workflows.workflow_engine.constants import DEFAULT_AAP_TIMEOUT_SECONDS
from nexus.workflows.workflow_engine.dynamic_workflow import DEFAULT_ACTIVITY_TIMEOUT_SECONDS, NexusWorkflow
from nexus.workflows.workflow_engine.graph import ActivityNode, WorkflowGraph
from nexus.workflows.workflow_engine.graph_backend import InMemoryGraphBackend


@pytest.fixture(autouse=True)
def _mock_temporal_workflow() -> Generator[MagicMock]:
    """Mock the Temporal workflow module to avoid 'Not in workflow event loop' errors."""
    mock_logger = MagicMock()
    with patch("nexus.workflows.workflow_engine.dynamic_workflow.workflow") as mock_wf:
        mock_wf.logger = mock_logger
        mock_wf.info.return_value = MagicMock(workflow_id="test-wf-id")
        yield mock_wf


def _make_workflow(
    skipped_nodes: set[str] | None = None,
    failed_nodes: dict[str, str] | None = None,
    resolver: NamespaceResolver | None = None,
) -> NexusWorkflow:
    """Create a NexusWorkflow with initialized state, bypassing __init__."""
    wf = NexusWorkflow.__new__(NexusWorkflow)
    wf.skipped_nodes = skipped_nodes if skipped_nodes is not None else set()
    wf.failed_nodes = failed_nodes if failed_nodes is not None else {}
    wf.resolver = resolver if resolver is not None else NamespaceResolver()
    wf.node_inputs = {}
    wf.node_control_data = {}
    wf.loop_state = {}
    wf.loop_body_map = {}
    wf.loop_iteration_results = {}
    wf._activity_signals = {}
    wf._timeout_tasks = {}
    wf._timed_out_converge_nodes = set()
    return wf


def _build_diamond_graph() -> WorkflowGraph:
    """Build: trigger -> A + B -> C (diamond, C has two predecessors)."""
    backend = InMemoryGraphBackend()
    backend.add_node("trigger", {"id": "trigger", "type": "manual_trigger", "config": {}})
    backend.add_node("node_a", {"id": "node_a", "type": "script", "config": {}})
    backend.add_node("node_b", {"id": "node_b", "type": "script", "config": {}})
    backend.add_node("node_c", {"id": "node_c", "type": "script", "config": {}})
    backend.add_edge("trigger", "node_a", None)
    backend.add_edge("trigger", "node_b", None)
    backend.add_edge("node_a", "node_c", None)
    backend.add_edge("node_b", "node_c", None)
    return WorkflowGraph(backend)


def _build_chain_graph() -> WorkflowGraph:
    """Build: trigger -> A -> B -> C (three-node chain)."""
    backend = InMemoryGraphBackend()
    backend.add_node("trigger", {"id": "trigger", "type": "manual_trigger", "config": {}})
    backend.add_node("node_a", {"id": "node_a", "type": "script", "config": {}})
    backend.add_node("node_b", {"id": "node_b", "type": "script", "config": {}})
    backend.add_node("node_c", {"id": "node_c", "type": "script", "config": {}})
    backend.add_edge("trigger", "node_a", None)
    backend.add_edge("node_a", "node_b", None)
    backend.add_edge("node_b", "node_c", None)
    return WorkflowGraph(backend)


class TestIsUnreachable:
    """Test transitive unreachability detection."""

    def test_trigger_node_is_always_reachable(self) -> None:
        """Root nodes (no predecessors) are never unreachable."""
        backend = InMemoryGraphBackend()
        backend.add_node("trigger", {"id": "trigger", "type": "manual_trigger", "config": {}})
        graph = WorkflowGraph(backend)
        wf = _make_workflow()

        assert wf._is_unreachable("trigger", graph) is False

    def test_node_with_completed_predecessor_is_reachable(self) -> None:
        """A node whose predecessor completed is reachable."""
        backend = InMemoryGraphBackend()
        backend.add_node("trigger", {"id": "trigger", "type": "manual_trigger", "config": {}})
        backend.add_node("node_a", {"id": "node_a", "type": "script", "config": {}})
        backend.add_edge("trigger", "node_a", None)
        graph = WorkflowGraph(backend)

        wf = _make_workflow()
        wf.resolver.set_namespace("trigger", {"done": True})

        assert wf._is_unreachable("node_a", graph) is False

    def test_node_with_all_predecessors_skipped_is_unreachable(self) -> None:
        """A node is unreachable when all predecessors are skipped."""
        graph = _build_diamond_graph()
        wf = _make_workflow(skipped_nodes={"node_a", "node_b"})

        assert wf._is_unreachable("node_c", graph) is True

    def test_node_with_one_predecessor_skipped_one_completed_is_reachable(self) -> None:
        """A node is reachable if any predecessor completed."""
        graph = _build_diamond_graph()
        wf = _make_workflow(skipped_nodes={"node_a"})
        wf.resolver.set_namespace("node_b", {"result": "ok"})

        assert wf._is_unreachable("node_c", graph) is False

    def test_transitive_unreachability_through_chain(self) -> None:
        """A node is unreachable if its predecessor is transitively unreachable."""
        graph = _build_chain_graph()
        wf = _make_workflow(skipped_nodes={"node_a"})

        assert wf._is_unreachable("node_b", graph) is True
        assert wf._is_unreachable("node_c", graph) is True

    def test_already_skipped_node_is_unreachable(self) -> None:
        """Nodes already in skipped_nodes return True."""
        graph = _build_chain_graph()
        wf = _make_workflow(skipped_nodes={"node_b"})

        assert wf._is_unreachable("node_b", graph) is True

    def test_failed_node_is_unreachable(self) -> None:
        """Nodes in failed_nodes return True."""
        graph = _build_chain_graph()
        wf = _make_workflow(failed_nodes={"node_a": "Error"})

        assert wf._is_unreachable("node_a", graph) is True

    def test_node_with_failed_predecessor_is_unreachable(self) -> None:
        """A node whose only predecessor failed is unreachable.

        node_a has a namespace but IS in failed_nodes, so it doesn't
        count as completed successfully.
        """
        graph = _build_chain_graph()
        wf = _make_workflow(failed_nodes={"node_a": "Error"})
        wf.resolver.set_namespace("node_a", {"status": "failed", "error": "Error"})

        assert wf._is_unreachable("node_b", graph) is True


class TestActivitySignal:
    """Test signal storage for async callbacks."""

    @pytest.mark.asyncio
    async def test_signal_stores_data_for_activity(self) -> None:
        """Signal data should be appended to the activity's signal list."""
        wf = _make_workflow()
        await wf.activity_signal("node_x", {"status": "completed", "result": {"answer": 42}})

        assert "node_x" in wf._activity_signals
        assert len(wf._activity_signals["node_x"]) == 1
        assert wf._activity_signals["node_x"][0]["result"] == {"answer": 42}

    @pytest.mark.asyncio
    async def test_multiple_signals_for_same_activity(self) -> None:
        """Multiple signals to the same activity should accumulate."""
        wf = _make_workflow()
        await wf.activity_signal("node_x", {"status": "pending"})
        await wf.activity_signal("node_x", {"status": "completed", "result": "done"})

        assert len(wf._activity_signals["node_x"]) == 2
        assert wf._activity_signals["node_x"][0]["status"] == "pending"
        assert wf._activity_signals["node_x"][1]["status"] == "completed"

    @pytest.mark.asyncio
    async def test_signals_for_different_activities_are_independent(self) -> None:
        """Signals for different activities should not interfere."""
        wf = _make_workflow()
        await wf.activity_signal("node_x", {"status": "done"})
        await wf.activity_signal("node_y", {"status": "error"})

        assert len(wf._activity_signals["node_x"]) == 1
        assert len(wf._activity_signals["node_y"]) == 1
        assert wf._activity_signals["node_x"][0]["status"] == "done"
        assert wf._activity_signals["node_y"][0]["status"] == "error"


class TestExecuteExecutorNodeUnknownType:
    """Test the executor fallback for unknown node types."""

    @pytest.mark.asyncio
    async def test_unknown_executor_type_returns_skipped(self) -> None:
        """An unknown executor type should return a skipped result."""
        wf = _make_workflow()
        result = await wf._execute_executor_node(
            node_id="bad_node",
            node_type="totally_unknown",
            resolved_config={"some": "config"},
            outputs=None,
        )
        assert result["output"]["status"] == "skipped"
        assert "Unknown executor type" in result["output"]["reason"]
        assert "totally_unknown" in result["output"]["reason"]


class TestMarkDownstreamEdgeCases:
    """Additional edge cases for downstream skipping."""

    def test_already_completed_successor_not_marked_skipped(self) -> None:
        """A successor that already has output should not be re-marked as skipped."""
        graph = _build_chain_graph()
        wf = _make_workflow(skipped_nodes={"node_a"})
        wf.resolver.set_namespace("node_b", {"result": "done"})

        wf._mark_downstream_as_skipped("node_a", graph)

        assert "node_b" not in wf.skipped_nodes

    def test_already_skipped_successor_not_re_processed(self) -> None:
        """A successor already in skipped_nodes should not be processed again."""
        graph = _build_chain_graph()
        wf = _make_workflow(skipped_nodes={"node_a", "node_b"})

        wf._mark_downstream_as_skipped("node_a", graph)

        assert "node_b" in wf.skipped_nodes

    def test_diamond_skip_only_when_all_predecessors_skipped(self) -> None:
        """In a diamond, a node is only skipped if ALL predecessors are skipped/failed."""
        graph = _build_diamond_graph()
        wf = _make_workflow(skipped_nodes={"node_a"})

        wf._mark_downstream_as_skipped("node_a", graph)

        assert "node_c" not in wf.skipped_nodes

    def test_diamond_skip_when_all_predecessors_failed_or_skipped(self) -> None:
        """In a diamond, node is skipped when preds are a mix of skipped and failed."""
        graph = _build_diamond_graph()
        wf = _make_workflow(skipped_nodes={"node_a"}, failed_nodes={"node_b": "Error"})

        wf._mark_downstream_as_skipped("node_a", graph)

        assert "node_c" in wf.skipped_nodes


class TestMarkRemainingUnreachableNodes:
    """Test the final-pass cleanup of unreachable nodes."""

    def test_unexecuted_nodes_marked_skipped_in_final_pass(self) -> None:
        """Nodes that never executed should be marked as skipped."""
        graph = _build_chain_graph()
        wf = _make_workflow()
        wf.resolver.set_namespace("trigger", {})
        wf.resolver.set_namespace("node_a", {"result": "ok"})

        wf._mark_remaining_unreachable_nodes(graph)

        assert "node_b" in wf.skipped_nodes
        assert "node_c" in wf.skipped_nodes

    def test_already_completed_nodes_not_marked_skipped(self) -> None:
        """Already-executed nodes should not be marked skipped."""
        graph = _build_chain_graph()
        wf = _make_workflow()
        wf.resolver.set_namespace("trigger", {})
        wf.resolver.set_namespace("node_a", {"result": "ok"})
        wf.resolver.set_namespace("node_b", {"result": "ok"})
        wf.resolver.set_namespace("node_c", {"result": "ok"})

        wf._mark_remaining_unreachable_nodes(graph)

        assert "node_a" not in wf.skipped_nodes
        assert "node_b" not in wf.skipped_nodes
        assert "node_c" not in wf.skipped_nodes

    def test_trigger_not_marked_skipped(self) -> None:
        """Trigger nodes (manual_trigger type) are excluded from the final pass."""
        graph = _build_chain_graph()
        wf = _make_workflow()

        wf._mark_remaining_unreachable_nodes(graph)

        assert "trigger" not in wf.skipped_nodes
        assert "node_a" in wf.skipped_nodes

    def test_non_manual_trigger_types_not_marked_skipped(self) -> None:
        """All trigger types (webhook_trigger, schedule_trigger, etc.) are excluded."""
        backend = InMemoryGraphBackend()
        backend.add_node("trigger", {"id": "trigger", "type": "webhook_trigger", "config": {}})
        backend.add_node("node_a", {"id": "node_a", "type": "script", "config": {}})
        backend.add_node("node_b", {"id": "node_b", "type": "script", "config": {}})
        backend.add_edge("trigger", "node_a", None)
        backend.add_edge("node_a", "node_b", None)
        graph = WorkflowGraph(backend)

        wf = _make_workflow()
        wf.resolver.set_namespace("trigger", {})
        wf.resolver.set_namespace("node_a", {"result": "ok"})
        wf.resolver.set_namespace("node_b", {"result": "ok"})

        wf._mark_remaining_unreachable_nodes(graph)

        assert "trigger" not in wf.skipped_nodes
        assert "node_a" not in wf.skipped_nodes
        assert "node_b" not in wf.skipped_nodes


class TestLoopBodyCompleteEdgeCases:
    """Additional edge cases for loop body completion checks."""

    def test_empty_loop_body_returns_false(self) -> None:
        """A loop with no body nodes mapped should return False."""
        wf = _make_workflow()
        assert wf._loop_body_complete("nonexistent_loop") is False

    def test_nested_loop_still_iterating_blocks_parent(self) -> None:
        """If a body node is a loop still iterating, parent body is NOT complete."""
        wf = _make_workflow()
        wf.loop_body_map["inner_loop"] = "outer_loop"
        wf.resolver.set_namespace("inner_loop", {"status": "iterating"})
        wf.node_control_data["inner_loop"] = {"next_port": "iterate"}

        assert wf._loop_body_complete("outer_loop") is False

    def test_nested_loop_completed_allows_parent(self) -> None:
        """If a body node routed to 'complete', parent body IS complete."""
        wf = _make_workflow()
        wf.loop_body_map["inner_loop"] = "outer_loop"
        wf.resolver.set_namespace("inner_loop", {"status": "done"})
        wf.node_control_data["inner_loop"] = {"next_port": "complete"}

        assert wf._loop_body_complete("outer_loop") is True


class TestClearLoopBodyEdgeCases:
    """Additional edge cases for clearing loop body state."""

    def test_clear_loop_body_with_non_dict_result_does_not_crash(self) -> None:
        """Non-dict namespace results should not crash _clear_loop_body."""
        wf = _make_workflow()
        wf.loop_body_map["body_node"] = "loop_1"
        # Directly set a non-dict value in the resolver's internal storage
        wf.resolver.namespaces["body_node"] = "raw_string_result"  # type: ignore[assignment]

        wf._clear_loop_body("loop_1")

        assert "body_node" not in wf.loop_body_map
        assert wf.loop_iteration_results.get("loop_1") == {}

    def test_multiple_iterations_accumulate_results(self) -> None:
        """Calling _clear_loop_body multiple times should accumulate results."""
        wf = _make_workflow()

        wf.loop_body_map["body_node"] = "loop_1"
        wf.resolver.set_namespace("body_node", {"value": 10})
        wf._clear_loop_body("loop_1")

        wf.loop_body_map["body_node"] = "loop_1"
        wf.resolver.set_namespace("body_node", {"value": 20})
        wf._clear_loop_body("loop_1")

        wf.loop_body_map["body_node"] = "loop_1"
        wf.resolver.set_namespace("body_node", {"value": 30})
        wf._clear_loop_body("loop_1")

        assert wf.loop_iteration_results["loop_1"]["body_node.value"] == [10, 20, 30]

    def test_clear_loop_body_with_multiple_body_nodes(self) -> None:
        """All body nodes mapped to the same loop should be cleared."""
        wf = _make_workflow()
        wf.loop_body_map["body_a"] = "loop_1"
        wf.loop_body_map["body_b"] = "loop_1"
        wf.loop_body_map["unrelated"] = "loop_2"
        wf.resolver.set_namespace("body_a", {"x": 1})
        wf.resolver.set_namespace("body_b", {"y": 2})

        wf._clear_loop_body("loop_1")

        assert "body_a" not in wf.loop_body_map
        assert "body_b" not in wf.loop_body_map
        assert "unrelated" in wf.loop_body_map
        assert wf.loop_iteration_results["loop_1"]["body_a.x"] == [1]
        assert wf.loop_iteration_results["loop_1"]["body_b.y"] == [2]


class TestScheduleSuccessorsSkipBehavior:
    """Test that _schedule_successors respects pending state."""

    def test_already_executed_node_not_rescheduled(self) -> None:
        """A successor that already has output should not be re-scheduled."""
        backend = InMemoryGraphBackend()
        backend.add_node("trigger", {"id": "trigger", "type": "manual_trigger", "config": {}})
        backend.add_node("node_a", {"id": "node_a", "type": "script", "config": {}})
        backend.add_edge("trigger", "node_a", None)
        graph = WorkflowGraph(backend)

        wf = _make_workflow()
        wf.resolver.set_namespace("trigger", {})
        wf.resolver.set_namespace("node_a", {"result": "already done"})
        pending: dict[str, asyncio.Task[Any]] = {}

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(wf._schedule_successors("trigger", graph, pending))
        finally:
            for task in pending.values():
                task.cancel()
            loop.close()

        assert "node_a" not in pending


class TestGetSkippedNodesQuerySupplementary:
    """Supplementary tests for get_skipped_nodes behavior."""

    def test_returns_failed_downstream_as_skipped(self) -> None:
        """Nodes marked skipped due to upstream failure should appear in query."""
        graph = _build_chain_graph()
        wf = _make_workflow(failed_nodes={"node_a": "Error"})
        wf._mark_downstream_as_skipped("node_a", graph)

        skipped = wf.get_skipped_nodes()
        assert "node_b" in skipped
        assert "node_c" in skipped
        assert "node_a" not in skipped

    def test_empty_state_returns_empty_list(self) -> None:
        """Fresh workflow with no skips returns empty list."""
        wf = _make_workflow()
        assert wf.get_skipped_nodes() == []

    def test_single_skipped_node(self) -> None:
        """Single skipped node returns that node."""
        wf = _make_workflow(skipped_nodes={"only_node"})
        assert wf.get_skipped_nodes() == ["only_node"]


class TestGetActivityInputEdgeCases:
    """Additional edge cases for get_activity_input."""

    def test_returns_empty_dict_input(self) -> None:
        """An activity with empty dict input should return empty dict, not None."""
        wf = _make_workflow()
        wf.node_inputs["node_a"] = {}
        assert wf.get_activity_input("node_a") == {}

    def test_multiple_activities_independent(self) -> None:
        """Different activities have independent inputs."""
        wf = _make_workflow()
        wf.node_inputs["node_a"] = {"url": "http://a.com"}
        wf.node_inputs["node_b"] = {"url": "http://b.com"}

        assert wf.get_activity_input("node_a") == {"url": "http://a.com"}
        assert wf.get_activity_input("node_b") == {"url": "http://b.com"}


class TestGetActivityOutputEdgeCases:
    """Additional edge cases for get_activity_output."""

    def test_returns_empty_dict_output(self) -> None:
        """An activity with empty dict output should return empty dict, not None."""
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {})
        assert wf.get_activity_output("node_a") == {}

    def test_output_reflects_latest_namespace_value(self) -> None:
        """Output should reflect the latest value set in the namespace."""
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"version": 1})
        wf.resolver.set_namespace("node_a", {"version": 2})
        result = wf.get_activity_output("node_a")
        assert result is not None
        assert result["version"] == 2


class TestPerNodeTimeout:
    """Test that config.timeout overrides DEFAULT_ACTIVITY_TIMEOUT_SECONDS."""

    @pytest.mark.asyncio
    async def test_custom_timeout_passed_to_executor_node(
        self,
        _mock_temporal_workflow: MagicMock,  # noqa: PT019
    ) -> None:
        """A node with config.timeout=60 should use 60s instead of the default."""
        _mock_temporal_workflow.execute_activity = AsyncMock(return_value={"output": {"result": "ok"}})

        wf = _make_workflow()
        node = ActivityNode(node_id="node_custom", node_type="script", config={"timeout": 60, "script": "echo hello"})
        graph = _build_chain_graph()

        await wf._execute_node(node=node, graph=graph)

        _mock_temporal_workflow.execute_activity.assert_called_once()
        call_kwargs = _mock_temporal_workflow.execute_activity.call_args
        assert call_kwargs.kwargs["start_to_close_timeout"] == timedelta(seconds=60)

    @pytest.mark.asyncio
    async def test_default_timeout_used_when_not_specified(
        self,
        _mock_temporal_workflow: MagicMock,  # noqa: PT019
    ) -> None:
        """A node without config.timeout should use DEFAULT_ACTIVITY_TIMEOUT_SECONDS."""
        _mock_temporal_workflow.execute_activity = AsyncMock(return_value={"output": {"result": "ok"}})

        wf = _make_workflow()
        node = ActivityNode(node_id="node_default", node_type="script", config={"script": "echo hello"})
        graph = _build_chain_graph()

        await wf._execute_node(node=node, graph=graph)

        _mock_temporal_workflow.execute_activity.assert_called_once()
        call_kwargs = _mock_temporal_workflow.execute_activity.call_args
        assert call_kwargs.kwargs["start_to_close_timeout"] == timedelta(seconds=DEFAULT_ACTIVITY_TIMEOUT_SECONDS)

    @pytest.mark.asyncio
    async def test_timeout_preserved_in_config_for_activity(
        self,
        _mock_temporal_workflow: MagicMock,  # noqa: PT019
    ) -> None:
        """The timeout key should remain in resolved_config (not popped)."""
        _mock_temporal_workflow.execute_activity = AsyncMock(return_value={"output": {"result": "ok"}})

        wf = _make_workflow()
        node = ActivityNode(node_id="node_keep", node_type="script", config={"timeout": 90, "script": "echo hello"})
        graph = _build_chain_graph()

        await wf._execute_node(node=node, graph=graph)

        # Verify timeout is still in the stored node_inputs (config wasn't mutated)
        assert wf.node_inputs["node_keep"]["timeout"] == 90

    @pytest.mark.asyncio
    async def test_aap_job_template_uses_aap_default_timeout(
        self,
        _mock_temporal_workflow: MagicMock,  # noqa: PT019
    ) -> None:
        """An aap_job_template node without config.timeout should use DEFAULT_AAP_TIMEOUT_SECONDS."""
        _mock_temporal_workflow.execute_activity = AsyncMock(return_value={"output": {"result": "ok"}})

        wf = _make_workflow()
        node = ActivityNode(node_id="launch_job", node_type="aap_job_template", config={"job_template_id": 6})
        graph = _build_chain_graph()

        await wf._execute_node(node=node, graph=graph)

        _mock_temporal_workflow.execute_activity.assert_called_once()
        call_kwargs = _mock_temporal_workflow.execute_activity.call_args
        assert call_kwargs.kwargs["start_to_close_timeout"] == timedelta(seconds=DEFAULT_AAP_TIMEOUT_SECONDS)
