"""Mock Segment server for capturing telemetry events in e2e tests.

Mimics the Segment Batch API (POST /v1/batch) and provides test-only
endpoints for inspecting and managing captured events.

Run standalone:
    uv run python tests/e2e/telemetry/mock_segment_server.py
"""

import gzip
import json
import os
import threading
from typing import Any

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI(title="Mock Segment Server")


_MAX_BODY_SIZE = 10 * 1024 * 1024  # 10 MB guard against gzip bombs

_VALID_BEHAVIORS = frozenset({"normal", "error"})


async def _read_json(request: Request) -> dict[str, Any]:
    """Read JSON from request, handling gzip-encoded bodies.

    The Segment Python SDK sends gzip-compressed payloads by default.
    """
    body = await request.body()
    if len(body) > _MAX_BODY_SIZE:
        msg = f"Request body too large: {len(body)} bytes"
        raise ValueError(msg)
    if request.headers.get("content-encoding") == "gzip":
        body = gzip.decompress(body)
        if len(body) > _MAX_BODY_SIZE:
            msg = f"Decompressed body too large: {len(body)} bytes"
            raise ValueError(msg)
    result: dict[str, Any] = json.loads(body)
    return result


class _State:
    """Mutable server state container (avoids module-level global statements)."""

    def __init__(self) -> None:
        self.captured_events: list[dict[str, Any]] = []
        self.lock = threading.Lock()
        self.behavior: str = "normal"


_state = _State()


@app.post("/v1/batch")
async def segment_batch(request: Request) -> JSONResponse:
    """Accept Segment batch API requests and store individual events."""
    if _state.behavior == "error":
        return JSONResponse(
            {"success": False, "error": "simulated failure"},
            status_code=500,
        )

    body = await _read_json(request)
    with _state.lock:
        for event in body.get("batch", []):
            event["_delivery_method"] = "batch"
            _state.captured_events.append(event)
    return JSONResponse({"success": True})


@app.post("/v1/track")
async def segment_track(request: Request) -> JSONResponse:
    """Accept Segment single-track API requests and store the event."""
    if _state.behavior == "error":
        return JSONResponse(
            {"success": False, "error": "simulated failure"},
            status_code=500,
        )

    body = await _read_json(request)
    with _state.lock:
        body["_delivery_method"] = "track"
        _state.captured_events.append(body)
    return JSONResponse({"success": True})


@app.get("/captured-events")
async def get_captured_events(
    event_type: str | None = None,
    request_id: str | None = None,
) -> JSONResponse:
    """Return captured events, optionally filtered by event name and/or request_id."""
    with _state.lock:
        events = list(_state.captured_events)
    if event_type:
        events = [e for e in events if e.get("event") == event_type]
    if request_id:
        events = [e for e in events if e.get("properties", {}).get("request_id") == request_id]
    return JSONResponse(events)


@app.delete("/captured-events")
async def clear_captured_events() -> JSONResponse:
    """Clear all captured events."""
    with _state.lock:
        _state.captured_events.clear()
    return JSONResponse({"cleared": True})


@app.post("/test/set-behavior")
async def set_behavior(request: Request) -> JSONResponse:
    """Switch mock behavior: 'normal' (default) or 'error' (returns 500)."""
    body = await _read_json(request)
    mode = body.get("mode", "normal")
    if mode not in _VALID_BEHAVIORS:
        return JSONResponse(
            {"error": f"Invalid mode '{mode}'. Valid: {sorted(_VALID_BEHAVIORS)}"},
            status_code=400,
        )
    _state.behavior = mode
    return JSONResponse({"behavior": _state.behavior})


@app.get("/health")
async def health() -> JSONResponse:
    """Health check for readiness probes."""
    return JSONResponse({"status": "ok"})


def run_server(port: int = 9999) -> None:
    """Run the mock Segment server."""
    host = os.environ.get("SEGMENT_SERVER_HOST", "127.0.0.1")
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    run_server()
