"""Unit tests for TemplateAwareBaseModel.

Tests that template expressions (${...}) bypass validation for all field types
while literal values are validated with full constraints.
"""

import pytest
from pydantic import ValidationError

from nexus.workflows.workflow_engine.models.workflow_definition import (
    AgenticExecutorConfig,
    RetryPolicy,
    ScriptExecutorConfig,
)


class TestTemplateAwareBaseModel:
    """Test TemplateAwareBaseModel validation behavior."""

    def test_int_field_accepts_literal_template_and_rejects_invalid(self) -> None:
        """Test int field with constraints: accepts literal/template, rejects invalid."""
        # Literal value within range
        policy = RetryPolicy(maxAttempts=50)
        assert policy.max_attempts == 50

        # Template expression bypasses validation
        policy = RetryPolicy(maxAttempts="${input.retries}")  # type: ignore[arg-type]
        assert policy.max_attempts == "${input.retries}"  # type: ignore[comparison-overlap]

        # Literal value exceeds maximum - rejected
        with pytest.raises(ValidationError) as exc_info:
            RetryPolicy(maxAttempts=150)
        assert "less than or equal to 100" in str(exc_info.value)

    def test_float_field_accepts_literal_template_and_rejects_invalid(self) -> None:
        """Test float field with constraints: accepts literal/template, rejects invalid."""
        # Literal value within range
        policy = RetryPolicy(multiplier=2.5)
        assert policy.multiplier == pytest.approx(2.5)

        # Template expression bypasses validation
        policy = RetryPolicy(multiplier="${input.mult}")  # type: ignore[arg-type]
        assert policy.multiplier == "${input.mult}"  # type: ignore[comparison-overlap]

        # Literal value exceeds maximum - rejected
        with pytest.raises(ValidationError) as exc_info:
            RetryPolicy(multiplier=15.0)
        assert "less than or equal to 10" in str(exc_info.value)

    def test_string_field_accepts_template(self) -> None:
        """Test string field accepts template expressions."""
        config = ScriptExecutorConfig(language="${input.lang}", code="${input.script}")  # type: ignore[arg-type]
        assert config.language == "${input.lang}"
        assert config.code == "${input.script}"

    def test_multiple_fields_with_mixed_values(self) -> None:
        """Test multiple fields can mix literal and template values."""
        config = AgenticExecutorConfig(
            prompt="Analyze this data",  # Literal
            agent="${input.agent}",  # Template
            timeout=300,  # Literal int
        )
        assert config.prompt == "Analyze this data"
        assert config.agent == "${input.agent}"
        assert config.timeout == 300

        # Template in constrained field bypasses validation
        config2 = AgenticExecutorConfig(
            prompt="${input.prompt}",
            timeout="${input.timeout}",  # type: ignore[arg-type]  # Would fail if literal > 3600
        )
        assert config2.timeout == "${input.timeout}"  # type: ignore[comparison-overlap]

    def test_mixed_template_expressions_in_single_value(self) -> None:
        """Test that values containing ${...} are treated as templates."""
        # Partial template (mixed with literal text)
        config = ScriptExecutorConfig(language="bash", code="echo ${input.message} and ${input.other}")  # type: ignore[arg-type]
        assert config.code == "echo ${input.message} and ${input.other}"

    def test_malformed_template_string_rejected(self) -> None:
        """Test that malformed template strings are treated as literals and rejected."""
        # Missing closing brace - doesn't match template pattern, fails int validation
        with pytest.raises(ValidationError) as exc_info:
            RetryPolicy(maxAttempts="${input.retries")  # type: ignore[arg-type]
        assert "Input should be a valid integer" in str(exc_info.value)

    def test_invalid_type_applied_to_int_field_rejected(self) -> None:
        """Test that invalid types are rejected for int fields."""
        # List cannot be coerced to int - should be rejected
        with pytest.raises(ValidationError) as exc_info:
            RetryPolicy(maxAttempts=["invalid"])  # type: ignore[arg-type]
        assert "Input should be a valid integer" in str(exc_info.value)
