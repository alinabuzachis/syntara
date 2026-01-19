#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "textual>=0.47.0",
#     "websockets>=12.0",
#     "jsonpatch>=1.33",
# ]
# ///
"""
Workflow execution stream viewer.

A terminal UI that connects to the workflow-stream-demo.py WebSocket server
and displays real-time activity updates as a visual graph.

## Features

- Visual graph with activities connected by lines
- Color-coded status indicators with Unicode symbols
- **Top bar with message type indicators**:
  - Cyan: initial_snapshot received
  - Yellow: activity_patch count
  - Green: final_snapshot received
- **State verification**: Compares calculated state (from patches) with final_snapshot
  - Shows red error modal if mismatch detected
  - Modal is scrollable for large diffs
- Sidebar with detailed activity information
- Press [Enter] to restart and fetch from scratch
- Press [Q] to quit

## Usage

    # First, start the demo server:
    ./workflow-stream-demo.py --server

    # Then run this viewer:
    ./workflow-stream-viewer.py

    # Custom WebSocket URL:
    ./workflow-stream-viewer.py --url ws://localhost:8080/ws/workflows/v1/executions/exec-demo-001

## Keyboard Shortcuts

- Enter: Restart and reload from scratch
- Q: Quit the application
- Up/Down: Navigate activities (when implemented)
"""

import argparse
import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import jsonpatch
import websockets
from textual import work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, ScrollableContainer, Vertical
from textual.screen import ModalScreen
from textual.widgets import Button, Footer, Header, Static


# Status configuration: (symbol, color, label)
STATUS_CONFIG = {
    "pending": ("○", "gray", "Pending"),
    "running": ("⟳", "yellow", "Running"),
    "completed": ("✓", "green", "Completed"),
    "failed": ("✗", "red", "Failed"),
}


def compare_states(
    calculated: dict[str, Any], received: dict[str, Any]
) -> tuple[bool, str]:
    """
    Compare calculated state (from patches) with received final snapshot.

    Returns (is_match, diff_description).
    """
    # Generate JSON Patch diff between states
    patch = jsonpatch.make_patch(calculated, received)

    if not patch.patch:
        return True, ""

    # Build human-readable diff
    lines = ["State mismatch detected between calculated and final_snapshot:", ""]

    for op in patch.patch:
        operation = op.get("op", "unknown")
        path = op.get("path", "")
        value = op.get("value")
        from_value = op.get("from")

        if operation == "replace":
            lines.append(f"  [yellow]REPLACE[/yellow] {path}")
            lines.append(f"    Expected (calculated): [red]{json.dumps(calculated_value_at_path(calculated, path))}[/red]")
            lines.append(f"    Received (final):      [green]{json.dumps(value)}[/green]")
        elif operation == "add":
            lines.append(f"  [green]ADD[/green] {path}")
            lines.append(f"    Value: {json.dumps(value)}")
        elif operation == "remove":
            lines.append(f"  [red]REMOVE[/red] {path}")
            lines.append(f"    Value: {json.dumps(calculated_value_at_path(calculated, path))}")
        elif operation == "move":
            lines.append(f"  [blue]MOVE[/blue] {from_value} → {path}")
        else:
            lines.append(f"  [{operation.upper()}] {path}: {json.dumps(value)}")

        lines.append("")

    return False, "\n".join(lines)


def calculated_value_at_path(obj: dict[str, Any], path: str) -> Any:
    """Get value at JSON Pointer path."""
    if not path or path == "/":
        return obj

    parts = path.strip("/").split("/")
    current = obj

    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list):
            try:
                idx = int(part)
                current = current[idx]
            except (ValueError, IndexError):
                return None
        else:
            return None

    return current


class ErrorModal(ModalScreen[None]):
    """Modal screen to display state mismatch errors."""

    CSS = """
    ErrorModal {
        align: center middle;
    }

    #error-dialog {
        width: 80%;
        height: 80%;
        border: thick $error;
        background: $surface;
        padding: 1 2;
    }

    #error-title {
        dock: top;
        height: 3;
        content-align: center middle;
        background: $error;
        color: $text;
        text-style: bold;
        padding: 1;
    }

    #error-scroll {
        height: 1fr;
        border: solid $error-darken-1;
        margin: 1 0;
    }

    #error-content {
        padding: 1;
    }

    #error-close {
        dock: bottom;
        width: 100%;
    }
    """

    BINDINGS = [
        Binding("escape", "close", "Close"),
        Binding("enter", "close", "Close"),
    ]

    def __init__(self, error_message: str, **kwargs) -> None:
        super().__init__(**kwargs)
        self.error_message = error_message

    def compose(self) -> ComposeResult:
        with Vertical(id="error-dialog"):
            yield Static("⚠ STATE VERIFICATION FAILED", id="error-title")
            with ScrollableContainer(id="error-scroll"):
                yield Static(self.error_message, id="error-content")
            yield Button("Close [Esc]", id="error-close", variant="error")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        self.dismiss()

    def action_close(self) -> None:
        self.dismiss()


def format_timestamp(ts: str | None) -> str:
    """Format ISO timestamp for display."""
    if not ts:
        return "—"
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt.strftime("%H:%M:%S.%f")[:-3]
    except (ValueError, AttributeError):
        return str(ts)


def format_duration(started: str | None, completed: str | None) -> str:
    """Calculate and format duration between timestamps."""
    if not started:
        return "—"
    try:
        start_dt = datetime.fromisoformat(started.replace("Z", "+00:00"))
        if completed:
            end_dt = datetime.fromisoformat(completed.replace("Z", "+00:00"))
        else:
            end_dt = datetime.now(start_dt.tzinfo)
        delta = end_dt - start_dt
        ms = int(delta.total_seconds() * 1000)
        if ms < 1000:
            return f"{ms}ms"
        return f"{delta.total_seconds():.2f}s"
    except (ValueError, AttributeError):
        return "—"


@dataclass
class ExecutionState:
    """Mutable execution state."""

    execution_id: str = ""
    workflow_id: str = ""
    status: str = "pending"
    started_at: str | None = None
    completed_at: str | None = None
    activities: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "execution_id": self.execution_id,
            "workflow_id": self.workflow_id,
            "status": self.status,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "activities": self.activities,
        }

    def from_dict(self, data: dict[str, Any]) -> None:
        self.execution_id = data.get("execution_id", "")
        self.workflow_id = data.get("workflow_id", "")
        self.status = data.get("status", "pending")
        self.started_at = data.get("started_at")
        self.completed_at = data.get("completed_at")
        self.activities = data.get("activities", [])

    def apply_patch(self, ops: list[dict[str, Any]]) -> None:
        """Apply JSON Patch operations to the state."""
        current = self.to_dict()
        patch = jsonpatch.JsonPatch(ops)
        patched = patch.apply(current)
        self.from_dict(patched)

    def get_activity(self, name: str) -> dict[str, Any] | None:
        """Get activity by name."""
        for act in self.activities:
            if act.get("activity_id") == name:
                return act
        return None


class ActivityNode(Static):
    """A single activity node in the graph."""

    def __init__(
        self,
        activity_id: str,
        status: str = "pending",
        is_last: bool = False,
        **kwargs,
    ) -> None:
        super().__init__(**kwargs)
        self.activity_id = activity_id
        self._status = status
        self.is_last = is_last

    def compose(self) -> ComposeResult:
        yield Static(id="node-content")
        if not self.is_last:
            yield Static("     │", id="connector", classes="connector")

    def update_status(self, status: str) -> None:
        """Update the node's status display."""
        self._status = status
        self._refresh_display()

    def _refresh_display(self) -> None:
        """Refresh the node display."""
        symbol, color, label = STATUS_CONFIG.get(
            self._status, ("?", "white", "Unknown")
        )
        content = self.query_one("#node-content", Static)

        # Build the node box
        name_display = self.activity_id
        status_display = f"{symbol} {label}"

        box_content = f"[{color}]┌{'─' * 28}┐\n│ {name_display:<26} │\n│ {status_display:<26} │\n└{'─' * 28}┘[/{color}]"
        content.update(box_content)

    def on_mount(self) -> None:
        self._refresh_display()


class GraphPanel(Static):
    """Panel displaying the activity graph."""

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self._activities: list[dict[str, Any]] = []

    def compose(self) -> ComposeResult:
        with ScrollableContainer(id="graph-scroll"):
            yield Vertical(id="graph-container")

    def update_graph(self, activities: list[dict[str, Any]]) -> None:
        """Update the graph with new activity data."""
        self._activities = activities
        container = self.query_one("#graph-container", Vertical)

        # Clear existing nodes
        container.remove_children()

        # Create nodes for each activity
        for i, act in enumerate(activities):
            is_last = i == len(activities) - 1
            node = ActivityNode(
                activity_id=act.get("activity_id", "unknown"),
                status=act.get("status", "pending"),
                is_last=is_last,
                id=f"node-{i}",
            )
            container.mount(node)

    def update_activity_status(self, index: int, status: str) -> None:
        """Update a specific activity's status."""
        try:
            node = self.query_one(f"#node-{index}", ActivityNode)
            node.update_status(status)
        except Exception:
            pass


class DetailSidebar(Static):
    """Sidebar showing execution and activity details."""

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self._state: ExecutionState | None = None
        self._event_count: int = 0
        self._last_event_id: str = ""
        self._last_timestamp: str = ""

    def compose(self) -> ComposeResult:
        with ScrollableContainer(id="sidebar-scroll"):
            yield Static(id="sidebar-content")

    def update_details(
        self,
        state: ExecutionState,
        event_count: int = 0,
        last_event_id: str = "",
        last_timestamp: str = "",
    ) -> None:
        """Update the sidebar with current state."""
        self._state = state
        self._event_count = event_count
        self._last_event_id = last_event_id
        self._last_timestamp = last_timestamp
        self._refresh_display()

    def _refresh_display(self) -> None:
        """Refresh the sidebar content."""
        if not self._state:
            return

        content = self.query_one("#sidebar-content", Static)
        state = self._state

        # Execution status section
        exec_symbol, exec_color, exec_label = STATUS_CONFIG.get(
            state.status, ("?", "white", "Unknown")
        )

        lines = [
            "[bold]━━━ Execution ━━━[/bold]",
            "",
            f"[bold]ID:[/bold] {state.execution_id}",
            f"[bold]Workflow:[/bold] {state.workflow_id}",
            f"[bold]Status:[/bold] [{exec_color}]{exec_symbol} {exec_label}[/{exec_color}]",
            f"[bold]Started:[/bold] {format_timestamp(state.started_at)}",
            f"[bold]Completed:[/bold] {format_timestamp(state.completed_at)}",
            f"[bold]Duration:[/bold] {format_duration(state.started_at, state.completed_at)}",
            "",
            "[bold]━━━ Stream Info ━━━[/bold]",
            "",
            f"[bold]Events:[/bold] {self._event_count}",
            f"[bold]Last Event:[/bold] {self._last_event_id[:20]}..." if len(self._last_event_id) > 20 else f"[bold]Last Event:[/bold] {self._last_event_id}",
            f"[bold]Timestamp:[/bold] {format_timestamp(self._last_timestamp)}",
            "",
            "[bold]━━━ Activities ━━━[/bold]",
            "",
        ]

        # Activity details
        for act in state.activities:
            name = act.get("activity_id", "unknown")
            status = act.get("status", "pending")
            symbol, color, label = STATUS_CONFIG.get(status, ("?", "white", "Unknown"))

            lines.append(f"[bold]{name}[/bold]")
            lines.append(f"  Status: [{color}]{symbol} {label}[/{color}]")

            if act.get("started_at"):
                lines.append(f"  Started: {format_timestamp(act['started_at'])}")

            if act.get("completed_at"):
                lines.append(f"  Completed: {format_timestamp(act['completed_at'])}")
                lines.append(
                    f"  Duration: {format_duration(act['started_at'], act['completed_at'])}"
                )

            if act.get("retry_count", 0) > 0:
                lines.append(f"  [yellow]Retries: {act['retry_count']}[/yellow]")

            if act.get("error_details"):
                lines.append(f"  [red]Error: {act['error_details']}[/red]")

            lines.append("")

        content.update("\n".join(lines))

    def on_mount(self) -> None:
        content = self.query_one("#sidebar-content", Static)
        content.update("[dim]Connecting to WebSocket...[/dim]")


class TopBar(Static):
    """Top bar showing message type indicators."""

    DEFAULT_CSS = """
    TopBar {
        dock: top;
        height: 1;
        background: $primary-background-darken-1;
        color: $text;
        padding: 0 1;
    }
    """

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self._has_initial = False
        self._patch_count = 0
        self._has_final = False

    def update_indicators(
        self, has_initial: bool, patch_count: int, has_final: bool
    ) -> None:
        """Update the message type indicators."""
        self._has_initial = has_initial
        self._patch_count = patch_count
        self._has_final = has_final
        self._refresh_display()

    def _refresh_display(self) -> None:
        """Refresh the indicator display."""
        # Initial snapshot indicator
        initial_color = "cyan" if self._has_initial else "gray"
        initial_symbol = "●" if self._has_initial else "○"
        initial = f"[{initial_color}]{initial_symbol} initial_snapshot[/{initial_color}]"

        # Patch indicator
        if self._patch_count > 0:
            patch_color = "yellow"
            patch_symbol = "●"
        else:
            patch_color = "gray"
            patch_symbol = "○"
        patch = f"[{patch_color}]{patch_symbol} activity_patch ({self._patch_count})[/{patch_color}]"

        # Final snapshot indicator
        final_color = "green" if self._has_final else "gray"
        final_symbol = "●" if self._has_final else "○"
        final = f"[{final_color}]{final_symbol} final_snapshot[/{final_color}]"

        self.update(f"  {initial}  │  {patch}  │  {final}")

    def on_mount(self) -> None:
        self._refresh_display()


class StatusBar(Static):
    """Bottom status bar showing connection state and instructions."""

    DEFAULT_CSS = """
    StatusBar {
        dock: bottom;
        height: 1;
        background: $primary-background;
        color: $text;
        padding: 0 1;
    }
    """

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self._status = "Connecting..."
        self._connected = False

    def update_status(self, message: str, connected: bool = False) -> None:
        self._status = message
        self._connected = connected
        color = "green" if connected else "yellow"
        self.update(f"[{color}]●[/{color}] {message}  │  [dim]Press [Enter] to restart • [Q] to quit[/dim]")


class WorkflowStreamViewer(App):
    """Textual app for viewing workflow execution streams."""

    CSS = """
    Screen {
        layout: horizontal;
    }

    #main-container {
        width: 100%;
        height: 100%;
    }

    #graph-panel {
        width: 2fr;
        height: 100%;
        border: solid $primary;
        padding: 1;
        overflow: hidden;
    }

    #graph-scroll {
        height: 100%;
        width: 100%;
        scrollbar-gutter: stable;
    }

    #graph-container {
        width: 100%;
        height: auto;
    }

    #sidebar {
        width: 1fr;
        min-width: 35;
        height: 100%;
        border: solid $secondary;
        padding: 1;
    }

    #sidebar-scroll {
        height: 100%;
        scrollbar-gutter: stable;
    }

    ActivityNode {
        height: auto;
        width: 100%;
        padding: 0 2;
    }

    .connector {
        color: $text-muted;
        height: 1;
    }

    #sidebar-content {
        width: 100%;
    }
    """

    BINDINGS = [
        Binding("q", "quit", "Quit"),
        Binding("enter", "restart", "Restart"),
    ]

    def __init__(self, websocket_url: str, **kwargs) -> None:
        super().__init__(**kwargs)
        self.websocket_url = websocket_url
        self.state = ExecutionState()
        self.event_count = 0
        self.last_event_id = ""
        self.last_timestamp = ""
        self.has_initial_snapshot = False
        self.patch_count = 0
        self.has_final_snapshot = False
        self._ws: Any = None
        self._ws_task: asyncio.Task | None = None

    def compose(self) -> ComposeResult:
        yield Header()
        yield TopBar(id="top-bar")
        with Horizontal(id="main-container"):
            yield GraphPanel(id="graph-panel")
            yield DetailSidebar(id="sidebar")
        yield StatusBar(id="status-bar")
        yield Footer()

    def on_mount(self) -> None:
        """Start WebSocket connection when app mounts."""
        self.title = "Workflow Stream Viewer"
        self.sub_title = self.websocket_url
        self._start_websocket()

    @work(exclusive=True)
    async def _start_websocket(self) -> None:
        """Connect to WebSocket and process messages."""
        status_bar = self.query_one("#status-bar", StatusBar)

        # Reset state
        self.state = ExecutionState()
        self.event_count = 0
        self.last_event_id = ""
        self.last_timestamp = ""
        self.has_initial_snapshot = False
        self.patch_count = 0
        self.has_final_snapshot = False

        # Reset topbar
        self._update_topbar()

        # Clear the graph
        graph = self.query_one("#graph-panel", GraphPanel)
        container = graph.query_one("#graph-container", Vertical)
        container.remove_children()

        # Update sidebar to show connecting
        sidebar = self.query_one("#sidebar", DetailSidebar)
        sidebar_content = sidebar.query_one("#sidebar-content", Static)
        sidebar_content.update("[dim]Connecting to WebSocket...[/dim]")

        try:
            url = f"{self.websocket_url}?replay=0"
            status_bar.update_status(f"Connecting to {url}...")

            async with websockets.connect(url) as ws:
                self._ws = ws
                status_bar.update_status("Connected - Streaming events", connected=True)

                async for message in ws:
                    await self._process_message(message)

        except websockets.exceptions.ConnectionClosed:
            status_bar.update_status("Connection closed")
        except Exception as e:
            status_bar.update_status(f"Error: {e}")

    async def _process_message(self, message: str) -> None:
        """Process a WebSocket message."""
        try:
            data = json.loads(message)
            msg_type = data.get("type")
            self.event_count += 1
            self.last_event_id = data.get("event_id", "")
            self.last_timestamp = data.get("timestamp", "")

            if msg_type == "initial_snapshot":
                await self._handle_initial_snapshot(data)
            elif msg_type == "final_snapshot":
                await self._handle_final_snapshot(data)
            elif msg_type == "activity_patch":
                await self._handle_patch(data)

        except json.JSONDecodeError:
            pass

    async def _handle_initial_snapshot(self, data: dict[str, Any]) -> None:
        """Handle initial_snapshot message."""
        self.has_initial_snapshot = True
        execution = data.get("execution", {})
        self.state.from_dict(execution)

        # Update graph
        graph = self.query_one("#graph-panel", GraphPanel)
        graph.update_graph(self.state.activities)

        # Update sidebar and topbar
        self._update_sidebar()
        self._update_topbar()

    async def _handle_final_snapshot(self, data: dict[str, Any]) -> None:
        """Handle final_snapshot message."""
        self.has_final_snapshot = True

        # Get the received final state
        received_execution = data.get("execution", {})

        # Capture calculated state BEFORE applying final snapshot
        calculated_state = self.state.to_dict()

        # Verify: compare calculated state with received final snapshot
        is_match, diff_message = compare_states(calculated_state, received_execution)

        if not is_match:
            # Show error modal with mismatch details
            self.push_screen(ErrorModal(diff_message))

            # Update status bar to indicate error
            status_bar = self.query_one("#status-bar", StatusBar)
            status_bar.update_status("[red]State mismatch detected![/red]", connected=True)
        else:
            # Update status bar for success
            status_bar = self.query_one("#status-bar", StatusBar)
            status_bar.update_status("Stream complete - State verified ✓", connected=True)

        # Apply the final snapshot state (even if mismatch, show final state)
        self.state.from_dict(received_execution)

        # Update graph
        graph = self.query_one("#graph-panel", GraphPanel)
        for i, act in enumerate(self.state.activities):
            graph.update_activity_status(i, act.get("status", "pending"))

        # Update sidebar and topbar
        self._update_sidebar()
        self._update_topbar()

    async def _handle_patch(self, data: dict[str, Any]) -> None:
        """Handle activity_patch message."""
        self.patch_count += 1
        ops = data.get("ops", [])
        self.state.apply_patch(ops)

        # Update graph nodes
        graph = self.query_one("#graph-panel", GraphPanel)
        for i, act in enumerate(self.state.activities):
            graph.update_activity_status(i, act.get("status", "pending"))

        # Update sidebar and topbar
        self._update_sidebar()
        self._update_topbar()

    def _update_sidebar(self) -> None:
        """Update the sidebar with current state."""
        sidebar = self.query_one("#sidebar", DetailSidebar)
        sidebar.update_details(
            self.state,
            self.event_count,
            self.last_event_id,
            self.last_timestamp,
        )

    def _update_topbar(self) -> None:
        """Update the topbar message type indicators."""
        try:
            topbar = self.query_one("#top-bar", TopBar)
            topbar.update_indicators(
                self.has_initial_snapshot,
                self.patch_count,
                self.has_final_snapshot,
            )
        except Exception:
            pass  # TopBar may not be mounted yet

    def action_restart(self) -> None:
        """Restart the WebSocket connection."""
        self._start_websocket()

    def action_quit(self) -> None:
        """Quit the application."""
        self.exit()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Workflow execution stream viewer",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--url",
        type=str,
        default="ws://localhost:8765/ws/workflows/v1/executions/exec-demo-001",
        help="WebSocket URL to connect to",
    )

    args = parser.parse_args()

    app = WorkflowStreamViewer(websocket_url=args.url)
    app.run()


if __name__ == "__main__":
    main()
