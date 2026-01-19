#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "jsonpatch>=1.33",
#     "websockets>=12.0",
# ]
# ///
"""
Workflow execution streaming demo.

Simulates real-time workflow activity updates using JSON Patch (RFC 6902) format.
This script demonstrates the WebSocket streaming protocol defined in Story 2
(Backend Valkey Streams and WebSocket Streaming).

## Message Types

1. **initial_snapshot** - Full state sent on initial connection (replay=0):
   {
     "type": "initial_snapshot",
     "execution_id": "exec-demo-001",
     "event_id": "1691431234000-0",
     "timestamp": "2025-12-10T15:30:00Z",
     "execution": { ... full execution state ... }
   }

2. **activity_patch** - Incremental updates via JSON Patch operations:
   {
     "type": "activity_patch",
     "execution_id": "exec-demo-001",
     "event_id": "1691431234100-1",
     "timestamp": "2025-12-10T15:30:01Z",
     "ops": [
       {"op": "replace", "path": "/activities/0/status", "value": "running"}
     ]
   }

3. **final_snapshot** - Full state sent after all patches are applied:
   {
     "type": "final_snapshot",
     "execution_id": "exec-demo-001",
     "event_id": "1691431234100-15",
     "timestamp": "2025-12-10T15:31:00Z",
     "execution": { ... final execution state ... }
   }

## Demo Workflow Scenario

Simulates a 5-activity workflow with 14 events demonstrating:
- Execution lifecycle (pending → running → completed)
- Activity transitions (pending → running → completed)
- Error handling (process_data fails with timeout, then retries successfully)
- Retry counter increments

Activities: fetch_data → validate_input → process_data → send_notification → cleanup

## WebSocket Replay Behavior

- No parameter: Only new events (simulates waiting for new events)
- ?replay=0: Full replay from beginning (snapshot + all events)
- ?replay=<event_id>: Resume from specific event ID onwards

## Usage

    # Print to stdout with default 200ms delay
    ./workflow-stream-demo.py

    # Custom delay (500ms)
    ./workflow-stream-demo.py --delay 500

    # Start WebSocket server
    ./workflow-stream-demo.py --server

    # WebSocket server on custom port
    ./workflow-stream-demo.py --server --port 8080

## WebSocket Connection Examples

    # Connect and replay all events
    websocat ws://localhost:8765/ws/workflows/v1/executions/exec-demo-001?replay=0

    # Resume from specific event
    websocat ws://localhost:8765/ws/workflows/v1/executions/exec-demo-001?replay=1691431234100-5
"""

import argparse
import asyncio
import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import jsonpatch


def utc_now() -> str:
    """Return current UTC timestamp in ISO format."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def generate_event_id(seq: int = 0) -> str:
    """Generate a Redis-style event ID (timestamp-sequence)."""
    return f"{int(time.time() * 1000)}-{seq}"


@dataclass
class ExecutionState:
    """Mutable execution state for tracking changes."""

    execution_id: str = "exec-demo-001"
    workflow_id: str = "demo-workflow"
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


def create_initial_state() -> ExecutionState:
    """Create initial execution state with pending activities."""
    state = ExecutionState()
    state.activities = [
        {
            "activity_id": "fetch_data",
            "status": "pending",
            "error_details": None,
            "started_at": None,
            "completed_at": None,
            "retry_count": 0,
        },
        {
            "activity_id": "validate_input",
            "status": "pending",
            "error_details": None,
            "started_at": None,
            "completed_at": None,
            "retry_count": 0,
        },
        {
            "activity_id": "process_data",
            "status": "pending",
            "error_details": None,
            "started_at": None,
            "completed_at": None,
            "retry_count": 0,
        },
        {
            "activity_id": "send_notification",
            "status": "pending",
            "error_details": None,
            "started_at": None,
            "completed_at": None,
            "retry_count": 0,
        },
        {
            "activity_id": "cleanup",
            "status": "pending",
            "error_details": None,
            "started_at": None,
            "completed_at": None,
            "retry_count": 0,
        },
    ]
    return state


def create_snapshot_message(
    state: ExecutionState, event_id: str, snapshot_type: str = "initial_snapshot"
) -> dict[str, Any]:
    """Create a snapshot message (initial_snapshot or final_snapshot)."""
    return {
        "type": snapshot_type,
        "execution_id": state.execution_id,
        "event_id": event_id,
        "timestamp": utc_now(),
        "execution": state.to_dict(),
    }


def create_patch_message(
    execution_id: str, event_id: str, ops: list[dict[str, Any]]
) -> dict[str, Any]:
    """Create an activity_patch message."""
    return {
        "type": "activity_patch",
        "execution_id": execution_id,
        "event_id": event_id,
        "timestamp": utc_now(),
        "ops": ops,
    }


def find_activity_index(activities: list[dict], name: str) -> int:
    """Find activity index by name."""
    for i, act in enumerate(activities):
        if act["activity_id"] == name:
            return i
    raise ValueError(f"Activity {name} not found")


def generate_events(state: ExecutionState) -> list[dict[str, Any]]:
    """
    Generate a sequence of events simulating a workflow execution.

    Demonstrates:
    - Execution start
    - Activity status transitions (pending → running → completed)
    - Activity failure with retry
    - Parallel activity execution hint
    - Error details
    - Final execution completion
    """
    events: list[dict[str, Any]] = []
    seq = 0

    def next_event_id() -> str:
        nonlocal seq
        seq += 1
        return generate_event_id(seq)

    # Store original state for patch generation BEFORE any mutations
    prev_state = json.loads(json.dumps(state.to_dict()))

    # Initial snapshot (captured before mutations)
    initial_id = generate_event_id(0)
    events.append(create_snapshot_message(
        ExecutionState(**{
            "execution_id": prev_state["execution_id"],
            "workflow_id": prev_state["workflow_id"],
            "status": prev_state["status"],
            "started_at": prev_state["started_at"],
            "completed_at": prev_state["completed_at"],
            "activities": prev_state["activities"],
        }),
        initial_id
    ))

    # --- Event 1: Execution starts ---
    state.status = "running"
    state.started_at = utc_now()
    patch = jsonpatch.make_patch(prev_state, state.to_dict())
    events.append(create_patch_message(state.execution_id, next_event_id(), patch.patch))
    prev_state = json.loads(json.dumps(state.to_dict()))

    # --- Event 2: fetch_data starts ---
    idx = find_activity_index(state.activities, "fetch_data")
    state.activities[idx]["status"] = "running"
    state.activities[idx]["started_at"] = utc_now()
    patch = jsonpatch.make_patch(prev_state, state.to_dict())
    events.append(create_patch_message(state.execution_id, next_event_id(), patch.patch))
    prev_state = json.loads(json.dumps(state.to_dict()))

    # --- Event 3: fetch_data completes ---
    state.activities[idx]["status"] = "completed"
    state.activities[idx]["completed_at"] = utc_now()
    patch = jsonpatch.make_patch(prev_state, state.to_dict())
    events.append(create_patch_message(state.execution_id, next_event_id(), patch.patch))
    prev_state = json.loads(json.dumps(state.to_dict()))

    # --- Event 4: validate_input starts ---
    idx = find_activity_index(state.activities, "validate_input")
    state.activities[idx]["status"] = "running"
    state.activities[idx]["started_at"] = utc_now()
    patch = jsonpatch.make_patch(prev_state, state.to_dict())
    events.append(create_patch_message(state.execution_id, next_event_id(), patch.patch))
    prev_state = json.loads(json.dumps(state.to_dict()))

    # --- Event 5: validate_input completes ---
    state.activities[idx]["status"] = "completed"
    state.activities[idx]["completed_at"] = utc_now()
    patch = jsonpatch.make_patch(prev_state, state.to_dict())
    events.append(create_patch_message(state.execution_id, next_event_id(), patch.patch))
    prev_state = json.loads(json.dumps(state.to_dict()))

    # --- Event 6: process_data starts ---
    idx = find_activity_index(state.activities, "process_data")
    state.activities[idx]["status"] = "running"
    state.activities[idx]["started_at"] = utc_now()
    patch = jsonpatch.make_patch(prev_state, state.to_dict())
    events.append(create_patch_message(state.execution_id, next_event_id(), patch.patch))
    prev_state = json.loads(json.dumps(state.to_dict()))

    # --- Event 7: process_data FAILS (demonstrates error) ---
    state.activities[idx]["status"] = "failed"
    state.activities[idx]["error_details"] = "Connection timeout after 30s"
    patch = jsonpatch.make_patch(prev_state, state.to_dict())
    events.append(create_patch_message(state.execution_id, next_event_id(), patch.patch))
    prev_state = json.loads(json.dumps(state.to_dict()))

    # --- Event 8: process_data retries (back to running) ---
    state.activities[idx]["status"] = "running"
    state.activities[idx]["error_details"] = None
    state.activities[idx]["retry_count"] = 1
    patch = jsonpatch.make_patch(prev_state, state.to_dict())
    events.append(create_patch_message(state.execution_id, next_event_id(), patch.patch))
    prev_state = json.loads(json.dumps(state.to_dict()))

    # --- Event 9: process_data completes on retry ---
    state.activities[idx]["status"] = "completed"
    state.activities[idx]["completed_at"] = utc_now()
    patch = jsonpatch.make_patch(prev_state, state.to_dict())
    events.append(create_patch_message(state.execution_id, next_event_id(), patch.patch))
    prev_state = json.loads(json.dumps(state.to_dict()))

    # --- Event 10: send_notification starts ---
    idx = find_activity_index(state.activities, "send_notification")
    state.activities[idx]["status"] = "running"
    state.activities[idx]["started_at"] = utc_now()
    patch = jsonpatch.make_patch(prev_state, state.to_dict())
    events.append(create_patch_message(state.execution_id, next_event_id(), patch.patch))
    prev_state = json.loads(json.dumps(state.to_dict()))

    # --- Event 11: send_notification completes ---
    state.activities[idx]["status"] = "completed"
    state.activities[idx]["completed_at"] = utc_now()
    patch = jsonpatch.make_patch(prev_state, state.to_dict())
    events.append(create_patch_message(state.execution_id, next_event_id(), patch.patch))
    prev_state = json.loads(json.dumps(state.to_dict()))

    # --- Event 12: cleanup starts ---
    idx = find_activity_index(state.activities, "cleanup")
    state.activities[idx]["status"] = "running"
    state.activities[idx]["started_at"] = utc_now()
    patch = jsonpatch.make_patch(prev_state, state.to_dict())
    events.append(create_patch_message(state.execution_id, next_event_id(), patch.patch))
    prev_state = json.loads(json.dumps(state.to_dict()))

    # --- Event 13: cleanup completes ---
    state.activities[idx]["status"] = "completed"
    state.activities[idx]["completed_at"] = utc_now()
    patch = jsonpatch.make_patch(prev_state, state.to_dict())
    events.append(create_patch_message(state.execution_id, next_event_id(), patch.patch))
    prev_state = json.loads(json.dumps(state.to_dict()))

    # --- Event 14: Execution completes ---
    state.status = "completed"
    state.completed_at = utc_now()
    patch = jsonpatch.make_patch(prev_state, state.to_dict())
    events.append(create_patch_message(state.execution_id, next_event_id(), patch.patch))

    # --- Final snapshot: Full state after all patches applied ---
    final_id = next_event_id()
    events.append(create_snapshot_message(state, final_id, "final_snapshot"))

    return events


async def stream_to_stdout(delay_ms: int) -> None:
    """Stream events to stdout with delay between each."""
    state = create_initial_state()
    events = generate_events(state)
    delay_sec = delay_ms / 1000.0

    for i, event in enumerate(events):
        print(json.dumps(event, indent=2))
        if i < len(events) - 1:
            await asyncio.sleep(delay_sec)


async def run_websocket_server(port: int, delay_ms: int) -> None:
    """Run WebSocket server with replay support."""
    import websockets
    from urllib.parse import parse_qs, urlparse

    # Pre-generate all events
    state = create_initial_state()
    all_events = generate_events(state)

    # Build event_id index for replay
    event_index: dict[str, int] = {}
    for i, event in enumerate(all_events):
        if "event_id" in event:
            event_index[event["event_id"]] = i

    async def handle_connection(websocket: Any) -> None:
        """Handle a single WebSocket connection."""
        # Parse replay parameter from path
        path = websocket.request.path if hasattr(websocket, 'request') else websocket.path
        parsed = urlparse(path)
        query_params = parse_qs(parsed.query)
        replay_param = query_params.get("replay", [None])[0]

        # Determine starting index
        start_idx = len(all_events)  # Default: no replay, wait for new events

        if replay_param is not None:
            if replay_param == "0":
                # Replay from beginning
                start_idx = 0
            elif replay_param in event_index:
                # Replay from specific event (exclusive - start after this event)
                start_idx = event_index[replay_param] + 1
            else:
                # Unknown event_id, start from beginning
                start_idx = 0

        delay_sec = delay_ms / 1000.0

        try:
            # Send replayed events
            for i in range(start_idx, len(all_events)):
                await websocket.send(json.dumps(all_events[i]))
                if i < len(all_events) - 1:
                    await asyncio.sleep(delay_sec)

        except websockets.exceptions.ConnectionClosed:
            pass

    # Extract execution_id from events for the path
    execution_id = all_events[0]["execution_id"] if all_events else "demo"

    print(f"Starting WebSocket server on port {port}")
    print(f"Connect to: ws://localhost:{port}/ws/workflows/v1/executions/{execution_id}")
    print(f"  - Add ?replay=0 to receive all events from the beginning")
    print(f"  - Add ?replay=<event_id> to resume from a specific point")
    print(f"  - Default (no param): only new events")
    print()

    async with websockets.serve(handle_connection, "localhost", port):
        await asyncio.Future()  # Run forever


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Workflow execution streaming demo",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--server",
        action="store_true",
        help="Start WebSocket server instead of printing to stdout",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8765,
        help="WebSocket server port (default: 8765)",
    )
    parser.add_argument(
        "--delay",
        type=int,
        default=200,
        help="Delay between events in milliseconds (default: 200)",
    )

    args = parser.parse_args()

    if args.server:
        asyncio.run(run_websocket_server(args.port, args.delay))
    else:
        asyncio.run(stream_to_stdout(args.delay))


if __name__ == "__main__":
    main()
