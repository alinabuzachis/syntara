"""Unit tests for ExpressionResolver.

This module tests the expression resolution logic used by workflows.
"""
# ruff: noqa: FBT001 - pytest.mark.parametrize passes boolean args positionally

from typing import Any
from unittest.mock import Mock

import pytest

from nexus.api.workflows.expression_resolver import ComparisonOp, ExpressionResolver
from nexus.api.workflows.models.workflow_definition import InputParameter

# Test constants
TEST_USER_ID = 123
TEST_TIMEOUT = 300
TEST_RETRY_COUNT = 3


class TestExpressionResolution:
    """Tests for basic expression resolution."""

    def test_resolve_expression_non_string(self) -> None:
        """Test resolving non-string expression returns as-is."""
        resolver = ExpressionResolver()
        workflow_state: dict[str, Any] = {}

        result = resolver.resolve_expression(TEST_USER_ID, workflow_state)
        assert result == TEST_USER_ID

    def test_resolve_expression_no_placeholder(self) -> None:
        """Test resolving expression without ${} returns as-is."""
        resolver = ExpressionResolver()
        workflow_state: dict[str, Any] = {}

        result = resolver.resolve_expression("plain text", workflow_state)
        assert result == "plain text"

    def test_resolve_expression_multiple_placeholders(self) -> None:
        """Test resolving expression with multiple ${} placeholders."""
        resolver = ExpressionResolver()
        workflow_state = {
            "inputs": {"name": "World", "greeting": "Hello"},
        }

        result = resolver.resolve_expression("${input.greeting}, ${input.name}!", workflow_state)
        assert result == "Hello, World!"

    def test_resolve_expression_invalid_reference(self) -> None:
        """Test resolving invalid expression reference returns None."""
        resolver = ExpressionResolver()
        workflow_state: dict[str, Any] = {}

        result = resolver.resolve_expression("${nonexistent.field}", workflow_state)
        assert result is None

    def test_resolve_expression_with_nested_path(self) -> None:
        """Test resolving expression with nested path navigation."""
        resolver = ExpressionResolver()
        workflow_state = {"activity_outputs": {"task1": {"items": [{"name": "first"}, {"name": "second"}]}}}

        result = resolver.resolve_expression("${task1.items}", workflow_state)
        assert isinstance(result, list)
        assert len(result) == 2


class TestConditionEvaluation:
    """Tests for condition evaluation."""

    @pytest.mark.parametrize(
        ("condition", "expected"),
        [
            ("10 > 5", True),
            ("3 < 5", True),
            ("5 >= 5", True),
            ("5 <= 10", True),
            ("'test' == 'test'", True),
            ("'test' != 'other'", True),
            ("non-empty", True),
            ("", False),
            ("10 < 5", False),
        ],
    )
    def test_evaluate_condition(self, condition: str, expected: bool) -> None:
        """Test evaluating various condition expressions."""
        resolver = ExpressionResolver()
        workflow_state: dict[str, Any] = {}

        result = resolver.evaluate_condition(condition, workflow_state)
        assert result == expected

    def test_evaluate_condition_with_variable(self) -> None:
        """Test evaluating condition with variable reference."""
        resolver = ExpressionResolver()
        workflow_state = {
            "variables": {"count": 10},
        }

        result = resolver.evaluate_condition("${variables.count} > 5", workflow_state)
        assert result is True


class TestComparisonHelpers:
    """Tests for numeric and string comparison helpers."""

    @pytest.mark.parametrize(
        ("left", "right", "op", "expected"),
        [
            ("5.0", "5", "==", True),
            ("5", "10", "!=", True),
            ("10", "5", ">", True),
            ("3", "5", "<", True),
            ("5", "5", ">=", True),
            ("3", "5", "<=", True),
        ],
    )
    def test_evaluate_numeric_comparison(self, left: str, right: str, op: ComparisonOp, expected: bool) -> None:
        """Test numeric comparison operations."""
        resolver = ExpressionResolver()

        result = resolver.evaluate_numeric_comparison(left, right, op)
        assert result == expected

    @pytest.mark.parametrize(
        ("left", "right", "op", "expected"),
        [
            ("test", "test", "==", True),
            ("test", "other", "!=", True),
            ("test", "other", ">", None),
        ],
    )
    def test_evaluate_string_comparison(self, left: str, right: str, op: ComparisonOp, expected: bool | None) -> None:
        """Test string comparison operations."""
        resolver = ExpressionResolver()

        result = resolver.evaluate_string_comparison(left, right, op)
        assert result == expected


class TestInputResolution:
    """Tests for input reference resolution."""

    def test_resolve_input_reference_basic(self) -> None:
        """Test resolving basic input reference."""
        resolver = ExpressionResolver()
        workflow_state = {"inputs": {"user_id": TEST_USER_ID}}

        result = resolver.resolve_expression("${input.user_id}", workflow_state)
        assert result == TEST_USER_ID

    def test_resolve_input_reference_nested(self) -> None:
        """Test resolving nested input reference."""
        resolver = ExpressionResolver()
        workflow_state = {"inputs": {"user": {"id": TEST_USER_ID, "name": "Alice"}}}

        result = resolver.resolve_expression("${input.user.name}", workflow_state)
        assert result == "Alice"

    def test_resolve_input_reference_with_default(self) -> None:
        """Test resolving input reference with default value."""
        # Create mock workflow definition with input defaults
        mock_input_param = Mock(spec=InputParameter)
        mock_input_param.default = "default_value"

        mock_workflow_def = Mock()
        mock_workflow_def.inputs = {"missing_field": mock_input_param}

        resolver = ExpressionResolver(mock_workflow_def)
        workflow_state: dict[str, Any] = {"inputs": {}}

        result = resolver.resolve_expression("${input.missing_field}", workflow_state)
        assert result == "default_value"


class TestVariableResolution:
    """Tests for variable reference resolution."""

    def test_resolve_variable_reference_basic(self) -> None:
        """Test resolving basic variable reference."""
        resolver = ExpressionResolver()
        workflow_state = {"variables": {"timeout": TEST_TIMEOUT}}

        result = resolver.resolve_expression("${variables.timeout}", workflow_state)
        assert result == TEST_TIMEOUT

    def test_resolve_variable_reference_nested(self) -> None:
        """Test resolving nested variable reference."""
        resolver = ExpressionResolver()
        workflow_state = {"variables": {"config": {"retry_count": TEST_RETRY_COUNT, "timeout": 60}}}

        result = resolver.resolve_expression("${variables.config.retry_count}", workflow_state)
        assert result == TEST_RETRY_COUNT


class TestActivityOutputResolution:
    """Tests for activity output reference resolution."""

    def test_resolve_activity_output_basic(self) -> None:
        """Test resolving basic activity output reference."""
        resolver = ExpressionResolver()
        workflow_state = {"activity_outputs": {"task1": {"status": "success"}}}

        result = resolver.resolve_expression("${task1.status}", workflow_state)
        assert result == "success"

    def test_resolve_activity_output_nested(self) -> None:
        """Test resolving nested activity output reference."""
        resolver = ExpressionResolver()
        workflow_state = {"activity_outputs": {"task1": {"output": {"user": {"name": "Bob"}}}}}

        result = resolver.resolve_expression("${task1.output.user.name}", workflow_state)
        assert result == "Bob"
