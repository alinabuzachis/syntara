"""Tests for NexusJSONRenderer."""

import json
from pathlib import Path
from typing import Any
from unittest.mock import Mock
from uuid import uuid4

import pytest

from nexus.core.logging.logging import NexusLogRecordRenderer


class TestNexusLogRecordRendererAsJSON:
    """Test suite for NexusJSONRenderer."""

    def test_basic_serialization(self) -> None:
        """Test basic JSON serialization with event field first."""
        renderer = NexusLogRecordRenderer()
        logger = Mock()
        event_dict = {
            "level": "info",
            "event": "test message",
            "timestamp": "2024-01-01T00:00:00",
        }

        result = renderer(logger, "info", event_dict)
        parsed = json.loads(result)

        assert parsed["event"] == "test message"
        assert parsed["level"] == "info"
        assert parsed["timestamp"] == "2024-01-01T00:00:00"

    def test_missing_event_key(self) -> None:
        """Test handling when 'event' key is missing."""
        renderer = NexusLogRecordRenderer()
        logger = Mock()
        event_dict = {
            "level": "info",
            "timestamp": "2024-01-01T00:00:00",
            "user_id": 123,
        }

        result = renderer(logger, "info", event_dict)
        parsed = json.loads(result)

        # Should not error and should contain all fields
        assert "level" in parsed
        assert "timestamp" in parsed
        assert "user_id" in parsed
        assert "event" not in parsed

    def test_non_serializable_objects(self) -> None:
        """Test handling of non-JSON-serializable objects using __repr__."""
        renderer = NexusLogRecordRenderer()
        logger = Mock()

        path_obj = Path("some_test_file.txt")
        uuid_obj = uuid4()

        event_dict = {
            "event": "test message",
            "path": path_obj,
            "uuid": uuid_obj,
            "custom_obj": object(),
        }

        result = renderer(logger, "info", event_dict)
        parsed = json.loads(result)

        assert parsed["event"] == "test message"
        assert parsed["path"] == repr(path_obj)
        assert parsed["uuid"] == repr(uuid_obj)
        assert "custom_obj" in parsed

    def test_nested_non_serializable_objects(self) -> None:
        """Test handling of nested structures with non-serializable objects."""
        renderer = NexusLogRecordRenderer()
        logger = Mock()

        path_obj = Path("base_file.txt")

        event_dict = {
            "event": "test message",
            "metadata": {
                "path": path_obj,
                "files": [Path("file1.txt"), Path("file2.txt")],
                "config": {
                    "base_path": path_obj,
                    "count": 5,
                },
            },
        }

        result = renderer(logger, "info", event_dict)
        parsed = json.loads(result)

        assert parsed["event"] == "test message"
        assert parsed["metadata"]["path"] == repr(path_obj)
        assert parsed["metadata"]["files"][0] == repr(Path("file1.txt"))
        assert parsed["metadata"]["files"][1] == repr(Path("file2.txt"))
        assert parsed["metadata"]["config"]["base_path"] == repr(path_obj)
        assert parsed["metadata"]["config"]["count"] == 5

    def test_preserves_json_serializable_types(self) -> None:
        """Test that JSON-serializable types are preserved as-is."""
        renderer = NexusLogRecordRenderer()
        logger = Mock()

        event_dict = {
            "event": "test message",
            "string": "hello",
            "integer": 42,
            "float": 3.14,
            "boolean": True,
            "null": None,
            "list": [1, 2, 3],
            "dict": {"key": "value"},
        }

        result = renderer(logger, "info", event_dict)
        parsed = json.loads(result)

        assert parsed["string"] == "hello"
        assert parsed["integer"] == 42
        assert parsed["float"] == pytest.approx(3.14)
        assert parsed["boolean"] is True
        assert parsed["null"] is None
        assert parsed["list"] == [1, 2, 3]
        assert parsed["dict"] == {"key": "value"}

    def test_empty_dict(self) -> None:
        """Test handling of empty event dictionary."""
        renderer = NexusLogRecordRenderer()
        logger = Mock()
        event_dict: dict[str, Any] = {}

        result = renderer(logger, "info", event_dict)
        parsed = json.loads(result)

        assert parsed == {}

    def test_tuple_serialization(self) -> None:
        """Test that tuples are converted to lists."""
        renderer = NexusLogRecordRenderer()
        logger = Mock()

        event_dict = {
            "event": "test message",
            "coordinates": (10, 20, 30),
        }

        result = renderer(logger, "info", event_dict)
        parsed = json.loads(result)

        assert parsed["coordinates"] == [10, 20, 30]

    def test_mixed_serializable_and_non_serializable(self) -> None:
        """Test mixed content with both serializable and non-serializable objects."""
        renderer = NexusLogRecordRenderer()
        logger = Mock()

        event_dict = {
            "event": "test message",
            "normal_string": "hello",
            "path_obj": Path("test_file.txt"),
            "normal_list": [1, 2, 3],
            "mixed_list": [1, Path("another_file.txt"), "string"],
        }

        result = renderer(logger, "info", event_dict)
        parsed = json.loads(result)

        assert parsed["normal_string"] == "hello"
        assert parsed["path_obj"] == repr(Path("test_file.txt"))
        assert parsed["normal_list"] == [1, 2, 3]
        assert parsed["mixed_list"] == [1, repr(Path("another_file.txt")), "string"]


class TestNexusLogRecordRendererAsText:
    """Test suite for NexusLogRecordRenderer in text format."""

    def test_basic_text_rendering(self) -> None:
        """Test basic text rendering with all standard fields."""
        renderer = NexusLogRecordRenderer(output_format="text")
        logger = Mock()
        event_dict = {
            "timestamp": "2024-01-01T00:00:00",
            "level": "info",
            "event": "test message",
        }

        result = renderer(logger, "info", event_dict)

        assert result == "[2024-01-01T00:00:00] [INFO] test message"

    def test_text_rendering_with_extra_fields(self) -> None:
        """Test text rendering with additional fields."""
        renderer = NexusLogRecordRenderer(output_format="text")
        logger = Mock()
        event_dict = {
            "timestamp": "2024-01-01T00:00:00",
            "level": "error",
            "event": "database connection failed",
            "user_id": 123,
            "module": "auth",
        }

        result = renderer(logger, "error", event_dict)

        # Should contain all fields, though order of extra fields may vary
        assert "[2024-01-01T00:00:00] [ERROR] database connection failed" in result
        assert "user_id=123" in result
        assert "module=auth" in result

    def test_text_rendering_missing_timestamp(self) -> None:
        """Test text rendering when timestamp is missing."""
        renderer = NexusLogRecordRenderer(output_format="text")
        logger = Mock()
        event_dict = {
            "level": "warning",
            "event": "something happened",
        }

        result = renderer(logger, "warning", event_dict)

        assert result == "[WARNING] something happened"

    def test_text_rendering_missing_level(self) -> None:
        """Test text rendering when level is missing."""
        renderer = NexusLogRecordRenderer(output_format="text")
        logger = Mock()
        event_dict = {
            "timestamp": "2024-01-01T00:00:00",
            "event": "no level specified",
        }

        result = renderer(logger, "info", event_dict)

        assert result == "[2024-01-01T00:00:00] no level specified"

    def test_text_rendering_missing_event(self) -> None:
        """Test text rendering when event message is missing."""
        renderer = NexusLogRecordRenderer(output_format="text")
        logger = Mock()
        event_dict = {
            "timestamp": "2024-01-01T00:00:00",
            "level": "debug",
            "user_id": 456,
        }

        result = renderer(logger, "debug", event_dict)

        assert result == "[2024-01-01T00:00:00] [DEBUG] user_id=456"

    def test_text_rendering_empty_dict(self) -> None:
        """Test text rendering with empty event dictionary."""
        renderer = NexusLogRecordRenderer(output_format="text")
        logger = Mock()
        event_dict: dict[str, Any] = {}

        result = renderer(logger, "info", event_dict)

        assert result == ""

    def test_text_rendering_non_serializable_objects(self) -> None:
        """Test text rendering with non-serializable objects."""
        renderer = NexusLogRecordRenderer(output_format="text")
        logger = Mock()

        path_obj = Path("test_file.txt")
        event_dict = {
            "timestamp": "2024-01-01T00:00:00",
            "level": "info",
            "event": "processing file",
            "path": path_obj,
        }

        result = renderer(logger, "info", event_dict)

        assert "[2024-01-01T00:00:00] [INFO] processing file" in result
        assert f"path={path_obj!r}" in result

    def test_text_rendering_complex_objects(self) -> None:
        """Test text rendering with complex nested objects."""
        renderer = NexusLogRecordRenderer(output_format="text")
        logger = Mock()

        event_dict = {
            "timestamp": "2024-01-01T00:00:00",
            "level": "info",
            "event": "complex data",
            "metadata": {"key": "value", "count": 42},
            "items": [1, 2, 3],
        }

        result = renderer(logger, "info", event_dict)

        assert "[2024-01-01T00:00:00] [INFO] complex data" in result
        assert "metadata={'key': 'value', 'count': 42}" in result
        assert "items=[1, 2, 3]" in result

    def test_text_rendering_case_insensitive_level(self) -> None:
        """Test that level is converted to uppercase in text format."""
        renderer = NexusLogRecordRenderer(output_format="text")
        logger = Mock()

        for level in ["debug", "info", "warning", "error", "critical"]:
            event_dict = {
                "timestamp": "2024-01-01T00:00:00",
                "level": level,
                "event": f"test {level} message",
            }

            result = renderer(logger, level, event_dict)

            assert f"{level.upper()}" in result
