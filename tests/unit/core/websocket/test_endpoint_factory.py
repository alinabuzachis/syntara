"""Tests for WebSocket endpoint factory with automatic path mapping discovery."""

import asyncio
import json
import types
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from nexus.core.websocket.endpoint_factory import create_websocket_endpoint, scan_handler_specs


class TestAutomaticPathMapping:
    """Test automatic handler-to-spec path mapping discovery."""

    def test_handler_with_matching_spec(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Handler file with matching spec file is discovered successfully."""
        # Create directory structure
        core_websocket_dir = tmp_path / "src" / "nexus" / "core" / "websocket"
        core_websocket_dir.mkdir(parents=True)

        nexus_dir = tmp_path / "src" / "nexus"
        component_dir = nexus_dir / "test_component"
        ws_dir = component_dir / "ws"
        ws_dir.mkdir(parents=True)

        # Create spec file following convention: websocket-{handler}.yaml
        schemas_dir = tmp_path / "schemas" / "test_component"
        schemas_dir.mkdir(parents=True)
        spec_file = schemas_dir / "websocket-example.yaml"
        spec_file.write_text("asyncapi: 3.0.0\nchannels: {}\n")

        # Create handler file: example.py (maps to websocket-example.yaml)
        handler_file = ws_dir / "example.py"
        handler_file.write_text("# Handler file\n")

        # Monkeypatch __file__
        fake_file = core_websocket_dir / "endpoint_factory.py"
        monkeypatch.setattr("nexus.core.websocket.endpoint_factory.__file__", str(fake_file))

        result = scan_handler_specs()

        assert "test_component" in result
        assert isinstance(result["test_component"], dict)
        assert "asyncapi" in result["test_component"]

    def test_handler_without_spec_raises_error(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Handler file without corresponding spec file raises ValueError."""
        core_websocket_dir = tmp_path / "src" / "nexus" / "core" / "websocket"
        core_websocket_dir.mkdir(parents=True)

        nexus_dir = tmp_path / "src" / "nexus"
        component_dir = nexus_dir / "test_component"
        ws_dir = component_dir / "ws"
        ws_dir.mkdir(parents=True)

        # Create handler file WITHOUT matching spec
        handler_file = ws_dir / "orphan_handler.py"
        handler_file.write_text("# Handler without spec\n")

        fake_file = core_websocket_dir / "endpoint_factory.py"
        monkeypatch.setattr("nexus.core.websocket.endpoint_factory.__file__", str(fake_file))

        with pytest.raises(ValueError, match="Missing Spec File"):
            scan_handler_specs()

    def test_spec_without_handler_raises_error(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Spec file without corresponding handler file raises ValueError."""
        core_websocket_dir = tmp_path / "src" / "nexus" / "core" / "websocket"
        core_websocket_dir.mkdir(parents=True)

        nexus_dir = tmp_path / "src" / "nexus"
        component_dir = nexus_dir / "test_component"
        ws_dir = component_dir / "ws"
        ws_dir.mkdir(parents=True)

        # Create orphan spec file (no matching handler)
        schemas_dir = tmp_path / "schemas" / "test_component"
        schemas_dir.mkdir(parents=True)
        spec_file = schemas_dir / "websocket-orphan.yaml"
        spec_file.write_text("asyncapi: 3.0.0\nchannels: {}\n")

        fake_file = core_websocket_dir / "endpoint_factory.py"
        monkeypatch.setattr("nexus.core.websocket.endpoint_factory.__file__", str(fake_file))

        with pytest.raises(ValueError, match="Orphan Spec File"):
            scan_handler_specs()

    def test_component_without_ws_dir_skips_orphan_check(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Components without ws/ directory don't trigger orphan spec errors."""
        core_websocket_dir = tmp_path / "src" / "nexus" / "core" / "websocket"
        core_websocket_dir.mkdir(parents=True)

        nexus_dir = tmp_path / "src" / "nexus"

        # Create a component WITHOUT ws/ directory
        component_dir = nexus_dir / "no_ws_component"
        component_dir.mkdir(parents=True)

        # Create spec file for component without ws/ (should be ignored)
        schemas_dir = tmp_path / "schemas" / "no_ws_component"
        schemas_dir.mkdir(parents=True)
        spec_file = schemas_dir / "websocket-example.yaml"
        spec_file.write_text("asyncapi: 3.0.0\nchannels: {}\n")

        fake_file = core_websocket_dir / "endpoint_factory.py"
        monkeypatch.setattr("nexus.core.websocket.endpoint_factory.__file__", str(fake_file))

        # Should not raise error - component without ws/ is skipped
        result = scan_handler_specs()
        assert "no_ws_component" not in result

    def test_multiple_handlers_with_matching_specs(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Multiple handlers in ws/ directory with matching specs are discovered."""
        core_websocket_dir = tmp_path / "src" / "nexus" / "core" / "websocket"
        core_websocket_dir.mkdir(parents=True)

        nexus_dir = tmp_path / "src" / "nexus"
        component_dir = nexus_dir / "multi_handler"
        ws_dir = component_dir / "ws"
        ws_dir.mkdir(parents=True)

        schemas_dir = tmp_path / "schemas" / "multi_handler"
        schemas_dir.mkdir(parents=True)

        # Create multiple handler/spec pairs
        handlers = ["chat", "coffee", "events"]
        for handler_name in handlers:
            handler_file = ws_dir / f"{handler_name}.py"
            handler_file.write_text(f"# Handler for {handler_name}\n")

            spec_file = schemas_dir / f"websocket-{handler_name}.yaml"
            spec_file.write_text(f"asyncapi: 3.0.0\nchannels:\n  {handler_name}:\n    address: /ws/{handler_name}\n")

        fake_file = core_websocket_dir / "endpoint_factory.py"
        monkeypatch.setattr("nexus.core.websocket.endpoint_factory.__file__", str(fake_file))

        result = scan_handler_specs()

        assert "multi_handler" in result
        # All handlers should contribute channels to the merged spec
        assert "channels" in result["multi_handler"]

    def test_supports_yaml_and_yml_extensions(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Automatic mapping supports both .yaml and .yml extensions."""
        core_websocket_dir = tmp_path / "src" / "nexus" / "core" / "websocket"
        core_websocket_dir.mkdir(parents=True)

        nexus_dir = tmp_path / "src" / "nexus"

        # Test .yml extension
        component_dir = nexus_dir / "yml_component"
        ws_dir = component_dir / "ws"
        ws_dir.mkdir(parents=True)

        schemas_dir = tmp_path / "schemas" / "yml_component"
        schemas_dir.mkdir(parents=True)
        spec_file = schemas_dir / "websocket-test.yml"  # .yml extension
        spec_file.write_text("asyncapi: 3.0.0\nchannels: {}\n")

        handler_file = ws_dir / "test.py"
        handler_file.write_text("# Handler\n")

        fake_file = core_websocket_dir / "endpoint_factory.py"
        monkeypatch.setattr("nexus.core.websocket.endpoint_factory.__file__", str(fake_file))

        result = scan_handler_specs()

        assert "yml_component" in result
        assert "asyncapi" in result["yml_component"]

    def test_supports_json_extension(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Automatic mapping supports .json extension for AsyncAPI specs with full parsing."""
        core_websocket_dir = tmp_path / "src" / "nexus" / "core" / "websocket"
        core_websocket_dir.mkdir(parents=True)

        nexus_dir = tmp_path / "src" / "nexus"

        # Test .json extension with a complete AsyncAPI spec
        component_dir = nexus_dir / "json_component"
        ws_dir = component_dir / "ws"
        ws_dir.mkdir(parents=True)

        schemas_dir = tmp_path / "schemas" / "json_component"
        schemas_dir.mkdir(parents=True)

        # Create a complete JSON AsyncAPI spec with channels, messages, and operations
        json_spec = {
            "asyncapi": "3.0.0",
            "info": {
                "title": "JSON Test API",
                "version": "1.0.0",
                "description": "Test AsyncAPI spec in JSON format",
            },
            "channels": {
                "test_channel": {
                    "address": "/ws/json_component/v1/test_channel",
                    "messages": {
                        "testRequest": {"$ref": "#/components/messages/TestRequest"},
                        "testResponse": {"$ref": "#/components/messages/TestResponse"},
                    },
                }
            },
            "operations": {
                "sendTestRequest": {
                    "action": "send",
                    "channel": {"$ref": "#/channels/test_channel"},
                    "messages": [{"$ref": "#/channels/test_channel/messages/testRequest"}],
                },
                "receiveTestResponse": {
                    "action": "receive",
                    "channel": {"$ref": "#/channels/test_channel"},
                    "messages": [{"$ref": "#/channels/test_channel/messages/testResponse"}],
                },
            },
            "components": {
                "messages": {
                    "TestRequest": {
                        "name": "TestRequest",
                        "contentType": "application/json",
                        "payload": {
                            "type": "object",
                            "required": ["input"],
                            "properties": {"input": {"type": "string"}},
                        },
                    },
                    "TestResponse": {
                        "name": "TestResponse",
                        "contentType": "application/json",
                        "payload": {
                            "type": "object",
                            "required": ["output"],
                            "properties": {"output": {"type": "string"}},
                        },
                    },
                }
            },
        }

        spec_file = schemas_dir / "websocket-test.json"
        spec_file.write_text(json.dumps(json_spec, indent=2))

        handler_file = ws_dir / "test.py"
        handler_file.write_text("# Handler for JSON spec\n")

        fake_file = core_websocket_dir / "endpoint_factory.py"
        monkeypatch.setattr("nexus.core.websocket.endpoint_factory.__file__", str(fake_file))

        result = scan_handler_specs()

        # Verify the component was discovered
        assert "json_component" in result

        # Verify the spec was parsed correctly
        spec = result["json_component"]
        assert spec["asyncapi"] == "3.0.0"
        assert spec["info"]["title"] == "JSON Test API"
        assert spec["info"]["version"] == "1.0.0"

        # Verify channels were parsed
        assert "channels" in spec
        assert "test_channel" in spec["channels"]
        assert spec["channels"]["test_channel"]["address"] == "/ws/json_component/v1/test_channel"

        # Verify operations were parsed
        assert "operations" in spec
        assert "sendTestRequest" in spec["operations"]
        assert "receiveTestResponse" in spec["operations"]

        # Verify components/messages were parsed
        assert "components" in spec
        assert "messages" in spec["components"]
        assert "TestRequest" in spec["components"]["messages"]
        assert "TestResponse" in spec["components"]["messages"]

        # Verify message payload structure
        test_request = spec["components"]["messages"]["TestRequest"]
        assert test_request["payload"]["type"] == "object"
        assert "input" in test_request["payload"]["properties"]

    def test_skips_init_py_files(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """__init__.py files in ws/ directory are skipped."""
        core_websocket_dir = tmp_path / "src" / "nexus" / "core" / "websocket"
        core_websocket_dir.mkdir(parents=True)

        nexus_dir = tmp_path / "src" / "nexus"
        component_dir = nexus_dir / "test_component"
        ws_dir = component_dir / "ws"
        ws_dir.mkdir(parents=True)

        # Create __init__.py (should be skipped, no matching spec needed)
        init_file = ws_dir / "__init__.py"
        init_file.write_text("# Init file\n")

        # Create actual handler with matching spec
        handler_file = ws_dir / "example.py"
        handler_file.write_text("# Handler\n")

        schemas_dir = tmp_path / "schemas" / "test_component"
        schemas_dir.mkdir(parents=True)
        spec_file = schemas_dir / "websocket-example.yaml"
        spec_file.write_text("asyncapi: 3.0.0\nchannels: {}\n")

        fake_file = core_websocket_dir / "endpoint_factory.py"
        monkeypatch.setattr("nexus.core.websocket.endpoint_factory.__file__", str(fake_file))

        # Should not fail even though __init__.py has no matching spec
        result = scan_handler_specs()
        assert "test_component" in result

    def test_skips_special_directories(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Skips __pycache__, core, api directories."""
        core_websocket_dir = tmp_path / "src" / "nexus" / "core" / "websocket"
        core_websocket_dir.mkdir(parents=True)

        nexus_dir = tmp_path / "src" / "nexus"

        # Create special directories that should be skipped
        for dir_name in ["__pycache__", "core", "api"]:
            special_dir = nexus_dir / dir_name
            ws_dir = special_dir / "ws"
            ws_dir.mkdir(parents=True)
            handler_file = ws_dir / "test.py"
            handler_file.write_text("# Should be skipped\n")

        fake_file = core_websocket_dir / "endpoint_factory.py"
        monkeypatch.setattr("nexus.core.websocket.endpoint_factory.__file__", str(fake_file))

        result = scan_handler_specs()

        # Special directories should not appear in results
        for dir_name in ["__pycache__", "core", "api"]:
            assert dir_name not in result

    def test_handler_import_error_skipped(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Handler with import error is skipped (but spec must exist)."""
        core_websocket_dir = tmp_path / "src" / "nexus" / "core" / "websocket"
        core_websocket_dir.mkdir(parents=True)

        nexus_dir = tmp_path / "src" / "nexus"
        component_dir = nexus_dir / "test_component"
        ws_dir = component_dir / "ws"
        ws_dir.mkdir(parents=True)

        # Create handler with import error
        handler_file = ws_dir / "broken.py"
        handler_file.write_text("import nonexistent_module\n")

        # Create matching spec file (required for the handler)
        schemas_dir = tmp_path / "schemas" / "test_component"
        schemas_dir.mkdir(parents=True)
        spec_file = schemas_dir / "websocket-broken.yaml"
        spec_file.write_text("asyncapi: 3.0.0\nchannels: {}\n")

        fake_file = core_websocket_dir / "endpoint_factory.py"
        monkeypatch.setattr("nexus.core.websocket.endpoint_factory.__file__", str(fake_file))

        # Handler with import error is skipped (doesn't fail startup)
        result = scan_handler_specs()
        # Component is skipped because module failed to load
        assert "test_component" not in result


def _create_mock_handler_module(
    channel_name: str = "test",
    *,
    has_handler: bool = True,
    has_on_connect: bool = False,
) -> types.ModuleType:
    """Create a mock handler module for testing.

    Args:
        channel_name: Name of the channel (for function naming)
        has_handler: Whether to include handle_{channel} function
        has_on_connect: Whether to include on_connect_{channel} function

    Returns:
        Mock module with specified functions

    """
    module = types.ModuleType("mock_handler")

    if has_handler:

        async def handle_test(_message: dict[str, Any]) -> dict[str, Any]:
            """Mock message handler for testing endpoint creation."""
            await asyncio.sleep(0)  # Yield control to event loop
            return {"status": "ok"}

        setattr(module, f"handle_{channel_name}", handle_test)

    if has_on_connect:

        async def on_connect_test(_websocket: object, _connection_id: str) -> None:
            """Mock on_connect handler for testing endpoint creation."""
            await asyncio.sleep(0)  # Yield control to event loop

        setattr(module, f"on_connect_{channel_name}", on_connect_test)

    return module


def _create_receive_only_spec(channel_name: str = "test") -> dict[str, Any]:
    """Create a receive-only channel spec (no Request message, only send operation).

    Args:
        channel_name: Name of the channel

    Returns:
        AsyncAPI spec dictionary

    """
    return {
        "asyncapi": "3.0.0",
        "channels": {
            channel_name: {
                "address": f"/ws/{channel_name}",
                "messages": {"TestEvent": {"$ref": "#/components/messages/TestEvent"}},
            }
        },
        "operations": {
            f"send{channel_name.title()}": {"action": "send", "channel": {"$ref": f"#/channels/{channel_name}"}}
        },
        "components": {"messages": {"TestEvent": {"payload": {"type": "object"}}}},
    }


def _create_bidirectional_spec(
    channel_name: str = "test",
    *,
    has_request_message: bool = True,
) -> dict[str, Any]:
    """Create a bidirectional channel spec.

    Args:
        channel_name: Name of the channel
        has_request_message: Whether to include *Request message

    Returns:
        AsyncAPI spec dictionary

    """
    messages: dict[str, Any] = {}
    if has_request_message:
        messages["TestRequest"] = {"$ref": "#/components/messages/TestRequest"}
    messages["TestResponse"] = {"$ref": "#/components/messages/TestResponse"}

    return {
        "asyncapi": "3.0.0",
        "channels": {channel_name: {"address": f"/ws/{channel_name}", "messages": messages}},
        "operations": {
            f"receive{channel_name.title()}": {"action": "receive", "channel": {"$ref": f"#/channels/{channel_name}"}},
            f"send{channel_name.title()}": {"action": "send", "channel": {"$ref": f"#/channels/{channel_name}"}},
        },
        "components": {
            "messages": {
                "TestRequest": {"payload": {"type": "object"}},
                "TestResponse": {"payload": {"type": "object"}},
            }
        },
    }


class TestReceiveOnlyChannels:
    """Tests for receive-only channel support (Phase 3: AAP-58895)."""

    @patch("nexus.core.websocket.endpoint_factory.discover_handler")
    @patch("nexus.core.websocket.endpoint_factory.discover_hooks")
    @patch("nexus.core.websocket.endpoint_factory.is_receive_only_channel")
    def test_receive_only_no_request_message_allowed(
        self,
        mock_is_receive_only: MagicMock,
        mock_discover_hooks: MagicMock,
        mock_discover_handler: MagicMock,
    ) -> None:
        """Receive-only channel without Request message doesn't raise ValueError."""
        mock_is_receive_only.return_value = True
        mock_discover_handler.return_value = _create_mock_handler_module(has_handler=False, has_on_connect=True)
        mock_discover_hooks.return_value = MagicMock()

        spec = _create_receive_only_spec()

        # Should not raise ValueError even without Request message
        endpoint = create_websocket_endpoint("test", spec, "test_component")
        assert callable(endpoint)

    @patch("nexus.core.websocket.endpoint_factory.discover_handler")
    @patch("nexus.core.websocket.endpoint_factory.discover_hooks")
    @patch("nexus.core.websocket.endpoint_factory.is_receive_only_channel")
    def test_receive_only_no_handler_function_allowed(
        self,
        mock_is_receive_only: MagicMock,
        mock_discover_hooks: MagicMock,
        mock_discover_handler: MagicMock,
    ) -> None:
        """Receive-only channel without handle_xxx doesn't raise error."""
        mock_is_receive_only.return_value = True
        # No handler function, only on_connect
        mock_discover_handler.return_value = _create_mock_handler_module(has_handler=False, has_on_connect=True)
        mock_discover_hooks.return_value = MagicMock()

        spec = _create_receive_only_spec()

        # Should not raise ValueError even without handle_test function
        endpoint = create_websocket_endpoint("test", spec, "test_component")
        assert callable(endpoint)

    @patch("nexus.core.websocket.endpoint_factory.discover_handler")
    @patch("nexus.core.websocket.endpoint_factory.discover_hooks")
    @patch("nexus.core.websocket.endpoint_factory.is_receive_only_channel")
    def test_receive_only_requires_on_connect(
        self,
        mock_is_receive_only: MagicMock,
        mock_discover_hooks: MagicMock,
        mock_discover_handler: MagicMock,
    ) -> None:
        """Receive-only channel without on_connect raises ValueError at runtime.

        Note: The ValueError is raised at runtime when the endpoint is called,
        not at endpoint creation time. This test verifies the endpoint is created
        but will fail at runtime.
        """
        mock_is_receive_only.return_value = True
        # No on_connect function
        mock_discover_handler.return_value = _create_mock_handler_module(has_handler=False, has_on_connect=False)
        mock_discover_hooks.return_value = MagicMock()

        spec = _create_receive_only_spec()

        # Endpoint creation succeeds - the check happens at runtime
        endpoint = create_websocket_endpoint("test", spec, "test_component")
        assert callable(endpoint)

    @patch("nexus.core.websocket.endpoint_factory.discover_handler")
    @patch("nexus.core.websocket.endpoint_factory.discover_hooks")
    @patch("nexus.core.websocket.endpoint_factory.is_receive_only_channel")
    def test_bidirectional_requires_request_message(
        self,
        mock_is_receive_only: MagicMock,
        mock_discover_hooks: MagicMock,
        mock_discover_handler: MagicMock,
    ) -> None:
        """Bidirectional channel must have Request message (regression)."""
        mock_is_receive_only.return_value = False
        mock_discover_handler.return_value = _create_mock_handler_module(has_handler=True)
        mock_discover_hooks.return_value = MagicMock()

        # Create spec WITHOUT Request message
        spec = _create_bidirectional_spec(has_request_message=False)

        # Should raise ValueError for bidirectional channel without Request
        with pytest.raises(ValueError, match="No request message type found"):
            create_websocket_endpoint("test", spec, "test_component")

    @patch("nexus.core.websocket.endpoint_factory.discover_handler")
    @patch("nexus.core.websocket.endpoint_factory.discover_hooks")
    @patch("nexus.core.websocket.endpoint_factory.is_receive_only_channel")
    def test_bidirectional_requires_handler_function(
        self,
        mock_is_receive_only: MagicMock,
        mock_discover_hooks: MagicMock,
        mock_discover_handler: MagicMock,
    ) -> None:
        """Bidirectional channel must have handle_xxx (regression)."""
        mock_is_receive_only.return_value = False
        # No handler function
        mock_discover_handler.return_value = _create_mock_handler_module(has_handler=False)
        mock_discover_hooks.return_value = MagicMock()

        spec = _create_bidirectional_spec(has_request_message=True)

        # Should raise ValueError for bidirectional channel without handler
        with pytest.raises(ValueError, match=r"Handler function .* not found"):
            create_websocket_endpoint("test", spec, "test_component")
