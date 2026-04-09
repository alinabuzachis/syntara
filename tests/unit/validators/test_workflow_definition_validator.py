"""Tests for WorkflowValidator."""

from typing import Any

import pytest

from nexus.core.exceptions import SafeValueError
from nexus.workflows.validators.workflow_definition import WorkflowValidator


@pytest.fixture
def validator() -> WorkflowValidator:
    """Create a WorkflowValidator instance."""
    return WorkflowValidator()


def _valid_definition() -> dict[str, Any]:
    return {
        "schema_version": "2.0.0",
        "triggers": [{"type": "manual_trigger"}],
        "nodes": [{"id": "n1", "type": "action"}],
        "edges": [{"from": "t1", "to": "n1"}],
    }


class TestValidWorkflowDefinition:
    """Valid V2 workflow definition passes validation."""

    def test_valid_definition_passes(self, validator: WorkflowValidator) -> None:
        validator.validate_workflow_definition(_valid_definition())

    def test_minimal_valid_definition(self, validator: WorkflowValidator) -> None:
        definition = {"schema_version": "2.0.0", "triggers": [], "nodes": [], "edges": []}
        validator.validate_workflow_definition(definition)


class TestMissingSchemaVersion:
    """Missing or wrong schema_version."""

    def test_missing_schema_version_raises(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {"triggers": [], "nodes": [], "edges": []}
        with pytest.raises(SafeValueError, match="Unsupported schema_version"):
            validator.validate_workflow_definition(definition)

    def test_wrong_schema_version_raises(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {"schema_version": "1.0.0", "triggers": [], "nodes": [], "edges": []}
        with pytest.raises(SafeValueError, match="Unsupported schema_version"):
            validator.validate_workflow_definition(definition)

    def test_none_schema_version_raises(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {"schema_version": None, "triggers": [], "nodes": [], "edges": []}
        with pytest.raises(SafeValueError):
            validator.validate_workflow_definition(definition)


class TestMissingRequiredFields:
    """Missing triggers, nodes, or edges fields."""

    def test_missing_triggers_raises(self, validator: WorkflowValidator) -> None:
        definition = {"schema_version": "2.0.0", "nodes": [], "edges": []}
        with pytest.raises(SafeValueError, match="triggers"):
            validator.validate_workflow_definition(definition)

    def test_missing_nodes_raises(self, validator: WorkflowValidator) -> None:
        definition = {"schema_version": "2.0.0", "triggers": [], "edges": []}
        with pytest.raises(SafeValueError, match="nodes"):
            validator.validate_workflow_definition(definition)

    def test_missing_edges_raises(self, validator: WorkflowValidator) -> None:
        definition = {"schema_version": "2.0.0", "triggers": [], "nodes": []}
        with pytest.raises(SafeValueError, match="edges"):
            validator.validate_workflow_definition(definition)


class TestWorkflowNameValidation:
    """Workflow name validation."""

    def test_valid_name_passes(self, validator: WorkflowValidator) -> None:
        validator.validate_workflow_name("my-workflow")

    def test_empty_name_raises(self, validator: WorkflowValidator) -> None:
        with pytest.raises(SafeValueError, match="cannot be empty"):
            validator.validate_workflow_name("")

    def test_whitespace_only_name_passes(self, validator: WorkflowValidator) -> None:
        """Non-empty string with whitespace is accepted (not stripped)."""
        validator.validate_workflow_name("  ")


class TestEmptyDefinition:
    """Completely empty definition dict."""

    def test_empty_dict_raises_on_schema_version(self, validator: WorkflowValidator) -> None:
        with pytest.raises(SafeValueError, match="Unsupported schema_version"):
            validator.validate_workflow_definition({})


class TestValidationOrder:
    """Schema version is validated before required fields."""

    def test_bad_version_with_missing_fields_raises_version_error(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {"schema_version": "1.0.0"}
        with pytest.raises(SafeValueError, match="Unsupported schema_version"):
            validator.validate_workflow_definition(definition)


class TestExtraFieldsAccepted:
    """Extra fields in the definition do not cause errors."""

    def test_extra_fields_pass(self, validator: WorkflowValidator) -> None:
        definition = {
            "schema_version": "2.0.0",
            "triggers": [],
            "nodes": [],
            "edges": [],
            "description": "some workflow",
            "metadata": {"author": "test"},
        }
        validator.validate_workflow_definition(definition)


class TestSchemaVersionVariants:
    """Various schema_version format edge cases."""

    def test_version_2_0_without_patch_raises(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {"schema_version": "2.0", "triggers": [], "nodes": [], "edges": []}
        with pytest.raises(SafeValueError, match="Unsupported schema_version"):
            validator.validate_workflow_definition(definition)

    def test_version_3_0_0_raises(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {"schema_version": "3.0.0", "triggers": [], "nodes": [], "edges": []}
        with pytest.raises(SafeValueError, match="Unsupported schema_version"):
            validator.validate_workflow_definition(definition)

    def test_integer_version_raises(self, validator: WorkflowValidator) -> None:
        definition: dict[str, Any] = {"schema_version": 2, "triggers": [], "nodes": [], "edges": []}
        with pytest.raises(SafeValueError, match="Unsupported schema_version"):
            validator.validate_workflow_definition(definition)
