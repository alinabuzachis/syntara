"""Tests for cursor utilities.

This module provides comprehensive tests for cursor-based pagination
and sorting functionality, including encoding/decoding, validation,
and data manipulation functions.
"""

import base64
import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest

from nexus.core.exceptions import SafeValueError
from nexus.core.utils.cursor import (
    CursorData,
    PaginationDirection,
    SortDirection,
    create_cursor_data,
    decode_cursor,
    encode_cursor,
    extract_pagination_from_cursor,
    extract_sort_from_cursor,
    get_pagination_direction,
)


class TestPaginationDirection:
    """Tests for PaginationDirection enum."""

    def test_pagination_direction_string_behavior(self) -> None:
        """Test that PaginationDirection behaves like a string."""
        # Enum str() returns the full representation, but value works like string
        assert PaginationDirection.NEXT.value == "next"
        assert PaginationDirection.PREV.value == "prev"


class TestSortDirection:
    """Tests for SortDirection enum."""

    def test_sort_direction_string_behavior(self) -> None:
        """Test that SortDirection behaves like a string."""
        # Enum str() returns the full representation, but value works like string
        assert SortDirection.ASC.value == "asc"
        assert SortDirection.DESC.value == "desc"


class TestCreateCursorData:
    """Tests for create_cursor_data function."""

    def test_create_empty_cursor_data(self) -> None:
        """Test creating cursor data with no parameters."""
        cursor = create_cursor_data()
        assert cursor["direction"] == "next"  # Default direction
        assert len(cursor) == 1  # Only direction field

    def test_create_cursor_data_with_resource_id(self) -> None:
        """Test creating cursor data with resource ID."""
        resource_id = uuid4()
        cursor = create_cursor_data(resource_id=resource_id)

        assert cursor["id"] == str(resource_id)
        assert cursor["direction"] == "next"
        assert "sort_direction" not in cursor  # No sort field means no sort direction

    def test_create_cursor_data_with_string_resource_id(self) -> None:
        """Test creating cursor data with string resource ID."""
        resource_id = "550e8400-e29b-41d4-a716-446655440000"
        cursor = create_cursor_data(resource_id=resource_id)

        assert cursor["id"] == resource_id
        assert cursor["direction"] == "next"

    def test_create_cursor_data_with_datetime(self) -> None:
        """Test creating cursor data with datetime."""
        now = datetime.now(UTC)
        cursor = create_cursor_data(created_at=now)

        assert cursor["created_at"] == now.isoformat()
        assert cursor["direction"] == "next"

    def test_create_cursor_data_with_string_datetime(self) -> None:
        """Test creating cursor data with string datetime."""
        dt_string = "2025-01-01T12:00:00.000000"
        cursor = create_cursor_data(created_at=dt_string)

        assert cursor["created_at"] == dt_string
        assert cursor["direction"] == "next"

    def test_create_cursor_data_with_sort_field(self) -> None:
        """Test creating cursor data with sort field."""
        cursor = create_cursor_data(sort_field="name")

        assert cursor["sort_field"] == "name"
        assert cursor["sort_direction"] == "desc"  # Default sort direction
        assert cursor["direction"] == "next"

    def test_create_cursor_data_with_custom_sort_direction(self) -> None:
        """Test creating cursor data with custom sort direction."""
        cursor = create_cursor_data(sort_field="created_at", sort_direction=SortDirection.ASC)

        assert cursor["sort_field"] == "created_at"
        assert cursor["sort_direction"] == "asc"
        assert cursor["direction"] == "next"

    def test_create_cursor_data_with_prev_direction(self) -> None:
        """Test creating cursor data with prev direction."""
        cursor = create_cursor_data(direction=PaginationDirection.PREV)

        assert cursor["direction"] == "prev"

    def test_create_cursor_data_complete(self) -> None:
        """Test creating cursor data with all parameters."""
        resource_id = uuid4()
        now = datetime.now(UTC)

        cursor = create_cursor_data(
            resource_id=resource_id,
            created_at=now,
            direction=PaginationDirection.PREV,
            sort_field="name",
            sort_direction=SortDirection.ASC,
        )

        assert cursor["id"] == str(resource_id)
        assert cursor["created_at"] == now.isoformat()
        assert cursor["direction"] == "prev"
        assert cursor["sort_field"] == "name"
        assert cursor["sort_direction"] == "asc"

    def test_create_cursor_data_sort_direction_without_field(self) -> None:
        """Test that sort_direction is not included without sort_field."""
        cursor = create_cursor_data(sort_direction=SortDirection.ASC)

        assert "sort_field" not in cursor
        assert "sort_direction" not in cursor  # Should not be included
        assert cursor["direction"] == "next"


class TestEncodeCursor:
    """Tests for encode_cursor function."""

    def test_encode_empty_cursor(self) -> None:
        """Test encoding empty cursor data."""
        cursor_data: CursorData = {}
        encoded = encode_cursor(cursor_data)

        # Should be valid base64
        decoded_bytes = base64.b64decode(encoded.encode("ascii"))
        decoded_json = json.loads(decoded_bytes.decode("utf-8"))
        assert decoded_json == {}

    def test_encode_cursor_with_data(self) -> None:
        """Test encoding cursor with data."""
        cursor_data: CursorData = {"id": "550e8400-e29b-41d4-a716-446655440000", "direction": "next"}
        encoded = encode_cursor(cursor_data)

        # Verify it can be decoded back
        decoded_bytes = base64.b64decode(encoded.encode("ascii"))
        decoded_json = json.loads(decoded_bytes.decode("utf-8"))
        assert decoded_json == cursor_data

    def test_encode_cursor_sorts_keys(self) -> None:
        """Test that encode_cursor sorts keys for consistency."""
        cursor_data: CursorData = {"direction": "next", "id": "uuid", "created_at": "2025-01-01T12:00:00"}
        encoded = encode_cursor(cursor_data)

        # Decode and verify keys are in sorted order
        decoded_bytes = base64.b64decode(encoded.encode("ascii"))
        json_str = decoded_bytes.decode("utf-8")

        # JSON with sorted keys should have consistent ordering
        expected_json = json.dumps(cursor_data, sort_keys=True)
        assert json_str == expected_json

    def test_encode_cursor_deterministic(self) -> None:
        """Test that encoding the same data produces the same result."""
        cursor_data: CursorData = {"id": "test", "direction": "next"}

        encoded1 = encode_cursor(cursor_data)
        encoded2 = encode_cursor(cursor_data)

        assert encoded1 == encoded2


class TestDecodeCursor:
    """Tests for decode_cursor function."""

    def test_decode_valid_cursor(self) -> None:
        """Test decoding a valid cursor."""
        cursor_data: CursorData = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "direction": "next",
            "created_at": "2025-01-01T12:00:00",
        }

        # Encode then decode
        encoded = encode_cursor(cursor_data)
        decoded = decode_cursor(encoded)

        assert decoded == cursor_data

    def test_decode_empty_cursor(self) -> None:
        """Test decoding an empty cursor."""
        cursor_data: CursorData = {}

        encoded = encode_cursor(cursor_data)
        decoded = decode_cursor(encoded)

        assert decoded == {}

    def test_decode_cursor_filters_invalid_fields(self) -> None:
        """Test that decode_cursor filters out invalid fields."""
        # Create cursor with extra fields manually
        raw_data = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "direction": "next",
            "invalid_field": "should_be_filtered",
            "another_invalid": 123,
        }

        # Manually encode
        cursor_json = json.dumps(raw_data, sort_keys=True)
        cursor_bytes = cursor_json.encode("utf-8")
        encoded = base64.b64encode(cursor_bytes).decode("ascii")

        # Decode should filter out invalid fields
        decoded = decode_cursor(encoded)

        assert decoded["id"] == "550e8400-e29b-41d4-a716-446655440000"
        assert decoded["direction"] == "next"
        assert "invalid_field" not in decoded
        assert "another_invalid" not in decoded

    def test_decode_cursor_filters_non_string_values(self) -> None:
        """Test that decode_cursor filters out non-string values."""
        # Create cursor with non-string values
        raw_data = {
            "id": 123,  # Should be string
            "direction": "next",
            "created_at": None,  # Should be string
            "sort_field": "name",
        }

        # Manually encode
        cursor_json = json.dumps(raw_data, sort_keys=True)
        cursor_bytes = cursor_json.encode("utf-8")
        encoded = base64.b64encode(cursor_bytes).decode("ascii")

        # Decode should filter out non-string values
        decoded = decode_cursor(encoded)

        assert "id" not in decoded  # Filtered out because it's not a string
        assert decoded["direction"] == "next"  # String value preserved
        assert "created_at" not in decoded  # Filtered out because it's None
        assert decoded["sort_field"] == "name"  # String value preserved

    def test_decode_invalid_base64(self) -> None:
        """Test decoding invalid base64 raises SafeValueError."""
        invalid_cursor = "not-valid-base64!"

        with pytest.raises(SafeValueError, match="Invalid cursor format"):
            decode_cursor(invalid_cursor)

    def test_decode_invalid_json(self) -> None:
        """Test decoding invalid JSON raises JSONDecodeError."""
        # Valid base64 but invalid JSON
        invalid_json = "not valid json"
        cursor_bytes = invalid_json.encode("utf-8")
        encoded = base64.b64encode(cursor_bytes).decode("ascii")

        with pytest.raises(json.JSONDecodeError):
            decode_cursor(encoded)

    def test_decode_cursor_too_large(self) -> None:
        """Test that overly large cursor raises SafeValueError."""
        # Create a cursor that exceeds the size limit
        large_data = {"id": "x" * 10000}  # Very large cursor
        cursor_json = json.dumps(large_data)
        cursor_bytes = cursor_json.encode("utf-8")
        encoded = base64.b64encode(cursor_bytes).decode("ascii")

        with pytest.raises(SafeValueError, match=r"Cursor.*too large"):
            decode_cursor(encoded)

    def test_decode_deeply_nested_json(self) -> None:
        """Test that deeply nested JSON triggers size limit validation."""
        # Create deeply nested structure that would exceed size limits
        nested: dict[str, Any] = {}
        current = nested
        for i in range(1000):  # Very deep nesting
            current[f"level_{i}"] = {}
            current = current[f"level_{i}"]

        cursor_json = json.dumps(nested)
        cursor_bytes = cursor_json.encode("utf-8")
        encoded = base64.b64encode(cursor_bytes).decode("ascii")

        # Size limit validation triggers before deep nesting validation
        with pytest.raises(SafeValueError, match="Cursor too large"):
            decode_cursor(encoded)

    def test_decode_non_dict_json(self) -> None:
        """Test decoding JSON that's not a dictionary."""
        # Valid JSON but not a dict
        json_list = json.dumps(["not", "a", "dict"])
        cursor_bytes = json_list.encode("utf-8")
        encoded = base64.b64encode(cursor_bytes).decode("ascii")

        # Should return empty CursorData for non-dict JSON
        decoded = decode_cursor(encoded)
        assert decoded == {}

    def test_decode_malformed_cursor_raises_exception(self) -> None:
        """Test that malformed cursor strings raise appropriate exceptions."""
        # Test cursor with invalid characters that can't be base64 decoded
        malformed_cursor = "invalid_base64!!!!"

        with pytest.raises(SafeValueError, match="Invalid cursor format"):
            decode_cursor(malformed_cursor)


class TestGetPaginationDirection:
    """Tests for get_pagination_direction function."""

    def test_get_pagination_direction_none_cursor(self) -> None:
        """Test getting pagination direction from None cursor."""
        direction = get_pagination_direction(None)
        assert direction == PaginationDirection.NEXT

    def test_get_pagination_direction_next(self) -> None:
        """Test getting NEXT pagination direction."""
        cursor_data: CursorData = {"direction": "next"}
        cursor = encode_cursor(cursor_data)

        direction = get_pagination_direction(cursor)
        assert direction == PaginationDirection.NEXT

    def test_get_pagination_direction_prev(self) -> None:
        """Test getting PREV pagination direction."""
        cursor_data: CursorData = {"direction": "prev"}
        cursor = encode_cursor(cursor_data)

        direction = get_pagination_direction(cursor)
        assert direction == PaginationDirection.PREV

    def test_get_pagination_direction_missing_field(self) -> None:
        """Test getting pagination direction when field is missing."""
        cursor_data: CursorData = {"id": "test"}  # No direction field
        cursor = encode_cursor(cursor_data)

        direction = get_pagination_direction(cursor)
        assert direction == PaginationDirection.NEXT  # Default

    def test_get_pagination_direction_invalid_value(self) -> None:
        """Test getting pagination direction with invalid value."""
        # Create cursor with invalid direction manually
        raw_data = {"direction": "invalid"}
        cursor_json = json.dumps(raw_data)
        cursor_bytes = cursor_json.encode("utf-8")
        cursor = base64.b64encode(cursor_bytes).decode("ascii")

        direction = get_pagination_direction(cursor)
        assert direction == PaginationDirection.NEXT  # Default for invalid

    def test_get_pagination_direction_invalid_cursor(self) -> None:
        """Test getting pagination direction from invalid cursor."""
        invalid_cursor = "invalid-cursor"

        direction = get_pagination_direction(invalid_cursor)
        assert direction == PaginationDirection.NEXT  # Default on error


class TestExtractSortFromCursor:
    """Tests for extract_sort_from_cursor function."""

    def test_extract_sort_with_sort_data(self) -> None:
        """Test extracting sort information from cursor with sort data."""
        cursor_data: CursorData = {"sort_field": "name", "sort_direction": "asc"}

        field, direction = extract_sort_from_cursor(cursor_data)

        assert field == "name"
        assert direction == SortDirection.ASC

    def test_extract_sort_missing_fields(self) -> None:
        """Test extracting sort information when fields are missing."""
        cursor_data: CursorData = {"id": "test"}

        field, direction = extract_sort_from_cursor(cursor_data)

        assert field == "created_at"  # Default field
        assert direction == SortDirection.DESC  # Default direction

    def test_extract_sort_missing_direction(self) -> None:
        """Test extracting sort when only field is present."""
        cursor_data: CursorData = {"sort_field": "name"}

        field, direction = extract_sort_from_cursor(cursor_data)

        assert field == "name"
        assert direction == SortDirection.DESC  # Default direction

    def test_extract_sort_invalid_direction(self) -> None:
        """Test extracting sort with invalid direction."""
        cursor_data: CursorData = {"sort_field": "name", "sort_direction": "invalid"}

        field, direction = extract_sort_from_cursor(cursor_data)

        assert field == "name"
        assert direction == SortDirection.DESC  # Default for invalid

    def test_extract_sort_desc_direction(self) -> None:
        """Test extracting sort with DESC direction."""
        cursor_data: CursorData = {"sort_field": "created_at", "sort_direction": "desc"}

        field, direction = extract_sort_from_cursor(cursor_data)

        assert field == "created_at"
        assert direction == SortDirection.DESC


class TestExtractPaginationFromCursor:
    """Tests for extract_pagination_from_cursor function."""

    def test_extract_pagination_complete_data(self) -> None:
        """Test extracting pagination from complete cursor data."""
        cursor_data: CursorData = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "created_at": "2025-01-01T12:00:00.000000",
            "direction": "next",
        }

        resource_id, created_at, direction = extract_pagination_from_cursor(cursor_data)

        assert resource_id == "550e8400-e29b-41d4-a716-446655440000"
        assert created_at == "2025-01-01T12:00:00.000000"
        assert direction == PaginationDirection.NEXT

    def test_extract_pagination_missing_fields(self) -> None:
        """Test extracting pagination when fields are missing."""
        cursor_data: CursorData = {}

        resource_id, created_at, direction = extract_pagination_from_cursor(cursor_data)

        assert resource_id is None
        assert created_at is None
        assert direction == PaginationDirection.NEXT  # Default

    def test_extract_pagination_prev_direction(self) -> None:
        """Test extracting pagination with PREV direction."""
        cursor_data: CursorData = {"direction": "prev"}

        resource_id, created_at, direction = extract_pagination_from_cursor(cursor_data)

        assert resource_id is None
        assert created_at is None
        assert direction == PaginationDirection.PREV

    def test_extract_pagination_invalid_direction(self) -> None:
        """Test extracting pagination with invalid direction."""
        cursor_data: CursorData = {"direction": "invalid"}

        resource_id, created_at, direction = extract_pagination_from_cursor(cursor_data)

        assert resource_id is None
        assert created_at is None
        assert direction == PaginationDirection.NEXT  # Default for invalid

    def test_extract_pagination_partial_data(self) -> None:
        """Test extracting pagination with partial data."""
        cursor_data: CursorData = {"id": "test-id", "direction": "prev"}

        resource_id, created_at, direction = extract_pagination_from_cursor(cursor_data)

        assert resource_id == "test-id"
        assert created_at is None
        assert direction == PaginationDirection.PREV


class TestCursorIntegration:
    """Integration tests for cursor functionality."""

    def test_encode_decode_roundtrip(self) -> None:
        """Test that encoding and decoding produces the same result."""
        original_data: CursorData = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "created_at": "2025-01-01T12:00:00.000000",
            "direction": "prev",
            "sort_field": "name",
            "sort_direction": "asc",
        }

        # Encode then decode
        encoded = encode_cursor(original_data)
        decoded = decode_cursor(encoded)

        assert decoded == original_data

    def test_create_encode_decode_roundtrip(self) -> None:
        """Test full workflow: create -> encode -> decode."""
        # Create cursor data
        cursor_data = create_cursor_data(
            resource_id="550e8400-e29b-41d4-a716-446655440000",
            created_at=datetime.fromisoformat("2025-01-01T12:00:00"),
            direction=PaginationDirection.PREV,
            sort_field="name",
            sort_direction=SortDirection.ASC,
        )

        # Encode
        encoded = encode_cursor(cursor_data)

        # Decode
        decoded = decode_cursor(encoded)

        # Verify data integrity
        assert decoded["id"] == "550e8400-e29b-41d4-a716-446655440000"
        assert decoded["created_at"] == "2025-01-01T12:00:00"
        assert decoded["direction"] == "prev"
        assert decoded["sort_field"] == "name"
        assert decoded["sort_direction"] == "asc"

    def test_extract_functions_consistency(self) -> None:
        """Test that extract functions work consistently with cursor data."""
        cursor_data: CursorData = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "created_at": "2025-01-01T12:00:00.000000",
            "direction": "prev",
            "sort_field": "name",
            "sort_direction": "asc",
        }

        # Extract pagination info
        resource_id, created_at, direction = extract_pagination_from_cursor(cursor_data)
        assert resource_id == "550e8400-e29b-41d4-a716-446655440000"
        assert created_at == "2025-01-01T12:00:00.000000"
        assert direction == PaginationDirection.PREV

        # Extract sort info
        sort_field, sort_direction = extract_sort_from_cursor(cursor_data)
        assert sort_field == "name"
        assert sort_direction == SortDirection.ASC

    def test_create_cursor_data_structure(self) -> None:
        """Test that created cursor data has correct structure."""
        cursor_data = create_cursor_data(
            resource_id="test-id",
            direction=PaginationDirection.NEXT,
            sort_field="name",
            sort_direction=SortDirection.DESC,
        )

        assert cursor_data["id"] == "test-id"
        assert cursor_data["direction"] == "next"
        assert cursor_data["sort_field"] == "name"
        assert cursor_data["sort_direction"] == "desc"

    def test_extract_functions_integration(self) -> None:
        """Test that extraction functions work together."""
        cursor_data: CursorData = {"id": "test-id", "direction": "next", "sort_field": "name", "sort_direction": "asc"}

        # Should extract correctly
        resource_id, created_at, direction = extract_pagination_from_cursor(cursor_data)
        assert resource_id == "test-id"
        assert created_at is None
        assert direction == PaginationDirection.NEXT

        sort_field, sort_direction = extract_sort_from_cursor(cursor_data)
        assert sort_field == "name"
        assert sort_direction == SortDirection.ASC
