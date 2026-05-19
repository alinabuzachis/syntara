"""Integration tests for components with multiple handler files.

This module tests the full flow of a component split across multiple
handler files (ws/*.py), ensuring:
- File discovery and spec merging
- Channel-to-module mapping in cache
- Validation per module
- WebSocket endpoint creation and execution
"""

import sys
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

from nexus.core.websocket.endpoint_factory import _HANDLER_MODULE_CACHE, scan_handler_specs
from nexus.core.websocket.interceptor import ValidationInterceptor
from nexus.core.websocket.router import build_websocket_router


@pytest.fixture
def multi_module_component(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Generator[tuple[Path, FastAPI], None, None]:
    """Create a test component with multiple handler files and return FastAPI app.

    Creates:
        component/ws/handlers1.py - chat, coffee channels
        component/ws/handlers2.py - events channel

    Returns:
        Tuple of (project_root, configured FastAPI app)

    """
    # Create directory structure
    project_root = tmp_path / "project"
    nexus_dir = project_root / "src" / "nexus"
    core_dir = nexus_dir / "core" / "websocket"
    core_dir.mkdir(parents=True)

    component_dir = nexus_dir / "testcomp"
    ws_dir = component_dir / "ws"
    ws_dir.mkdir(parents=True)

    schemas_dir = nexus_dir / "schemas" / "testcomp"
    schemas_dir.mkdir(parents=True)

    # Create __init__.py files
    (nexus_dir / "__init__.py").touch()
    (component_dir / "__init__.py").touch()
    (ws_dir / "__init__.py").touch()
    (core_dir / "__init__.py").touch()

    # Create handlers1.py with chat and coffee channels
    handlers1_content = '''"""First handler file with chat and coffee channels."""
from typing import Any


async def handle_chat(message: dict[str, Any], connection_id: str) -> dict[str, Any]:
    """Handle chat messages - returns uppercase."""
    return {
        "reply": message["message"].upper(),
        "type": "echo",
        "handler": "handlers1",
    }


async def handle_coffee(message: dict[str, Any], connection_id: str) -> dict[str, Any]:
    """Handle coffee requests - returns coffee word."""
    return {
        "output": "espresso",
        "handler": "handlers1",
    }
'''
    (ws_dir / "handlers1.py").write_text(handlers1_content)

    # Create handlers2.py with events channel
    handlers2_content = '''"""Second handler file with events channel."""
from typing import Any


async def handle_events(message: dict[str, Any], connection_id: str) -> dict[str, Any]:
    """Handle event subscription requests."""
    return {
        "status": "subscribed",
        "group": message["group"],
        "handler": "handlers2",
    }
'''
    (ws_dir / "handlers2.py").write_text(handlers2_content)

    # Create AsyncAPI specs for handlers1 (chat + coffee)
    handlers1_spec = """---
asyncapi: 3.0.0
info:
  title: Test Component Handlers 1
  version: 1.0.0
channels:
  chat:
    address: /ws/testcomp/v1/chat
    messages:
      chatRequest:
        $ref: '#/components/messages/ChatRequest'
      chatResponse:
        $ref: '#/components/messages/ChatResponse'
  coffee:
    address: /ws/testcomp/v1/coffee
    messages:
      coffeeRequest:
        $ref: '#/components/messages/CoffeeRequest'
      coffeeResponse:
        $ref: '#/components/messages/CoffeeResponse'
operations:
  sendChatRequest:
    action: send
    channel:
      $ref: '#/channels/chat'
    messages:
      - $ref: '#/channels/chat/messages/chatRequest'
  receiveChatResponse:
    action: receive
    channel:
      $ref: '#/channels/chat'
    messages:
      - $ref: '#/channels/chat/messages/chatResponse'
  sendCoffeeRequest:
    action: send
    channel:
      $ref: '#/channels/coffee'
    messages:
      - $ref: '#/channels/coffee/messages/coffeeRequest'
  receiveCoffeeResponse:
    action: receive
    channel:
      $ref: '#/channels/coffee'
    messages:
      - $ref: '#/channels/coffee/messages/coffeeResponse'
components:
  messages:
    ChatRequest:
      contentType: application/json
      payload:
        type: object
        required:
          - message
        properties:
          message:
            type: string
    ChatResponse:
      contentType: application/json
      payload:
        type: object
        required:
          - reply
          - type
        properties:
          reply:
            type: string
          type:
            type: string
          handler:
            type: string
    CoffeeRequest:
      contentType: application/json
      payload:
        type: object
        required:
          - input
        properties:
          input:
            type: string
    CoffeeResponse:
      contentType: application/json
      payload:
        type: object
        required:
          - output
        properties:
          output:
            type: string
          handler:
            type: string
"""
    (schemas_dir / "websocket-handlers1.yaml").write_text(handlers1_spec)

    # Create AsyncAPI spec for handlers2 (events)
    handlers2_spec = """---
asyncapi: 3.0.0
info:
  title: Test Component Handlers 2
  version: 1.0.0
channels:
  events:
    address: /ws/testcomp/v1/events
    messages:
      eventsRequest:
        $ref: '#/components/messages/EventsRequest'
      eventsResponse:
        $ref: '#/components/messages/EventsResponse'
operations:
  sendEventsRequest:
    action: send
    channel:
      $ref: '#/channels/events'
    messages:
      - $ref: '#/channels/events/messages/eventsRequest'
  receiveEventsResponse:
    action: receive
    channel:
      $ref: '#/channels/events'
    messages:
      - $ref: '#/channels/events/messages/eventsResponse'
components:
  messages:
    EventsRequest:
      contentType: application/json
      payload:
        type: object
        required:
          - group
        properties:
          group:
            type: string
    EventsResponse:
      contentType: application/json
      payload:
        type: object
        required:
          - status
          - group
        properties:
          status:
            type: string
          group:
            type: string
          handler:
            type: string
"""
    (schemas_dir / "websocket-handlers2.yaml").write_text(handlers2_spec)

    # Add project to Python path
    sys.path.insert(0, str(nexus_dir.parent))

    # Mock __file__ to point to our temporary structure
    fake_endpoint_factory = core_dir / "endpoint_factory.py"
    fake_endpoint_factory.touch()
    monkeypatch.setattr(
        "nexus.core.websocket.endpoint_factory.__file__",
        str(fake_endpoint_factory),
    )

    # Mock importlib.resources.files to return our temp schemas directory
    def mock_files(package: str) -> Path:
        if package == "nexus":
            return nexus_dir
        msg = f"Package {package} not found"
        raise FileNotFoundError(msg)

    monkeypatch.setattr("nexus.core.websocket.endpoint_factory.files", mock_files)

    # Create FastAPI app
    app = FastAPI()
    router = build_websocket_router()
    app.include_router(router)

    yield project_root, app

    # Cleanup
    sys.path.remove(str(nexus_dir.parent))


class TestMultiModuleComponent:
    """Integration tests for multi-module component support."""

    def test_scan_discovers_all_files(self, multi_module_component: tuple[Path, FastAPI]) -> None:
        """Test that scan_handler_specs discovers all handler files."""
        _ = multi_module_component
        specs = scan_handler_specs()

        assert "testcomp" in specs
        spec = specs["testcomp"]

        # Should have all 3 channels from both files
        assert "channels" in spec
        channels = spec["channels"]
        assert "chat" in channels
        assert "coffee" in channels
        assert "events" in channels

    def test_cache_maps_channels_to_modules(self, multi_module_component: tuple[Path, FastAPI]) -> None:
        """Test that _HANDLER_MODULE_CACHE correctly maps channels to their modules."""
        _ = multi_module_component
        scan_handler_specs()

        assert "testcomp" in _HANDLER_MODULE_CACHE
        channel_modules = _HANDLER_MODULE_CACHE["testcomp"]

        # All channels should be cached
        assert "chat" in channel_modules
        assert "coffee" in channel_modules
        assert "events" in channel_modules

        # Chat and coffee should share same module (handlers1)
        assert channel_modules["chat"] == channel_modules["coffee"]

        # Events should have different module (handlers2)
        assert channel_modules["events"] != channel_modules["chat"]

        # Module names should be correct
        assert "handlers1" in channel_modules["chat"].__name__
        assert "handlers2" in channel_modules["events"].__name__

    def test_endpoints_created_for_all_channels(self, multi_module_component: tuple[Path, FastAPI]) -> None:
        """Test that WebSocket endpoints are created for all channels."""
        _, app = multi_module_component

        # Check that routes were registered
        routes = [route for route in app.routes if hasattr(route, "path")]
        websocket_paths = {route.path for route in routes}

        assert "/ws/testcomp/v1/chat" in websocket_paths
        assert "/ws/testcomp/v1/coffee" in websocket_paths
        assert "/ws/testcomp/v1/events" in websocket_paths

    def test_chat_endpoint_uses_handlers1(self, multi_module_component: tuple[Path, FastAPI]) -> None:
        """Test that chat endpoint uses handler from handlers1.py."""
        _, app = multi_module_component

        with TestClient(app) as client, client.websocket_connect("/ws/testcomp/v1/chat") as websocket:
            # Send chat message
            websocket.send_json({"message": "hello"})

            # Receive response
            response = websocket.receive_json()

            # Verify response from handlers1
            assert response["reply"] == "HELLO"
            assert response["type"] == "echo"
            assert response["handler"] == "handlers1"

    def test_coffee_endpoint_uses_handlers1(self, multi_module_component: tuple[Path, FastAPI]) -> None:
        """Test that coffee endpoint uses handler from handlers1.py."""
        _, app = multi_module_component

        with TestClient(app) as client, client.websocket_connect("/ws/testcomp/v1/coffee") as websocket:
            # Send coffee request
            websocket.send_json({"input": "hi"})

            # Receive response
            response = websocket.receive_json()

            # Verify response from handlers1
            assert response["output"] == "espresso"
            assert response["handler"] == "handlers1"

    def test_events_endpoint_uses_handlers2(self, multi_module_component: tuple[Path, FastAPI]) -> None:
        """Test that events endpoint uses handler from handlers2.py."""
        _, app = multi_module_component

        with TestClient(app) as client, client.websocket_connect("/ws/testcomp/v1/events") as websocket:
            # Send events request
            websocket.send_json({"group": "log"})

            # Receive response
            response = websocket.receive_json()

            # Verify response from handlers2
            assert response["status"] == "subscribed"
            assert response["group"] == "log"
            assert response["handler"] == "handlers2"

    def test_validation_succeeds_for_multi_module(self, multi_module_component: tuple[Path, FastAPI]) -> None:
        """Test that ValidationInterceptor validates each module correctly."""
        _ = multi_module_component
        specs = scan_handler_specs()
        interceptor = ValidationInterceptor()

        # Simulate bootstrap process
        interceptor.on_bootstrap_start(specs)

        # Simulate endpoint creation for each channel
        for channel_name in ["chat", "coffee", "events"]:
            interceptor.before_endpoint_creation("testcomp", channel_name, {})

        # Run validation
        interceptor.on_bootstrap_complete({"total_endpoints": 3})

        # Validation should succeed - verify no errors
        assert len(interceptor.validation_results) > 0
        assert all(result.is_valid for result in interceptor.validation_results)

    def test_all_endpoints_work_concurrently(self, multi_module_component: tuple[Path, FastAPI]) -> None:
        """Test that all endpoints from different modules work concurrently."""
        _, app = multi_module_component

        with (
            TestClient(app) as client,
            client.websocket_connect("/ws/testcomp/v1/chat") as ws_chat,
            client.websocket_connect("/ws/testcomp/v1/coffee") as ws_coffee,
            client.websocket_connect("/ws/testcomp/v1/events") as ws_events,
        ):
            # Send messages to all endpoints
            ws_chat.send_json({"message": "test"})
            ws_coffee.send_json({"input": "hi"})
            ws_events.send_json({"group": "progress"})

            # Receive responses - order doesn't matter
            chat_resp = ws_chat.receive_json()
            coffee_resp = ws_coffee.receive_json()
            events_resp = ws_events.receive_json()

            # Verify each endpoint used correct handler
            assert chat_resp["handler"] == "handlers1"
            assert coffee_resp["handler"] == "handlers1"
            assert events_resp["handler"] == "handlers2"

            # Verify each response is correct
            assert chat_resp["reply"] == "TEST"
            assert coffee_resp["output"] == "espresso"
            assert events_resp["status"] == "subscribed"
