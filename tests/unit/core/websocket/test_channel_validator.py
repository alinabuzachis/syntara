"""Tests for WebSocket channel validator."""

import types

from nexus.core.websocket.channel_validator import (
    ChannelValidationResult,
    check_missing_handlers,
    check_orphaned_handlers,
    get_handler_function_names,
    is_snake_case,
    normalize_channel_name,
    validate_channel_addresses,
    validate_channel_mappings,
    validate_naming_convention,
)


class TestNormalizeChannelName:
    """Tests for normalize_channel_name function."""

    def test_kebab_case_to_snake_case(self) -> None:
        """Test converting kebab-case to snake_case."""
        assert normalize_channel_name("agent-events") == "agent_events"
        assert normalize_channel_name("my-complex-name") == "my_complex_name"

    def test_already_snake_case(self) -> None:
        """Test names already in snake_case."""
        assert normalize_channel_name("coffee") == "coffee"
        assert normalize_channel_name("agent_events") == "agent_events"

    def test_multiple_hyphens(self) -> None:
        """Test names with multiple hyphens."""
        assert normalize_channel_name("one-two-three-four") == "one_two_three_four"


class TestIsSnakeCase:
    """Tests for is_snake_case function."""

    def test_valid_snake_case(self) -> None:
        """Test valid snake_case names."""
        assert is_snake_case("coffee") is True
        assert is_snake_case("agent_events") is True
        assert is_snake_case("my_channel_name") is True

    def test_invalid_kebab_case(self) -> None:
        """Test kebab-case is not snake_case."""
        assert is_snake_case("agent-events") is False
        assert is_snake_case("my-channel") is False

    def test_invalid_camel_case(self) -> None:
        """Test camelCase is not snake_case."""
        assert is_snake_case("agentEvents") is False
        assert is_snake_case("MyChannel") is False

    def test_edge_cases(self) -> None:
        """Test edge cases."""
        assert is_snake_case("a") is True
        assert is_snake_case("a1") is True
        assert is_snake_case("a_1") is True
        assert is_snake_case("_invalid") is False  # Can't start with underscore
        assert is_snake_case("1invalid") is False  # Can't start with number


class TestGetHandlerFunctionNames:
    """Tests for get_handler_function_names function."""

    def test_empty_module(self) -> None:
        """Test module with no handler functions."""
        module = types.ModuleType("test_module")

        result = get_handler_function_names(module)

        assert result == {"handlers": [], "on_connect": []}

    def test_module_with_handlers(self) -> None:
        """Test module with handler functions."""
        module = types.ModuleType("test_module")

        async def handle_coffee(message: dict[str, object]) -> dict[str, object]:
            return {}

        async def handle_chat(message: dict[str, object]) -> dict[str, object]:
            return {}

        module.handle_coffee = handle_coffee  # type: ignore[attr-defined]
        module.handle_chat = handle_chat  # type: ignore[attr-defined]

        result = get_handler_function_names(module)

        assert set(result["handlers"]) == {"coffee", "chat"}
        assert result["on_connect"] == []

    def test_module_with_on_connect(self) -> None:
        """Test module with on_connect functions."""
        module = types.ModuleType("test_module")

        async def on_connect_chat(websocket, connection_id: str) -> None:
            pass

        async def on_connect_agent_events(websocket, connection_id: str) -> None:
            pass

        module.on_connect_chat = on_connect_chat  # type: ignore[attr-defined]
        module.on_connect_agent_events = on_connect_agent_events  # type: ignore[attr-defined]

        result = get_handler_function_names(module)

        assert result["handlers"] == []
        assert set(result["on_connect"]) == {"chat", "agent_events"}

    def test_module_with_both(self) -> None:
        """Test module with both handler and on_connect functions."""
        module = types.ModuleType("test_module")

        async def handle_coffee(message: dict[str, object]) -> dict[str, object]:
            return {}

        async def on_connect_chat(websocket, connection_id: str) -> None:
            pass

        module.handle_coffee = handle_coffee  # type: ignore[attr-defined]
        module.on_connect_chat = on_connect_chat  # type: ignore[attr-defined]

        result = get_handler_function_names(module)

        assert result["handlers"] == ["coffee"]
        assert result["on_connect"] == ["chat"]

    def test_module_with_non_functions(self) -> None:
        """Test module with non-function attributes."""
        module = types.ModuleType("test_module")

        async def handle_coffee(message: dict[str, object]) -> dict[str, object]:
            return {}

        module.handle_coffee = handle_coffee  # type: ignore[attr-defined]
        module.handle_invalid = "not a function"  # type: ignore[attr-defined]
        module.some_variable = 42  # type: ignore[attr-defined]

        result = get_handler_function_names(module)

        assert result["handlers"] == ["coffee"]
        assert result["on_connect"] == []


class TestChannelValidationResult:
    """Tests for ChannelValidationResult dataclass."""

    def test_initialization(self) -> None:
        """Test ChannelValidationResult initialization."""
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        assert result.component_name == "example"
        assert result.spec_path == "example.yaml"
        assert result.errors == []
        assert result.warnings == []
        assert result.channels_validated == 0
        assert result.handlers_validated == 0

    def test_is_valid_with_no_errors(self) -> None:
        """Test is_valid returns True when no errors."""
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        assert result.is_valid is True

    def test_is_valid_with_errors(self) -> None:
        """Test is_valid returns False when errors exist."""
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")
        result.errors.append("Test error")

        assert result.is_valid is False

    def test_add_error(self) -> None:
        """Test add_error method."""
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        result.add_error("Test error message")

        assert len(result.errors) == 1
        assert result.errors[0] == "Test error message"

    def test_add_warning(self) -> None:
        """Test add_warning method."""
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        result.add_warning("Test warning message")

        assert len(result.warnings) == 1
        assert result.warnings[0] == "Test warning message"


class TestValidateNamingConvention:
    """Tests for validate_naming_convention function."""

    def test_valid_snake_case_channels(self) -> None:
        """Test channels with valid snake_case names."""
        channels: dict[str, object] = {
            "coffee": {},
            "chat": {},
            "agent_events": {},
        }
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        validate_naming_convention(channels, result)

        assert len(result.errors) == 0

    def test_invalid_kebab_case_channels(self) -> None:
        """Test channels with invalid kebab-case names."""
        channels: dict[str, object] = {
            "agent-events": {},
            "my-channel": {},
        }
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        validate_naming_convention(channels, result)

        assert len(result.errors) == 2
        assert "agent-events" in result.errors[0]
        assert "agent_events" in result.errors[0]
        assert "my-channel" in result.errors[1]
        assert "my_channel" in result.errors[1]


class TestCheckMissingHandlers:
    """Tests for check_missing_handlers function."""

    def test_all_handlers_present(self) -> None:
        """Test when all channels have handlers."""
        channels: dict[str, object] = {"coffee": {}, "chat": {}}
        handler_functions: dict[str, list[str]] = {"handlers": ["coffee", "chat"], "on_connect": []}
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        check_missing_handlers(channels, handler_functions, result)

        assert len(result.warnings) == 0

    def test_missing_handler(self) -> None:
        """Test when a channel is missing its handler."""
        channels: dict[str, object] = {"coffee": {}, "chat": {}}
        handler_functions: dict[str, list[str]] = {"handlers": ["coffee"], "on_connect": []}
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        check_missing_handlers(channels, handler_functions, result)

        assert len(result.warnings) == 1
        assert "handle_chat" in result.warnings[0]
        assert "chat" in result.warnings[0]

    def test_kebab_case_channel_name(self) -> None:
        """Test missing handler detection with kebab-case channel name."""
        channels: dict[str, object] = {"agent-events": {}}
        handler_functions: dict[str, list[str]] = {"handlers": [], "on_connect": []}
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        check_missing_handlers(channels, handler_functions, result)

        assert len(result.warnings) == 1
        assert "handle_agent_events" in result.warnings[0]


class TestCheckOrphanedHandlers:
    """Tests for check_orphaned_handlers function."""

    def test_no_orphaned_handlers(self) -> None:
        """Test when all handlers have corresponding channels."""
        channels: dict[str, object] = {"coffee": {}, "chat": {}}
        handler_functions: dict[str, list[str]] = {"handlers": ["coffee", "chat"], "on_connect": ["chat"]}
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        check_orphaned_handlers(channels, handler_functions, "example", result)

        assert len(result.errors) == 0

    def test_orphaned_handler(self) -> None:
        """Test when a handler has no corresponding channel."""
        channels: dict[str, object] = {"coffee": {}}
        handler_functions: dict[str, list[str]] = {"handlers": ["coffee", "nonexistent"], "on_connect": []}
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        check_orphaned_handlers(channels, handler_functions, "example", result)

        assert len(result.errors) == 1
        assert "handle_nonexistent" in result.errors[0]
        assert "nonexistent" in result.errors[0]

    def test_orphaned_on_connect(self) -> None:
        """Test when an on_connect function has no corresponding channel."""
        channels: dict[str, object] = {"coffee": {}}
        handler_functions: dict[str, list[str]] = {"handlers": ["coffee"], "on_connect": ["coffee", "nonexistent"]}
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        check_orphaned_handlers(channels, handler_functions, "example", result)

        assert len(result.errors) == 1
        assert "on_connect_nonexistent" in result.errors[0]
        assert "nonexistent" in result.errors[0]

    def test_orphaned_both(self) -> None:
        """Test when both handler and on_connect are orphaned."""
        channels: dict[str, object] = {"coffee": {}}
        handler_functions: dict[str, list[str]] = {"handlers": ["coffee", "orphan1"], "on_connect": ["orphan2"]}
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        check_orphaned_handlers(channels, handler_functions, "example", result)

        assert len(result.errors) == 2
        assert any("handle_orphan1" in e for e in result.errors)
        assert any("on_connect_orphan2" in e for e in result.errors)


class TestValidateChannelAddresses:
    """Tests for validate_channel_addresses function."""

    def test_valid_addresses(self) -> None:
        """Test channels with valid addresses."""
        channels: dict[str, object] = {
            "coffee": {"address": "/ws/example/v1/coffee"},
            "chat": {"address": "/ws/example/v1/chat"},
        }
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        validate_channel_addresses("example", channels, result)

        assert len(result.errors) == 0

    def test_invalid_component_name(self) -> None:
        """Test channel with wrong component name in address."""
        channels: dict[str, object] = {
            "coffee": {"address": "/ws/example_test/v1/coffee"},
        }
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        validate_channel_addresses("example", channels, result)

        assert len(result.errors) == 1
        assert "coffee" in result.errors[0]
        assert "example_test" in result.errors[0]
        assert "Expected: /ws/example/v1/coffee" in result.errors[0]

    def test_invalid_channel_name(self) -> None:
        """Test channel with wrong channel name in address."""
        channels: dict[str, object] = {
            "coffee": {"address": "/ws/example/v1/tea"},
        }
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        validate_channel_addresses("example", channels, result)

        assert len(result.errors) == 1
        assert "coffee" in result.errors[0]
        assert "Expected: /ws/example/v1/coffee" in result.errors[0]
        assert "Got:      /ws/example/v1/tea" in result.errors[0]

    def test_normalized_channel_name(self) -> None:
        """Test channel with kebab-case name uses normalized version in address."""
        channels: dict[str, object] = {
            "agent_events": {"address": "/ws/example/v1/agent_events"},
        }
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        validate_channel_addresses("example", channels, result)

        assert len(result.errors) == 0

    def test_missing_address_field(self) -> None:
        """Test channel without address field."""
        channels: dict[str, object] = {
            "coffee": {},
        }
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        validate_channel_addresses("example", channels, result)

        assert len(result.errors) == 1
        assert "coffee" in result.errors[0]
        assert "missing 'address' field" in result.errors[0]

    def test_empty_address_field(self) -> None:
        """Test channel with empty address field."""
        channels: dict[str, object] = {
            "coffee": {"address": ""},
        }
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        validate_channel_addresses("example", channels, result)

        assert len(result.errors) == 1
        assert "coffee" in result.errors[0]
        assert "missing 'address' field" in result.errors[0]

    def test_multiple_invalid_addresses(self) -> None:
        """Test multiple channels with invalid addresses."""
        channels: dict[str, object] = {
            "coffee": {"address": "/ws/wrong_component/v1/coffee"},
            "chat": {"address": "/ws/example/v1/wrong_channel"},
            "tea": {"address": "/ws/example/v1/tea"},  # Valid
        }
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        validate_channel_addresses("example", channels, result)

        assert len(result.errors) == 2
        assert any("coffee" in e and "wrong_component" in e for e in result.errors)
        assert any("chat" in e and "wrong_channel" in e for e in result.errors)

    def test_wrong_version(self) -> None:
        """Test channel with wrong version in address."""
        channels: dict[str, object] = {
            "coffee": {"address": "/ws/example/v2/coffee"},
        }
        result = ChannelValidationResult(component_name="example", spec_path="example.yaml")

        validate_channel_addresses("example", channels, result)

        assert len(result.errors) == 1
        assert "Expected: /ws/example/v1/coffee" in result.errors[0]
        assert "Got:      /ws/example/v2/coffee" in result.errors[0]


class TestValidateChannelMappings:
    """Tests for validate_channel_mappings function."""

    def test_valid_mapping(self) -> None:
        """Test validation with valid channel mappings."""
        spec: dict[str, object] = {
            "channels": {
                "coffee": {"address": "/ws/example/v1/coffee"},
                "chat": {"address": "/ws/example/v1/chat"},
            }
        }

        module = types.ModuleType("test_module")

        async def handle_coffee(message: dict[str, object]) -> dict[str, object]:
            return {}

        async def handle_chat(message: dict[str, object]) -> dict[str, object]:
            return {}

        async def on_connect_chat(websocket, connection_id: str) -> None:
            pass

        module.handle_coffee = handle_coffee  # type: ignore[attr-defined]
        module.handle_chat = handle_chat  # type: ignore[attr-defined]
        module.on_connect_chat = on_connect_chat  # type: ignore[attr-defined]

        result = validate_channel_mappings(
            component_name="example", spec=spec, spec_path="example.yaml", handler_module=module
        )

        assert result.is_valid is True
        assert len(result.errors) == 0
        assert len(result.warnings) == 0
        assert result.channels_validated == 2
        assert result.handlers_validated == 3

    def test_missing_handler_warning(self) -> None:
        """Test validation with missing handler."""
        spec: dict[str, object] = {
            "channels": {
                "coffee": {"address": "/ws/example/v1/coffee"},
            }
        }

        module = types.ModuleType("test_module")

        result = validate_channel_mappings(
            component_name="example", spec=spec, spec_path="example.yaml", handler_module=module
        )

        assert result.is_valid is True  # Warnings don't affect validity
        assert len(result.errors) == 0
        assert len(result.warnings) == 1
        assert "handle_coffee" in result.warnings[0]

    def test_orphaned_handler_error(self) -> None:
        """Test validation with orphaned handler."""
        spec: dict[str, object] = {
            "channels": {
                "coffee": {"address": "/ws/example/v1/coffee"},
            }
        }

        module = types.ModuleType("test_module")

        async def handle_coffee(message: dict[str, object]) -> dict[str, object]:
            return {}

        async def handle_orphan(message: dict[str, object]) -> dict[str, object]:
            return {}

        module.handle_coffee = handle_coffee  # type: ignore[attr-defined]
        module.handle_orphan = handle_orphan  # type: ignore[attr-defined]

        result = validate_channel_mappings(
            component_name="example", spec=spec, spec_path="example.yaml", handler_module=module
        )

        assert result.is_valid is False  # Errors affect validity
        assert len(result.errors) == 1
        assert "handle_orphan" in result.errors[0]

    def test_naming_convention_error(self) -> None:
        """Test validation with naming convention violation."""
        spec: dict[str, object] = {
            "channels": {
                "agent-events": {"address": "/ws/example/v1/agent_events"},  # kebab-case (invalid)
            }
        }

        module = types.ModuleType("test_module")

        async def handle_agent_events(message: dict[str, object]) -> dict[str, object]:
            return {}

        module.handle_agent_events = handle_agent_events  # type: ignore[attr-defined]

        result = validate_channel_mappings(
            component_name="example", spec=spec, spec_path="example.yaml", handler_module=module
        )

        assert result.is_valid is False
        assert len(result.errors) >= 1
        # Should have naming convention error
        assert any("agent-events" in e and "snake_case" in e for e in result.errors)

    def test_address_validation_error(self) -> None:
        """Test validation with invalid channel address."""
        spec: dict[str, object] = {
            "channels": {
                "coffee": {"address": "/ws/example_test/v1/coffee"},  # Wrong component name
            }
        }

        module = types.ModuleType("test_module")

        async def handle_coffee(message: dict[str, object]) -> dict[str, object]:
            return {}

        module.handle_coffee = handle_coffee  # type: ignore[attr-defined]

        result = validate_channel_mappings(
            component_name="example", spec=spec, spec_path="example.yaml", handler_module=module
        )

        assert result.is_valid is False
        assert len(result.errors) >= 1
        # Should have address mismatch error
        assert any("address mismatch" in e and "example_test" in e for e in result.errors)

    def test_empty_spec(self) -> None:
        """Test validation with empty spec."""
        spec: dict[str, object] = {"channels": {}}
        module = types.ModuleType("test_module")

        result = validate_channel_mappings(
            component_name="example", spec=spec, spec_path="example.yaml", handler_module=module
        )

        assert result.is_valid is True
        assert len(result.warnings) == 1
        assert "No channels defined" in result.warnings[0]
