"""Unit tests for NexusWorkflow approval context preparation methods.

Tests cover:
- _get_previous_step_context: building previous step context for approval requests
- _prepare_approval_args: assembling the full argument list for create_approval_request_activity
"""

from collections.abc import Generator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from nexus.workflows.utils.namespace_resolver import NamespaceResolver
from nexus.workflows.workflow_engine.dynamic_workflow import NexusWorkflow
from nexus.workflows.workflow_engine.graph import ActivityNode, WorkflowGraph
from nexus.workflows.workflow_engine.graph_backend import InMemoryGraphBackend
from nexus.workflows.workflow_engine.models.workflow_definition import ActivityName


@pytest.fixture(autouse=True)
def _mock_temporal_workflow() -> Generator[MagicMock]:
    """Mock the Temporal workflow module."""
    mock_logger = MagicMock()
    with patch("nexus.workflows.workflow_engine.dynamic_workflow.workflow") as mock_wf:
        mock_wf.logger = mock_logger
        mock_wf.info.return_value = MagicMock(workflow_id="test-wf-id")
        mock_wf.now.return_value = datetime(2026, 4, 10, 12, 0, 0, tzinfo=UTC)
        yield mock_wf


def _make_workflow(
    execution_id: str = "exec-123",
    resolver: NamespaceResolver | None = None,
) -> NexusWorkflow:
    """Create a NexusWorkflow with initialized state, bypassing __init__."""
    wf = NexusWorkflow.__new__(NexusWorkflow)
    wf.execution_id = execution_id
    wf.skipped_nodes = set()
    wf.failed_nodes = {}
    wf.resolver = resolver if resolver is not None else NamespaceResolver()
    wf.node_inputs = {}
    wf.node_control_data = {}
    wf.loop_state = {}
    wf.loop_body_map = {}
    wf.loop_iteration_results = {}
    wf._activity_signals = {}
    wf._timeout_tasks = {}
    wf._timed_out_converge_nodes = set()
    wf.pre_resolved_outputs = {}
    wf.stop_after_nodes = set()
    return wf


def _build_approval_graph(*, with_predecessor: bool = True, with_successor: bool = True) -> WorkflowGraph:
    """Build a graph with an approval node.

    Structure: trigger -> [scan ->] approval -> [deploy]
    """
    backend = InMemoryGraphBackend()
    backend.add_node("trigger", {"id": "trigger", "type": "manual_trigger", "config": {}})
    backend.add_node(
        "approval",
        {
            "id": "approval",
            "type": "approval",
            "config": {"name": "Review Deployment", "approver_timeout": 3600},
        },
    )

    if with_predecessor:
        backend.add_node(
            "scan",
            {"id": "scan", "type": "script", "config": {"name": "Security Scan"}},
        )
        backend.add_edge("trigger", "scan", None)
        backend.add_edge("scan", "approval", None)
    else:
        backend.add_edge("trigger", "approval", None)

    if with_successor:
        backend.add_node(
            "deploy",
            {"id": "deploy", "type": "script", "config": {"name": "Deploy to Prod"}},
        )
        backend.add_edge("approval", "deploy", {"from_port": "approved"})

    graph = WorkflowGraph(backend)
    graph.metadata = {"name": "Production Pipeline"}
    return graph


class TestGetPreviousStepContext:
    """Tests for _get_previous_step_context method."""

    def test_returns_none_when_no_predecessors(self) -> None:
        """Approval node with no predecessors returns None."""
        wf = _make_workflow()

        backend = InMemoryGraphBackend()
        backend.add_node("orphan", {"id": "orphan", "type": "approval", "config": {}})
        isolated_graph = WorkflowGraph(backend)

        result = wf._get_previous_step_context("orphan", isolated_graph)
        assert result is None

    def test_returns_predecessor_context_with_output(self) -> None:
        """Returns predecessor id, name, type, and output."""
        resolver = NamespaceResolver()
        resolver.set_namespace("scan", {"vulnerabilities": 0, "passed": True})
        wf = _make_workflow(resolver=resolver)
        graph = _build_approval_graph()

        result = wf._get_previous_step_context("approval", graph)

        assert result is not None
        assert result["id"] == "scan"
        assert result["name"] == "Security Scan"
        assert result["type"] == "script"
        assert result["output"] == {"vulnerabilities": 0, "passed": True}

    def test_uses_node_id_when_name_missing(self) -> None:
        """Falls back to node ID when config has no name."""
        wf = _make_workflow()
        backend = InMemoryGraphBackend()
        backend.add_node("prev_node", {"id": "prev_node", "type": "task", "config": {}})
        backend.add_node("approval", {"id": "approval", "type": "approval", "config": {}})
        backend.add_edge("prev_node", "approval", None)
        graph = WorkflowGraph(backend)

        result = wf._get_previous_step_context("approval", graph)

        assert result is not None
        assert result["name"] == "prev_node"

    def test_returns_none_output_when_namespace_missing(self) -> None:
        """Output is None when predecessor hasn't executed yet."""
        wf = _make_workflow()
        graph = _build_approval_graph()

        result = wf._get_previous_step_context("approval", graph)

        assert result is not None
        assert result["id"] == "scan"
        assert result["output"] is None

    def test_returns_failed_status_when_predecessor_failed(self) -> None:
        """Output includes failure info when predecessor failed (via resolver)."""
        resolver = NamespaceResolver()
        resolver.set_namespace("scan", {"status": "failed", "error": "Script exited with code 1"})
        wf = _make_workflow(resolver=resolver)
        graph = _build_approval_graph()

        result = wf._get_previous_step_context("approval", graph)

        assert result is not None
        assert result["id"] == "scan"
        assert result["output"] == {"status": "failed", "error": "Script exited with code 1"}

    def test_returns_skipped_status_when_predecessor_skipped(self) -> None:
        """Output includes skipped status when predecessor was skipped."""
        wf = _make_workflow()
        wf.skipped_nodes.add("scan")
        graph = _build_approval_graph()

        result = wf._get_previous_step_context("approval", graph)

        assert result is not None
        assert result["id"] == "scan"
        assert result["output"] == {"status": "skipped"}


class TestPrepareApprovalArgs:
    """Tests for _prepare_approval_args method."""

    def test_basic_approval_args(self) -> None:
        """Returns 7-element arg list with correct structure."""
        resolver = NamespaceResolver()
        resolver.set_namespace("trigger", {"env": "production"})
        wf = _make_workflow(execution_id="exec-456", resolver=resolver)
        graph = _build_approval_graph()
        node = ActivityNode("approval", "approval", {"name": "Review Deployment", "approver_timeout": 3600})

        args = wf._prepare_approval_args(node, graph, node.config)

        assert len(args) == 7
        assert args[0] == "exec-456"  # execution_id
        assert args[1] == "approval"  # approval_node_id
        assert args[2] == "Review Deployment"  # name

    def test_next_step_approved_from_successor(self) -> None:
        """next_step_approved built from first graph successor."""
        wf = _make_workflow()
        graph = _build_approval_graph()
        node = ActivityNode("approval", "approval", {"name": "Review"})

        args = wf._prepare_approval_args(node, graph, node.config)

        next_step = args[3]
        assert next_step["id"] == "deploy"
        assert next_step["name"] == "Deploy to Prod"
        assert next_step["type"] == "script"

    def test_raises_when_no_approved_successor(self) -> None:
        """Raises SafeValueError when approval node has no approved successor."""
        from nexus.core.exceptions import SafeValueError

        wf = _make_workflow()
        graph = _build_approval_graph(with_successor=False)
        node = ActivityNode("approval", "approval", {"name": "Review"})

        with pytest.raises(SafeValueError, match="has no approved successor"):
            wf._prepare_approval_args(node, graph, node.config)

    def test_workflow_context_populated(self) -> None:
        """Workflow context includes name and trigger inputs."""
        resolver = NamespaceResolver()
        resolver.set_namespace("trigger", {"target": "prod", "version": "2.0"})
        wf = _make_workflow(resolver=resolver)
        graph = _build_approval_graph()
        node = ActivityNode("approval", "approval", {"name": "Review"})

        args = wf._prepare_approval_args(node, graph, node.config)

        ctx = args[4]
        assert ctx["workflow_name"] == "Production Pipeline"
        assert ctx["inputs"] == {"target": "prod", "version": "2.0"}
        assert ctx["workflow_version_id"] is not None

    def test_workflow_context_empty_inputs_when_trigger_missing(self) -> None:
        """Inputs default to empty dict when trigger namespace is missing."""
        wf = _make_workflow()
        graph = _build_approval_graph()
        node = ActivityNode("approval", "approval", {"name": "Review"})

        args = wf._prepare_approval_args(node, graph, node.config)

        ctx = args[4]
        assert ctx["inputs"] == {}

    def test_timeout_at_computed_from_config(self) -> None:
        """timeout_at is ISO string when approver_timeout is set."""
        wf = _make_workflow()
        graph = _build_approval_graph()
        node = ActivityNode("approval", "approval", {"name": "Review", "approver_timeout": 3600})

        args = wf._prepare_approval_args(node, graph, node.config)

        timeout_at = args[5]
        assert timeout_at is not None
        parsed = datetime.fromisoformat(timeout_at)
        assert parsed.year == 2026
        assert parsed.hour == 13  # 12:00 + 1 hour

    def test_timeout_at_none_when_not_configured(self) -> None:
        """timeout_at is None when approver_timeout is not in config."""
        wf = _make_workflow()
        graph = _build_approval_graph()
        node = ActivityNode("approval", "approval", {"name": "Review"})

        args = wf._prepare_approval_args(node, graph, node.config)

        assert args[5] is None

    def test_next_step_rejected_always_none(self) -> None:
        """next_step_rejected is None (port-based routing not yet implemented)."""
        wf = _make_workflow()
        graph = _build_approval_graph()
        node = ActivityNode("approval", "approval", {"name": "Review"})

        args = wf._prepare_approval_args(node, graph, node.config)

        assert args[6] is None

    def test_name_fallback_to_node_id(self) -> None:
        """Name falls back to 'Approval for {id}' when config has no name."""
        wf = _make_workflow()
        backend = InMemoryGraphBackend()
        backend.add_node("trigger", {"id": "trigger", "type": "manual_trigger", "config": {}})
        backend.add_node("my_approval", {"id": "my_approval", "type": "approval", "config": {}})
        backend.add_node("next", {"id": "next", "type": "script", "config": {"name": "Next Step"}})
        backend.add_edge("trigger", "my_approval", None)
        backend.add_edge("my_approval", "next", {"from_port": "approved"})
        graph = WorkflowGraph(backend)
        graph.metadata = {"name": "Test"}
        node = ActivityNode("my_approval", "approval", {})

        args = wf._prepare_approval_args(node, graph, node.config)

        assert args[2] == "Approval for my_approval"

    def test_workflow_name_fallback_to_unknown(self) -> None:
        """Workflow name defaults to 'Unknown' when metadata has no name."""
        wf = _make_workflow()
        graph = _build_approval_graph()
        graph.metadata = {}
        node = ActivityNode("approval", "approval", {"name": "Review"})

        args = wf._prepare_approval_args(node, graph, node.config)

        ctx = args[4]
        assert ctx["workflow_name"] == "Unknown"

    def test_workflow_name_fallback_when_none(self) -> None:
        """Workflow name defaults to 'Unknown' when metadata name is None."""
        wf = _make_workflow()
        graph = _build_approval_graph()
        graph.metadata = {"name": None}
        node = ActivityNode("approval", "approval", {"name": "Review"})

        args = wf._prepare_approval_args(node, graph, node.config)

        ctx = args[4]
        assert ctx["workflow_name"] == "Unknown"


class TestDispatchApprovalNode:
    """Tests for approval node dispatch integration."""

    @pytest.mark.asyncio
    async def test_dispatch_passes_prepared_args_to_signal_node(self) -> None:
        """Verify _dispatch_node passes _prepare_approval_args output as activity_args."""
        resolver = NamespaceResolver()
        resolver.set_namespace("trigger", {"env": "prod"})
        wf = _make_workflow(execution_id="exec-789", resolver=resolver)
        graph = _build_approval_graph()
        node = graph.get_node("approval")

        mock_signal = AsyncMock(return_value={"output": {"id": "apr-1", "status": "pending"}})

        with patch.object(wf, "_execute_signal_node", mock_signal):
            await wf._dispatch_node(node, {"name": "Review Deployment"}, graph, timeout_seconds=300)

        mock_signal.assert_called_once()
        call_kwargs = mock_signal.call_args.kwargs
        assert call_kwargs["activity_args"] is not None

        args = call_kwargs["activity_args"]
        assert len(args) == 7
        assert args[0] == "exec-789"  # execution_id
        assert args[1] == "approval"  # approval_node_id
        assert args[2] == "Review Deployment"  # name
        assert args[3]["id"] == "deploy"  # next_step_approved from successor
        assert args[4]["workflow_name"] == "Production Pipeline"  # workflow_context

        # Also verify the activity name
        call_positional = mock_signal.call_args.args
        assert call_positional[1] == ActivityName.APPROVAL

    @pytest.mark.asyncio
    async def test_dispatch_sets_approved_port(self) -> None:
        """Verify approval dispatch sets control.next_port for approved status."""
        wf = _make_workflow()
        graph = _build_approval_graph()
        node = graph.get_node("approval")

        mock_signal = AsyncMock(return_value={"output": {"status": "approved", "approval_id": "apr-1"}})

        with patch.object(wf, "_execute_signal_node", mock_signal):
            result = await wf._dispatch_node(node, {"name": "Review"}, graph, timeout_seconds=300)

        assert result["control"] == {"next_port": "approved"}

    @pytest.mark.asyncio
    async def test_dispatch_sets_rejected_port(self) -> None:
        """Verify approval dispatch sets control.next_port for rejected status."""
        wf = _make_workflow()
        graph = _build_approval_graph()
        node = graph.get_node("approval")

        mock_signal = AsyncMock(return_value={"output": {"status": "rejected", "approval_id": "apr-1"}})

        with patch.object(wf, "_execute_signal_node", mock_signal):
            result = await wf._dispatch_node(node, {"name": "Review"}, graph, timeout_seconds=300)

        assert result["control"] == {"next_port": "rejected"}

    @pytest.mark.asyncio
    async def test_dispatch_defaults_to_rejected_on_unexpected_status(self) -> None:
        """Verify unexpected approval status defaults to rejected port."""
        wf = _make_workflow()
        graph = _build_approval_graph()
        node = graph.get_node("approval")

        mock_signal = AsyncMock(return_value={"output": {"status": "cancelled"}})

        with patch.object(wf, "_execute_signal_node", mock_signal):
            result = await wf._dispatch_node(node, {"name": "Review"}, graph, timeout_seconds=300)

        assert result["control"] == {"next_port": "rejected"}

    @pytest.mark.asyncio
    @pytest.mark.parametrize("approval_status", ["approved", "rejected"])
    async def test_dispatch_sets_control_data_from_approval_signal(self, approval_status: str) -> None:
        """Verify _dispatch_node adds control data with next_port from approval decision."""
        wf = _make_workflow()
        graph = _build_approval_graph()
        node = graph.get_node("approval")

        mock_signal = AsyncMock(return_value={"output": {"status": approval_status, "approval_id": "apr-1"}})

        with patch.object(wf, "_execute_signal_node", mock_signal):
            result = await wf._dispatch_node(node, {"name": "Review"}, graph, timeout_seconds=300)

        assert "control" in result
        assert result["control"]["next_port"] == approval_status

    @pytest.mark.asyncio
    async def test_dispatch_routes_unexpected_status_to_rejected(self) -> None:
        """Verify unexpected approval status defensively routes to rejected."""
        wf = _make_workflow()
        graph = _build_approval_graph()
        node = graph.get_node("approval")

        mock_signal = AsyncMock(return_value={"output": {"status": "pending", "approval_id": "apr-1"}})

        with patch.object(wf, "_execute_signal_node", mock_signal):
            result = await wf._dispatch_node(node, {"name": "Review"}, graph, timeout_seconds=300)

        assert result["control"]["next_port"] == "rejected"
