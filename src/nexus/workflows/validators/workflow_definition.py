"""Workflow definition validation."""

from typing import Any

from pydantic import BaseModel
from pydantic import ValidationError as PydanticValidationError

from nexus.workflows.exceptions import WorkflowValidationError
from nexus.workflows.workflow_engine.models import WorkflowDefinition


class WorkflowDefinitionValidator:
    """Validator for workflow definitions using Pydantic models.

    This validator validates workflow definition objects against the WorkflowDefinition
    Pydantic model, which enforces the schema defined in workflow-definition.schema.json.
    """

    @classmethod
    def validate(
        cls, workflow_definition: dict[str, Any] | WorkflowDefinition
    ) -> tuple[WorkflowDefinition, str, dict[str, Any]]:
        """Validate workflow definition and return as dict for JSONB storage.

        Accepts workflow definitions as:
        - Dict (from JSON - parsing happens at API layer)
        - WorkflowDefinition object (already validated)

        This performs full validation using the Pydantic WorkflowDefinition model:
        1. Validates structure and required fields
        2. Validates types and constraints
        3. Validates conditional requirements (e.g., task field for type=task)
        4. Returns validated dict for JSONB storage with camelCase keys

        Args:
            workflow_definition: Workflow definition as dict or WorkflowDefinition object

        Returns:
            Tuple of (validated WorkflowDefinition object, schema_version, workflow_dict)
            The workflow_dict can be stored directly in JSONB column.

        Raises:
            WorkflowValidationError: If validation fails

        Example:
            ```python
            try:
                # From dict
                workflow_def, schema_ver, workflow_dict = WorkflowDefinitionValidator.validate(workflow_dict)
                # Store workflow_dict in database JSONB column
            except WorkflowValidationError as e:
                print(f"Validation failed: {e.message}")
            ```

        """
        # Already validated WorkflowDefinition object
        if isinstance(workflow_definition, WorkflowDefinition):
            validated = workflow_definition
            workflow_dict = validated.model_dump(mode="json", exclude_none=True, by_alias=True)
            return validated, validated.schema_version, workflow_dict

        # Dict input - validate it
        workflow_data = workflow_definition

        # Validate using Pydantic model
        try:
            validated = WorkflowDefinition.model_validate(workflow_data)
        except PydanticValidationError as e:
            # Convert Pydantic validation error to our ValidationError
            error_messages = []
            for error in e.errors():
                loc = " -> ".join(str(x) for x in error["loc"])
                msg = error["msg"]
                error_messages.append(f"{loc}: {msg}")

            full_message = "Workflow definition validation failed:\n" + "\n".join(error_messages)
            raise WorkflowValidationError(full_message) from e

        # Convert validated model to dict for JSONB storage
        # SQLAlchemy will automatically serialize this dict to JSONB
        # Use by_alias=True to output camelCase keys matching the schema
        workflow_dict = validated.model_dump(mode="json", exclude_none=True, by_alias=True)

        return validated, validated.schema_version, workflow_dict


class WorkflowDefinitionValidationResult(BaseModel):
    """Result of workflow definition validation."""

    is_valid: bool
    error_message: str | None = None
    schema_version: str | None = None
    parsed_data: dict[str, Any] | None = None
