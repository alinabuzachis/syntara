"""Contract tests for cursor-based pagination functionality.

These tests verify the pagination utility functions can generate and decode cursors,
create pagination links, and handle edge cases. Tests will fail until
pagination functions are implemented.
"""

import base64
import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from nexus.core.models.base import NamedResource
from nexus.core.utils.cursor import (
    PaginationDirection,
    create_cursor_data,
    decode_cursor,
    encode_cursor,
    get_pagination_direction,
)
from nexus.core.utils.pagination import (
    encode_pagination_cursor,
    generate_response,
)


class MockResource(NamedResource):
    """Mock resource class for testing pagination."""

    def __init__(self, id: UUID, created_at: datetime, name: str) -> None:  # noqa: A002
        """Initialize mock resource with provided attributes."""
        super().__init__(id=id, created_at=created_at, updated_at=created_at, name=name)


class TestPaginationFunctions:
    """Test cursor-based pagination functionality."""

    def test_pagination_functions_import(self) -> None:
        """Test that pagination functions can be imported."""
        # This will fail until pagination functions are implemented

        assert encode_cursor is not None
        assert decode_cursor is not None
        assert generate_response is not None
        assert get_pagination_direction is not None

    def test_encode_cursor_function_exists(self) -> None:
        """Test that encode_cursor function exists."""
        assert callable(encode_cursor)

    def test_decode_cursor_function_exists(self) -> None:
        """Test that decode_cursor function exists."""
        assert callable(decode_cursor)

    def test_generate_response_function_exists(self) -> None:
        """Test that generate_response function exists."""
        assert callable(generate_response)

    def test_encode_cursor_basic(self) -> None:
        """Test basic cursor encoding from last item."""
        resource_id = uuid4()
        last_item = MockResource(
            id=resource_id, created_at=datetime(2025, 10, 15, 12, 0, 0, tzinfo=UTC), name="Test Resource"
        )

        cursor = encode_pagination_cursor(last_item)

        # Should return a base64-encoded string
        assert isinstance(cursor, str)
        assert len(cursor) > 0

        # Should be valid base64
        try:
            decoded_bytes = base64.b64decode(cursor.encode())
            decoded_json = json.loads(decoded_bytes.decode())
            assert "id" in decoded_json
        except Exception as e:  # noqa: BLE001
            pytest.fail(f"Cursor should be valid base64 JSON: {e}")

    def test_decode_cursor_basic(self) -> None:
        """Test basic cursor decoding."""
        # Create a test cursor manually
        cursor_data = {"id": str(uuid4())}
        cursor_json = json.dumps(cursor_data)
        cursor = base64.b64encode(cursor_json.encode()).decode()

        decoded = decode_cursor(cursor)

        assert isinstance(decoded, dict)
        assert "id" in decoded
        assert decoded["id"] == cursor_data["id"]

    def test_encode_decode_roundtrip(self) -> None:
        """Test encoding and decoding a cursor produces original data."""
        resource_id = uuid4()
        last_item = MockResource(
            id=resource_id, created_at=datetime(2025, 10, 15, 12, 0, 0, tzinfo=UTC), name="Test Resource"
        )

        # Encode then decode
        cursor = encode_pagination_cursor(last_item)
        decoded = decode_cursor(cursor)

        # Should get back the original ID
        assert decoded["id"] == str(resource_id)

    def test_generate_response_first_page(self) -> None:
        """Test generating pagination response for first page."""
        # Create mock resources
        resources = [MockResource(id=uuid4(), created_at=datetime.now(UTC), name=f"Resource {i}") for i in range(20)]

        response = generate_response(
            items=resources,
            limit=20,
            cursor=None,  # First page
            include_total=True,
            total_count=100,
        )

        # Should have pagination metadata
        assert "next" in response
        assert "prev" in response
        assert "total" in response

        # First page should have no prev cursor
        assert response["prev"] is None

        # Should have next cursor if items == limit
        assert response["next"] is not None
        assert isinstance(response["next"], str)

        # Should include total count
        assert response["total"] == 100

    def test_generate_response_middle_page(self) -> None:
        """Test generating pagination response for middle page."""
        resources = [MockResource(id=uuid4(), created_at=datetime.now(UTC), name=f"Resource {i}") for i in range(20)]

        # Simulate middle page with existing cursor
        existing_cursor = base64.b64encode(json.dumps({"id": str(uuid4())}).encode()).decode()

        response = generate_response(
            items=resources,
            limit=20,
            cursor=existing_cursor,
            include_total=False,
        )

        # Should have next cursor (since items == limit)
        assert response["next"] is not None
        assert isinstance(response["next"], str)

        # Middle page should have prev cursor (bidirectional navigation implemented)
        assert response["prev"] is not None
        assert isinstance(response["prev"], str)

        # Should not include total when include_total=False
        assert response.get("total") is None

    def test_generate_response_last_page(self) -> None:
        """Test generating pagination response for last page."""
        # Last page has fewer items than limit
        resources = [
            MockResource(id=uuid4(), created_at=datetime.now(UTC), name=f"Resource {i}")
            for i in range(15)  # Less than limit of 20
        ]

        existing_cursor = base64.b64encode(json.dumps({"id": str(uuid4())}).encode()).decode()

        response = generate_response(items=resources, limit=20, cursor=existing_cursor)

        # Last page should have no next cursor (items < limit)
        assert response["next"] is None

        # Last page should have prev cursor (bidirectional navigation implemented)
        assert response["prev"] is not None
        assert isinstance(response["prev"], str)

    def test_generate_response_empty_page(self) -> None:
        """Test generating pagination response for empty results."""
        response = generate_response(items=[], limit=20, cursor=None)

        # Empty page should have no pagination cursors
        assert response["next"] is None
        assert response["prev"] is None

    def test_cursor_token_format(self) -> None:
        """Test that cursor tokens are properly formatted."""
        resources = [MockResource(id=uuid4(), created_at=datetime.now(UTC), name="Test")]

        response = generate_response(items=resources, limit=20, cursor=None)

        if response["next"]:
            # Cursor should be a valid base64-encoded string
            cursor = response["next"]
            assert isinstance(cursor, str)
            # Should be decodable
            try:
                decoded = decode_cursor(cursor)
                assert isinstance(decoded, dict)
                assert "id" in decoded
            except Exception as e:  # noqa: BLE001
                pytest.fail(f"Cursor should be valid: {e}")

    def test_invalid_cursor_handling(self) -> None:
        """Test handling of invalid cursor data."""
        # Invalid base64
        with pytest.raises((ValueError, json.JSONDecodeError)):
            decode_cursor("invalid-base64!")

        # Valid base64 but invalid JSON
        invalid_json_cursor = base64.b64encode(b"not-json").decode()
        with pytest.raises(json.JSONDecodeError):
            decode_cursor(invalid_json_cursor)

    def test_cursor_with_timestamps(self) -> None:
        """Test cursor encoding/decoding with timestamp data."""
        test_time = datetime(2025, 10, 15, 12, 30, 45, tzinfo=UTC)
        last_item = MockResource(id=uuid4(), created_at=test_time, name="Test Resource")

        cursor = encode_pagination_cursor(last_item)
        decoded = decode_cursor(cursor)

        # Should contain ID at minimum
        assert "id" in decoded

    def test_pagination_cursor_consistency(self) -> None:
        """Test that pagination cursors are consistent across calls."""
        resource = MockResource(id=uuid4(), created_at=datetime.now(UTC), name="Test")
        resources = [resource]

        # Generate response multiple times
        response1 = generate_response(items=resources, limit=20, cursor=None)

        response2 = generate_response(items=resources, limit=20, cursor=None)

        # Both should generate the same cursor for the same resource
        if response1["next"] and response2["next"]:
            assert response1["next"] == response2["next"]

    def test_bidirectional_navigation_new_functionality(self) -> None:
        """Test the new bidirectional navigation features."""
        resources = [MockResource(id=uuid4(), created_at=datetime.now(UTC), name=f"Resource {i}") for i in range(5)]

        # Test direction encoding and detection
        next_cursor_data = create_cursor_data(
            resource_id=resources[0].id, created_at=resources[0].created_at, direction=PaginationDirection.NEXT
        )
        prev_cursor_data = create_cursor_data(
            resource_id=resources[0].id, created_at=resources[0].created_at, direction=PaginationDirection.PREV
        )
        next_cursor = encode_cursor(next_cursor_data)
        prev_cursor = encode_cursor(prev_cursor_data)

        assert get_pagination_direction(None) == PaginationDirection.NEXT
        assert get_pagination_direction(next_cursor) == PaginationDirection.NEXT
        assert get_pagination_direction(prev_cursor) == PaginationDirection.PREV

        # Test cursor contains direction information
        decoded_next = decode_cursor(next_cursor)
        decoded_prev = decode_cursor(prev_cursor)

        assert decoded_next["direction"] == "next"
        assert decoded_prev["direction"] == "prev"
        assert decoded_next["id"] == decoded_prev["id"]  # Same resource, different direction

    def test_empty_page_with_cursor(self) -> None:
        """Test empty page behavior when cursor is provided."""
        # Empty page with cursor should have no prev cursor
        response = generate_response(items=[], limit=20, cursor="some_cursor")

        assert response["next"] is None
        assert response["prev"] is None  # Empty page means no navigation

    def test_single_item_page_navigation(self) -> None:
        """Test navigation with single item pages."""
        resource = MockResource(id=uuid4(), created_at=datetime.now(UTC), name="Single Resource")

        # First page with single item
        first_response = generate_response(items=[resource], limit=5, cursor=None)

        assert first_response["next"] is None  # Less than limit, so no next
        assert first_response["prev"] is None  # First page, so no prev

        # Middle page with single item
        cursor_data = create_cursor_data(
            resource_id=resource.id, created_at=resource.created_at, direction=PaginationDirection.NEXT
        )
        cursor = encode_cursor(cursor_data)
        middle_response = generate_response(items=[resource], limit=5, cursor=cursor)

        assert middle_response["next"] is None  # Less than limit, so no next
        assert middle_response["prev"] is not None  # Has cursor, so has prev
