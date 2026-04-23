"""Unit tests for TemplateAwareBaseModel.

Tests that template expressions (${...}) bypass validation for all field types
while literal values are validated with full constraints.
"""

import pytest
from pydantic import ValidationError

from nexus.workflows.workflow_engine.models.workflow_definition import (
    AgenticExecutorConfig,
    ScriptExecutorConfig,
    ScriptLanguage,
)


class TestTemplateAwareBaseModel:
    """Test TemplateAwareBaseModel validation behavior."""

    def test_int_field_accepts_literal_template_and_rejects_invalid(self) -> None:
        """Test int field with constraints: accepts literal/template, rejects invalid."""
        # Literal value within range (ScriptExecutorConfig.timeout has ge=1, le=3600)
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code="echo test", timeout=50)
        assert config.timeout == 50

        # Template expression bypasses validation
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code="echo test", timeout="${input.timeout}")  # type: ignore[arg-type]
        assert config.timeout == "${input.timeout}"  # type: ignore[comparison-overlap]

        # Literal value exceeds maximum - rejected
        with pytest.raises(ValidationError) as exc_info:
            ScriptExecutorConfig(language=ScriptLanguage.BASH, code="echo test", timeout=5000)
        assert "less than or equal to 3600" in str(exc_info.value)

    def test_string_field_accepts_template(self) -> None:
        """Test string field accepts template expressions."""
        config = ScriptExecutorConfig(timeout=300, language="${input.lang}", code="${input.script}")  # type: ignore[arg-type]
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
        config = ScriptExecutorConfig(
            timeout=300, language=ScriptLanguage.BASH, code="echo ${input.message} and ${input.other}"
        )
        assert config.code == "echo ${input.message} and ${input.other}"

    def test_malformed_template_string_rejected(self) -> None:
        """Test that malformed template strings are treated as literals and rejected."""
        # Missing closing brace - doesn't match template pattern, fails int validation
        with pytest.raises(ValidationError) as exc_info:
            ScriptExecutorConfig(language=ScriptLanguage.BASH, code="echo test", timeout="${input.timeout")  # type: ignore[arg-type]
        assert "Input should be a valid integer" in str(exc_info.value)

    def test_invalid_type_applied_to_int_field_rejected(self) -> None:
        """Test that invalid types are rejected for int fields."""
        # List cannot be coerced to int - should be rejected
        with pytest.raises(ValidationError) as exc_info:
            ScriptExecutorConfig(language=ScriptLanguage.BASH, code="echo test", timeout=["invalid"])  # type: ignore[arg-type]
        assert "Input should be a valid integer" in str(exc_info.value)
