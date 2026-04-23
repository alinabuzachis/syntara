"""Unit tests for AgenticExecutorConfig prompt security validation.

Tests for Task 3.2 — Port agentic security validations and remove dead V1 code.

These tests verify:
- Prompt length validation against MAX_PROMPT_LENGTH
- Null byte detection in prompts
- Dead V1 code has been removed from agentic_activity module
- Dead import of resolve_config_templates has been removed
"""

import pytest
from pydantic import ValidationError

from nexus.workflows.workflow_engine import constants
from nexus.workflows.workflow_engine.models.workflow_definition import (
    AgenticExecutorConfig,
)


class TestPromptLengthValidation:
    """Tests for prompt length validation on AgenticExecutorConfig."""

    def test_prompt_at_max_length_accepted(self) -> None:
        """Prompt exactly at MAX_PROMPT_LENGTH should be accepted."""
        prompt = "a" * constants.MAX_PROMPT_LENGTH
        config = AgenticExecutorConfig(prompt=prompt)
        assert config.prompt == prompt

    def test_prompt_exceeding_max_length_rejected(self) -> None:
        """Prompt exceeding MAX_PROMPT_LENGTH should raise ValidationError."""
        prompt = "a" * (constants.MAX_PROMPT_LENGTH + 1)
        with pytest.raises(ValidationError) as exc_info:
            AgenticExecutorConfig(prompt=prompt)

        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert "maximum length" in errors[0]["msg"].lower() or "exceeds" in errors[0]["msg"].lower()

    def test_prompt_one_over_max_length_rejected(self) -> None:
        """Prompt at MAX_PROMPT_LENGTH + 1 should be rejected (boundary)."""
        prompt = "x" * (constants.MAX_PROMPT_LENGTH + 1)
        with pytest.raises(ValidationError):
            AgenticExecutorConfig(prompt=prompt)

    def test_prompt_well_under_max_length_accepted(self) -> None:
        """A short prompt should be accepted without issue."""
        config = AgenticExecutorConfig(prompt="Summarize this document")
        assert config.prompt == "Summarize this document"

    def test_prompt_error_message_includes_lengths(self) -> None:
        """Error message should report the actual and max lengths."""
        over = constants.MAX_PROMPT_LENGTH + 500
        prompt = "b" * over
        with pytest.raises(ValidationError) as exc_info:
            AgenticExecutorConfig(prompt=prompt)

        error_str = str(exc_info.value)
        assert str(over) in error_str
        assert str(constants.MAX_PROMPT_LENGTH) in error_str


class TestPromptNullByteDetection:
    """Tests for null byte detection in prompts."""

    def test_prompt_with_null_byte_rejected(self) -> None:
        """Prompt containing a null byte should raise ValidationError."""
        prompt = "Hello\0World"
        with pytest.raises(ValidationError) as exc_info:
            AgenticExecutorConfig(prompt=prompt)

        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert "null" in errors[0]["msg"].lower()

    def test_prompt_with_null_byte_at_start_rejected(self) -> None:
        """Prompt starting with a null byte should be rejected."""
        prompt = "\0Some prompt text"
        with pytest.raises(ValidationError):
            AgenticExecutorConfig(prompt=prompt)

    def test_prompt_with_null_byte_at_end_rejected(self) -> None:
        """Prompt ending with a null byte should be rejected."""
        prompt = "Some prompt text\0"
        with pytest.raises(ValidationError):
            AgenticExecutorConfig(prompt=prompt)

    def test_prompt_with_multiple_null_bytes_rejected(self) -> None:
        """Prompt with multiple null bytes should be rejected."""
        prompt = "Hello\0World\0Again"
        with pytest.raises(ValidationError):
            AgenticExecutorConfig(prompt=prompt)

    def test_prompt_without_null_bytes_accepted(self) -> None:
        """Normal prompt without null bytes should be accepted."""
        config = AgenticExecutorConfig(prompt="Normal prompt with unicode: àéîõü")
        assert "àéîõü" in config.prompt

    def test_prompt_with_other_special_chars_accepted(self) -> None:
        """Prompt with tabs, newlines, and other whitespace should be accepted."""
        prompt = "Line 1\nLine 2\tTabbed\rCarriage return"
        config = AgenticExecutorConfig(prompt=prompt)
        assert config.prompt == prompt


class TestPromptValidationPriority:
    """Tests for how prompt validation interacts with other validation."""

    def test_prompt_too_long_and_has_null_byte(self) -> None:
        """When prompt is both too long and has null bytes, it should fail validation."""
        prompt = "a" * (constants.MAX_PROMPT_LENGTH + 1) + "\0"
        with pytest.raises(ValidationError):
            AgenticExecutorConfig(prompt=prompt)

    def test_empty_string_prompt_accepted_by_security_validator(self) -> None:
        """Empty string passes security validation (no length issue, no null bytes)."""
        # The security validator itself doesn't reject empty strings
        config = AgenticExecutorConfig(prompt="")
        assert config.prompt == ""


class TestDeadV1CodeRemoval:
    """Tests verifying dead V1 code has been removed from agentic_activity."""

    def test_validate_input_data_function_removed(self) -> None:
        """_validate_input_data should no longer exist in agentic_activity module."""
        import nexus.workflows.workflow_engine.activities.agentic_activity as mod

        assert not hasattr(mod, "_validate_input_data"), "_validate_input_data should have been removed as dead V1 code"

    def test_validate_resolved_prompt_function_removed(self) -> None:
        """_validate_resolved_prompt should no longer exist in agentic_activity module."""
        import nexus.workflows.workflow_engine.activities.agentic_activity as mod

        assert not hasattr(mod, "_validate_resolved_prompt"), (
            "_validate_resolved_prompt should have been removed as dead V1 code"
        )

    def test_extract_config_function_removed(self) -> None:
        """_extract_config should no longer exist in agentic_activity module."""
        import nexus.workflows.workflow_engine.activities.agentic_activity as mod

        assert not hasattr(mod, "_extract_config"), "_extract_config should have been removed as dead V1 code"

    def test_resolve_config_templates_import_removed(self) -> None:
        """resolve_config_templates should not be imported in agentic_activity module."""
        import nexus.workflows.workflow_engine.activities.agentic_activity as mod

        assert not hasattr(mod, "resolve_config_templates"), "resolve_config_templates import should have been removed"


class TestAgenticExecutorConfigPromptValidatorIntegration:
    """Integration tests verifying the validator works with model_validate."""

    def test_prompt_validation_via_model_validate(self) -> None:
        """Prompt validation fires when using model_validate (dict input)."""
        with pytest.raises(ValidationError):
            AgenticExecutorConfig.model_validate({"prompt": "x" * (constants.MAX_PROMPT_LENGTH + 1)})

    def test_null_byte_validation_via_model_validate(self) -> None:
        """Null byte detection fires when using model_validate (dict input)."""
        with pytest.raises(ValidationError):
            AgenticExecutorConfig.model_validate({"prompt": "hello\0world"})

    def test_valid_prompt_with_all_fields_via_model_validate(self) -> None:
        """Full config with valid prompt passes validation through model_validate."""
        config = AgenticExecutorConfig.model_validate(
            {
                "prompt": "Analyze the following data",
                "agent": "analyzer",
                "model": "claude-3-5-sonnet",
                "timeout": 120,
                "file_ids": ["550e8400-e29b-41d4-a716-446655440000"],
            }
        )
        assert config.prompt == "Analyze the following data"
        assert config.agent == "analyzer"
