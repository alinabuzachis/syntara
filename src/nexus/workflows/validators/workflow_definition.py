"""Validation class for V2 workflow definitions.

This module provides a validator class for workflow definitions,
metadata, and structure validation.
"""

from typing import Any

from nexus.core.exceptions import SafeValueError


class WorkflowValidator:
    """Validator for V2 workflows and metadata.

    This class provides validation methods for workflow definitions and metadata.
    The main entry point is validate_workflow_definition() which runs all checks.
    """

    def validate_workflow_definition(self, workflow_definition: dict[str, Any]) -> None:
        """Run all validation checks on workflow definition.

        This is the main validation entry point that calls all individual
        validation methods for workflow structure.

        Args:
            workflow_definition: Workflow definition dictionary to validate

        Raises:
            SafeValueError: If schema_version is not 2.0.0 or required fields are missing

        """
        self._validate_schema_version(workflow_definition)
        self._validate_required_fields(workflow_definition)

    def validate_workflow_name(self, name: str) -> None:
        """Validate workflow name is not empty.

        Args:
            name: Workflow name to validate

        Raises:
            SafeValueError: If name is empty

        """
        if not name:
            msg = "Workflow name cannot be empty"
            raise SafeValueError(msg)

    def _validate_schema_version(self, workflow_definition: dict[str, Any]) -> None:
        """Validate schema version is 2.0.0.

        Args:
            workflow_definition: Workflow definition dictionary

        Raises:
            SafeValueError: If schema_version is not 2.0.0

        """
        schema_version = workflow_definition.get("schema_version")
        if schema_version != "2.0.0":
            msg = (
                f"Unsupported schema_version: {schema_version}. Only V2 workflows (schema_version=2.0.0) are supported."
            )
            raise SafeValueError(msg)

    def _validate_required_fields(self, workflow_definition: dict[str, Any]) -> None:
        """Validate required fields are present.

        Args:
            workflow_definition: Workflow definition dictionary

        Raises:
            SafeValueError: If required fields are missing

        """
        if "triggers" not in workflow_definition:
            msg = "V2 workflow must have 'triggers' field"
            raise SafeValueError(msg)

        if "nodes" not in workflow_definition:
            msg = "V2 workflow must have 'nodes' field"
            raise SafeValueError(msg)

        if "edges" not in workflow_definition:
            msg = "V2 workflow must have 'edges' field"
            raise SafeValueError(msg)
