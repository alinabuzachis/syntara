"""YAML workflow definition validation."""

from typing import Any, ClassVar

import yaml
from pydantic import BaseModel


class ValidationError(Exception):
    """YAML validation error."""

    def __init__(self, message: str) -> None:
        """Initialize validation error.

        Args:
            message: Error message describing the validation failure

        """
        self.message = message
        super().__init__(self.message)


class WorkflowYAMLValidator:
    """Validator for workflow YAML definitions.

    This validator performs basic structural validation for Ticket 1.
    Advanced validation (JSON Schema compliance, dependency graphs) will
    be implemented in Ticket 5 (Enhanced Workflow Validation).
    """

    REQUIRED_FIELDS: ClassVar[list[str]] = ["name", "schemaVersion", "activities"]

    @classmethod
    def validate(cls, yaml_definition: str) -> tuple[dict[str, Any], str]:
        """Validate YAML workflow definition.

        This performs basic validation:
        1. Check that YAML is parseable
        2. Verify result is a dictionary
        3. Ensure required top-level keys exist

        Args:
            yaml_definition: YAML string to validate

        Returns:
            Tuple of (parsed_dict, schema_version)

        Raises:
            ValidationError: If validation fails

        Example:
            ```python
            try:
                data, schema_ver = WorkflowYAMLValidator.validate(yaml_str)
                print(f"Valid workflow with schema version {schema_ver}")
            except ValidationError as e:
                print(f"Validation failed: {e.message}")
            ```

        """
        # Check 1: YAML is parseable
        try:
            data = yaml.safe_load(yaml_definition)
        except yaml.YAMLError as e:
            msg = f"Invalid YAML syntax: {e!s}"
            raise ValidationError(msg) from e

        # Check 2: Result is a dictionary
        if not isinstance(data, dict):
            msg = f"YAML must be a dictionary, got {type(data).__name__}"
            raise ValidationError(msg)

        # Check 3: Has required top-level keys
        missing_fields = [field for field in cls.REQUIRED_FIELDS if field not in data]

        if missing_fields:
            msg = f"Missing required fields: {', '.join(missing_fields)}"
            raise ValidationError(msg)

        # Validate activities field
        if not isinstance(data["activities"], list):
            msg = "Field 'activities' must be a list"
            raise ValidationError(msg)

        # Extract schema version
        schema_version = data.get("schemaVersion", "")
        if not isinstance(schema_version, str):
            msg = "Field 'schemaVersion' must be a string"
            raise ValidationError(msg)

        return data, schema_version


class WorkflowYAMLValidationResult(BaseModel):
    """Result of YAML validation."""

    is_valid: bool
    error_message: str | None = None
    schema_version: str | None = None
    parsed_data: dict[str, Any] | None = None
