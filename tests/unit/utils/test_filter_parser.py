"""Contract tests for filter parser functionality.

These tests verify the FilterParser utility can parse bracket notation query
parameters into structured filter objects. Tests will fail until FilterParser
is implemented.
"""

import pytest

from nexus.core.utils.filters import Filter, FilterOperator, parse_filters


class TestFilterParser:
    """Test filter parsing functionality."""

    def test_filter_parser_import(self) -> None:
        """Test that filter functions and related classes can be imported."""
        # This will fail until filter functions are implemented

        assert parse_filters is not None
        assert Filter is not None
        assert FilterOperator is not None

    def test_filter_operator_enum_values(self) -> None:
        """Test that FilterOperator enum has expected values."""
        # Check all required operators exist
        assert FilterOperator.EQ == "eq"  # type: ignore[comparison-overlap]
        assert FilterOperator.CONTAINS == "contains"  # type: ignore[unreachable]
        assert FilterOperator.STARTS_WITH == "starts_with"
        assert FilterOperator.GT == "gt"
        assert FilterOperator.GTE == "gte"
        assert FilterOperator.LT == "lt"
        assert FilterOperator.LTE == "lte"

    def test_filter_dataclass_structure(self) -> None:
        """Test that Filter dataclass has expected structure."""
        # Create a filter instance
        filter_obj = Filter(field="name", operator=FilterOperator.CONTAINS, value="test")

        assert filter_obj.field == "name"
        assert filter_obj.operator == FilterOperator.CONTAINS
        assert filter_obj.value == "test"

    def test_filter_parser_parse_method_exists(self) -> None:
        """Test that parse_filters function exists."""
        assert callable(parse_filters)

    def test_parse_simple_equality_filter(self) -> None:
        """Test parsing simple equality filter (shorthand syntax)."""
        params = {"name": "test-resource"}
        allowed_fields = ["name", "status"]

        filters = parse_filters(params, allowed_fields)

        assert len(filters) == 1
        assert filters[0].field == "name"
        assert filters[0].operator == FilterOperator.EQ
        assert filters[0].value == "test-resource"

    def test_parse_bracket_notation_filter(self) -> None:
        """Test parsing bracket notation filter with operator."""
        params = {"name[contains]": "auth"}
        allowed_fields = ["name", "status"]

        filters = parse_filters(params, allowed_fields)

        assert len(filters) == 1
        assert filters[0].field == "name"
        assert filters[0].operator == FilterOperator.CONTAINS
        assert filters[0].value == "auth"

    def test_parse_multiple_filters(self) -> None:
        """Test parsing multiple filters with different operators."""
        params = {"name[contains]": "service", "status": "active", "created_at[gte]": "2025-01-01T00:00:00Z"}
        allowed_fields = ["name", "status", "created_at"]

        filters = parse_filters(params, allowed_fields)

        assert len(filters) == 3

        # Find each filter by field name
        name_filter = next(f for f in filters if f.field == "name")
        assert name_filter.operator == FilterOperator.CONTAINS
        assert name_filter.value == "service"

        status_filter = next(f for f in filters if f.field == "status")
        assert status_filter.operator == FilterOperator.EQ
        assert status_filter.value == "active"

        created_filter = next(f for f in filters if f.field == "created_at")
        assert created_filter.operator == FilterOperator.GTE
        assert created_filter.value == "2025-01-01T00:00:00Z"

    def test_parse_all_operators(self) -> None:
        """Test parsing filters with all supported operators."""
        params = {
            "name[eq]": "exact",
            "name[contains]": "substring",
            "name[starts_with]": "prefix",
            "created_at[gt]": "2025-01-01T00:00:00Z",
            "created_at[gte]": "2025-01-01T00:00:00Z",
            "created_at[lt]": "2025-12-31T23:59:59Z",
            "created_at[lte]": "2025-12-31T23:59:59Z",
        }
        allowed_fields = ["name", "created_at"]

        filters = parse_filters(params, allowed_fields)

        # Should have 7 filters total
        assert len(filters) == 7

        # Check each operator was parsed correctly
        operators_found = {f.operator for f in filters}
        expected_operators = {
            FilterOperator.EQ,
            FilterOperator.CONTAINS,
            FilterOperator.STARTS_WITH,
            FilterOperator.GT,
            FilterOperator.GTE,
            FilterOperator.LT,
            FilterOperator.LTE,
        }
        assert operators_found == expected_operators

    def test_parse_invalid_field_raises_error(self) -> None:
        """Test that invalid field names raise ValueError."""
        params = {"invalid_field": "value"}
        allowed_fields = ["name", "status"]

        with pytest.raises(ValueError, match="Invalid field"):
            parse_filters(params, allowed_fields)

    def test_parse_invalid_operator_raises_error(self) -> None:
        """Test that invalid operators raise ValueError."""
        params = {"name[invalid_op]": "value"}
        allowed_fields = ["name"]

        with pytest.raises(ValueError, match="Invalid operator"):
            parse_filters(params, allowed_fields)

    def test_parse_empty_params(self) -> None:
        """Test parsing empty parameters returns empty list."""
        filters = parse_filters({}, ["name", "status"])
        assert filters == []

    def test_parse_comma_separated_values(self) -> None:
        """Test parsing comma-separated values creates multiple filters."""
        params = {"status": "active,pending"}
        allowed_fields = ["status"]

        filters = parse_filters(params, allowed_fields)

        # Should create multiple filters for OR logic
        assert len(filters) == 2
        assert all(f.field == "status" for f in filters)
        assert all(f.operator == FilterOperator.EQ for f in filters)

        values = {f.value for f in filters}
        assert values == {"active", "pending"}

    def test_parse_bracket_notation_regex(self) -> None:
        """Test that bracket notation regex works correctly."""
        # Test various bracket notation formats
        test_cases = [
            ("name[eq]", "name", "eq"),
            ("created_at[gte]", "created_at", "gte"),
            ("field_name[contains]", "field_name", "contains"),
            ("id[starts_with]", "id", "starts_with"),
        ]

        for param_name, expected_field, expected_operator in test_cases:
            params = {param_name: "test_value"}
            allowed_fields = [expected_field]

            filters = parse_filters(params, allowed_fields)

            assert len(filters) == 1
            assert filters[0].field == expected_field
            assert filters[0].operator.value == expected_operator
            assert filters[0].value == "test_value"

    def test_parse_mixed_notation(self) -> None:
        """Test parsing mix of shorthand and bracket notation."""
        params = {
            "name": "exact_match",  # Shorthand
            "description[contains]": "keyword",  # Bracket notation
            "status[eq]": "active",  # Explicit equality
        }
        allowed_fields = ["name", "description", "status"]

        filters = parse_filters(params, allowed_fields)

        assert len(filters) == 3

        # Shorthand should become EQ
        name_filter = next(f for f in filters if f.field == "name")
        assert name_filter.operator == FilterOperator.EQ

        # Bracket notation should preserve operator
        desc_filter = next(f for f in filters if f.field == "description")
        assert desc_filter.operator == FilterOperator.CONTAINS

        status_filter = next(f for f in filters if f.field == "status")
        assert status_filter.operator == FilterOperator.EQ

    def test_parse_case_sensitive_operators(self) -> None:
        """Test that operator names are case-sensitive."""
        params = {"name[CONTAINS]": "value"}  # Wrong case
        allowed_fields = ["name"]

        with pytest.raises(ValueError, match="Invalid operator"):
            parse_filters(params, allowed_fields)

    def test_parse_field_validation(self) -> None:
        """Test field validation against allowed_fields list."""
        allowed_fields = ["name", "status", "created_at"]

        # Valid fields should work
        valid_params = {"name": "test", "status[eq]": "active", "created_at[gte]": "2025-01-01"}
        filters = parse_filters(valid_params, allowed_fields)
        assert len(filters) == 3

        # Invalid field should raise error
        invalid_params = {"unauthorized_field": "value"}
        with pytest.raises(ValueError, match="Invalid field: unauthorized_field"):
            parse_filters(invalid_params, allowed_fields)

    def test_parse_special_characters_in_values(self) -> None:
        """Test parsing filter values with special characters."""
        params = {
            "name[contains]": "app-v1.2.3",
            "path[starts_with]": "/api/v1/users",
            "description": "Test with spaces & symbols!",
        }
        allowed_fields = ["name", "path", "description"]

        filters = parse_filters(params, allowed_fields)

        assert len(filters) == 3

        # Values should be preserved exactly
        name_filter = next(f for f in filters if f.field == "name")
        assert name_filter.value == "app-v1.2.3"

        path_filter = next(f for f in filters if f.field == "path")
        assert path_filter.value == "/api/v1/users"

        desc_filter = next(f for f in filters if f.field == "description")
        assert desc_filter.value == "Test with spaces & symbols!"
