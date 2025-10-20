"""Expression resolver for workflow variables and outputs.

This module provides expression resolution for workflow definitions, supporting
references to inputs, variables, activity outputs, and loop iteration variables.
"""

import re
from typing import Any, Literal, cast

from nexus.workflows.models.workflow_definition import WorkflowDefinition

# Type alias for comparison operators
ComparisonOp = Literal["==", "!=", ">=", "<=", ">", "<"]

# Supported comparison operators
SUPPORTED_OPERATORS: set[str] = {"==", "!=", ">=", "<=", ">", "<"}

# Minimum parts required for condition expression parsing
MIN_CONDITION_PARTS = 2


class ExpressionResolver:
    """Resolves ${...} expressions in workflow definitions.

    Supports:
    - ${input.field_name} - workflow inputs
    - ${variables.var_name} - workflow variables
    - ${activity_id.field} - activity outputs (direct field access)
    - ${activity_id.output.field} - activity outputs (via output key)
    - ${iteration_index} - loop iteration index
    - ${item} - forEach current item
    """

    def __init__(self, workflow_definition: WorkflowDefinition | None = None) -> None:
        """Initialize expression resolver.

        Args:
            workflow_definition: Optional workflow definition for accessing input defaults

        """
        self.workflow_definition = workflow_definition

    def resolve_expression(self, expression: object, workflow_state: dict[str, Any]) -> object:
        """Resolve ${...} expressions in a value.

        Args:
            expression: Expression to resolve
            workflow_state: Current workflow state

        Returns:
            Resolved value

        """
        if not isinstance(expression, str):
            return expression

        # If no ${...} pattern, return as-is
        if "${" not in expression:
            return expression

        # Extract expression content
        pattern = r"\$\{([^}]+)\}"
        matches = re.findall(pattern, expression)

        if not matches:
            return expression

        # For single expression that matches entire string, return resolved value directly
        if len(matches) == 1 and expression == f"${{{matches[0]}}}":
            return self._resolve_single_expression(matches[0], workflow_state)

        # Multiple expressions - replace each in string
        result = expression
        for expr in matches:
            resolved = self._resolve_single_expression(expr, workflow_state)
            result = result.replace(f"${{{expr}}}", str(resolved))

        return result

    def evaluate_condition(self, condition: str, workflow_state: dict[str, Any]) -> bool:
        """Evaluate a conditional expression.

        Supports simple comparisons:
        - ${activity.output.field} == "value"
        - ${activity.output.status} != 0
        - ${activity.output.count} > 5

        Args:
            condition: Condition expression
            workflow_state: Current workflow state

        Returns:
            True if condition evaluates to true

        """
        # Resolve any ${...} expressions first
        resolved_condition = self.resolve_expression(condition, workflow_state)

        # If condition is already a boolean, return it
        if isinstance(resolved_condition, bool):
            return resolved_condition

        # Simple string-based evaluation for common patterns
        if isinstance(resolved_condition, str):
            # Handle comparison operators
            for op in SUPPORTED_OPERATORS:
                if op in resolved_condition:
                    parts = resolved_condition.split(op, 1)
                    if len(parts) != MIN_CONDITION_PARTS:
                        continue

                    left = parts[0].strip().strip("'\"")
                    right = parts[1].strip().strip("'\"")

                    # Validate operator is in supported set before casting
                    if op not in SUPPORTED_OPERATORS:
                        continue

                    # Cast op since we know it's from our literal list
                    typed_op = cast("ComparisonOp", op)

                    # Try numeric comparison first
                    try:
                        return self.evaluate_numeric_comparison(left, right, typed_op)
                    except ValueError:
                        # Fall back to string comparison
                        result = self.evaluate_string_comparison(left, right, typed_op)
                        if result is not None:
                            return result

            # If no operators, treat as truthy check
            return bool(resolved_condition)

        # Default to truthy evaluation
        return bool(resolved_condition)

    def evaluate_numeric_comparison(self, left: str, right: str, op: ComparisonOp) -> bool:
        """Evaluate numeric comparison.

        Args:
            left: Left operand
            right: Right operand
            op: Comparison operator

        Returns:
            Result of numeric comparison

        """
        left_num = float(left)
        right_num = float(right)
        if op == "==":
            return left_num == right_num
        if op == "!=":
            return left_num != right_num
        if op == ">":
            return left_num > right_num
        if op == "<":
            return left_num < right_num
        if op == ">=":
            return left_num >= right_num
        return left_num <= right_num

    def evaluate_string_comparison(self, left: str, right: str, op: ComparisonOp) -> bool | None:
        """Evaluate string comparison.

        Args:
            left: Left operand
            right: Right operand
            op: Comparison operator

        Returns:
            Result of string comparison or None if operator not supported

        """
        if op == "==":
            return left == right
        if op == "!=":
            return left != right
        return None

    def _resolve_single_expression(self, expr: str, workflow_state: dict[str, Any]) -> object:
        """Resolve a single expression path.

        Args:
            expr: Expression path (e.g., "input.field" or "activity.output.field")
            workflow_state: Current workflow state

        Returns:
            Resolved value

        """
        parts = expr.split(".")

        # Handle input references
        if parts[0] == "input":
            return self._resolve_input_reference(parts, workflow_state)

        # Handle variable references
        if parts[0] == "variables":
            return self._resolve_variable_reference(parts, workflow_state)

        # Handle special loop variables
        if expr in workflow_state:
            return workflow_state[expr]

        # Handle activity output references
        if parts[0] in workflow_state.get("activity_outputs", {}):
            return self._resolve_activity_output(parts, workflow_state)

        return None

    def _navigate_nested_path(self, value: object, parts: list[str]) -> object:
        """Navigate through nested dict/list structure.

        Args:
            value: Starting value
            parts: List of path parts to navigate

        Returns:
            Value at nested path or None

        """
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            elif isinstance(value, list) and part.isdigit():
                value = value[int(part)]
            else:
                return None
        return value

    def _resolve_input_reference(self, parts: list[str], workflow_state: dict[str, Any]) -> object:
        """Resolve input reference expression.

        Args:
            parts: Expression parts (e.g., ['input', 'field_name'])
            workflow_state: Current workflow state

        Returns:
            Resolved input value or default

        """
        value = workflow_state.get("inputs", {})
        value = self._navigate_nested_path(value, parts[1:])

        # If value is None, check for default in workflow definition
        if value is None and len(parts) >= MIN_CONDITION_PARTS:
            input_name = parts[1]
            if (
                self.workflow_definition
                and hasattr(self.workflow_definition, "inputs")
                and self.workflow_definition.inputs
            ):
                input_param = self.workflow_definition.inputs.get(input_name)
                if input_param and input_param.default is not None:
                    value = input_param.default

        return value

    def _resolve_variable_reference(self, parts: list[str], workflow_state: dict[str, Any]) -> object:
        """Resolve variable reference expression.

        Args:
            parts: Expression parts (e.g., ['variables', 'var_name'])
            workflow_state: Current workflow state

        Returns:
            Resolved variable value

        """
        value = workflow_state.get("variables", {})
        return self._navigate_nested_path(value, parts[1:])

    def _resolve_activity_output(self, parts: list[str], workflow_state: dict[str, Any]) -> object:
        """Resolve activity output reference.

        Args:
            parts: Expression parts (e.g., ['activity_id', 'output', 'field'])
            workflow_state: Current workflow state

        Returns:
            Resolved activity output value

        """
        activity_id = parts[0]
        value = workflow_state["activity_outputs"][activity_id]
        return self._navigate_nested_path(value, parts[1:])
