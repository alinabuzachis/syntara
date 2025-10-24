"""Unit tests for WorkflowDefinitionValidator."""

import json

import pytest

from nexus.api.validators.workflow_definition import ValidationError, WorkflowDefinitionValidator
from nexus.workflows.workflow_engine.models import WorkflowDefinition


class TestWorkflowDefinitionValidator:
    """Test suite for WorkflowDefinitionValidator.

    Note: The validator only accepts dict or WorkflowDefinition objects.
    """

    def test_validate_dict_input_success(self) -> None:
        """Test validation with valid dict input."""
        workflow_dict_input = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "test-workflow", "description": "Test workflow"},
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "test_activity",
                        "name": "Test Activity",
                        "type": "task",
                        "task": {
                            "executor": "script",
                            "config": {"language": "python", "code": "print('hello')"},
                        },
                    }
                ]
            },
        }

        workflow_def, schema_version, workflow_dict = WorkflowDefinitionValidator.validate(workflow_dict_input)

        # Verify return types
        assert isinstance(workflow_def, WorkflowDefinition)
        assert isinstance(schema_version, str)
        assert isinstance(workflow_dict, dict)

        # Verify content
        assert schema_version == "1.0.0"
        assert workflow_dict["metadata"]["name"] == "test-workflow"

    def test_validate_workflow_definition_object_success(self) -> None:
        """Test validation with WorkflowDefinition object input."""
        workflow_dict_input = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "test-workflow", "description": "Test workflow"},
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "test_activity",
                        "name": "Test Activity",
                        "type": "task",
                        "task": {
                            "executor": "script",
                            "config": {"language": "python", "code": "print('hello')"},
                        },
                    }
                ]
            },
        }

        # Create WorkflowDefinition object
        workflow_def_input = WorkflowDefinition.model_validate(workflow_dict_input)

        # Validate it
        workflow_def, schema_version, workflow_dict = WorkflowDefinitionValidator.validate(workflow_def_input)

        # Verify return types
        assert isinstance(workflow_def, WorkflowDefinition)
        assert isinstance(schema_version, str)
        assert isinstance(workflow_dict, dict)

        # Verify it's the same object
        assert workflow_def == workflow_def_input
        assert schema_version == "1.0.0"

    def test_validate_missing_required_field(self) -> None:
        """Test validation with missing required field."""
        workflow_dict = {
            "schemaVersion": "1.0.0",
            "version": 1,
            # Missing metadata
            "triggers": [{"type": "manual"}],
            "workflow": {"activities": []},
        }

        with pytest.raises(ValidationError) as exc_info:
            WorkflowDefinitionValidator.validate(workflow_dict)

        assert "Workflow definition validation failed" in str(exc_info.value.message)
        assert "metadata" in str(exc_info.value.message).lower()

    def test_validate_invalid_schema_version(self) -> None:
        """Test validation with invalid schema version format."""
        workflow_dict = {
            "schemaVersion": "invalid-version",
            "version": 1,
            "metadata": {"name": "test-workflow", "description": "Test workflow"},
            "triggers": [{"type": "manual"}],
            "workflow": {"activities": []},
        }

        with pytest.raises(ValidationError) as exc_info:
            WorkflowDefinitionValidator.validate(workflow_dict)

        assert "Workflow definition validation failed" in str(exc_info.value.message)

    def test_validate_invalid_activity_type(self) -> None:
        """Test validation with invalid activity structure."""
        workflow_dict = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "test-workflow", "description": "Test workflow"},
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "test_activity",
                        "name": "Test Activity",
                        "type": "task",
                        "task": {
                            "executor": "script",
                            # Missing required config field
                        },
                    }
                ]
            },
        }

        with pytest.raises(ValidationError) as exc_info:
            WorkflowDefinitionValidator.validate(workflow_dict)

        assert "Workflow definition validation failed" in str(exc_info.value.message)

    def test_validate_dict_is_jsonb_compatible(self) -> None:
        """Test that returned dict is compatible with PostgreSQL JSONB."""
        workflow_dict_input = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "test-workflow", "description": "Test workflow"},
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "test_activity",
                        "name": "Test Activity",
                        "type": "task",
                        "task": {
                            "executor": "script",
                            "config": {"language": "python", "code": "print('hello')"},
                        },
                    }
                ]
            },
        }

        _, _, workflow_dict = WorkflowDefinitionValidator.validate(workflow_dict_input)

        # Verify dict can be serialized to JSON (required for JSONB)
        json_str = json.dumps(workflow_dict)
        assert json_str is not None

        # Verify it can be deserialized back
        deserialized = json.loads(json_str)
        assert deserialized["schemaVersion"] == "1.0.0"
        assert deserialized["metadata"]["name"] == "test-workflow"

    def test_validate_preserves_nested_structure(self) -> None:
        """Test that validation preserves complex nested structures."""
        workflow_dict_input = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {
                "name": "complex-workflow",
                "description": "Test workflow",
                "tags": ["test", "platform"],
                "owner": "platform-team",
            },
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "activity1",
                        "name": "Activity 1",
                        "type": "task",
                        "task": {
                            "executor": "script",
                            "config": {
                                "language": "python",
                                "code": "print('hello')",
                                "environment": {"VAR1": "value1", "VAR2": "value2"},
                            },
                        },
                    }
                ]
            },
        }

        _, _, workflow_dict = WorkflowDefinitionValidator.validate(workflow_dict_input)

        # Verify nested structures are preserved
        assert workflow_dict["metadata"]["tags"] == ["test", "platform"]
        assert workflow_dict["metadata"]["owner"] == "platform-team"
        assert workflow_dict["workflow"]["activities"][0]["task"]["config"]["environment"]["VAR1"] == "value1"

    def test_validate_multiple_activities(self) -> None:
        """Test validation with multiple activities."""
        workflow_dict_input = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "multi-activity-workflow", "description": "Test workflow"},
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "activity1",
                        "name": "Activity 1",
                        "type": "task",
                        "task": {
                            "executor": "script",
                            "config": {"language": "python", "code": "print('1')"},
                        },
                    },
                    {
                        "id": "activity2",
                        "name": "Activity 2",
                        "type": "task",
                        "task": {
                            "executor": "script",
                            "config": {"language": "python", "code": "print('2')"},
                        },
                    },
                ]
            },
        }

        _, _, workflow_dict = WorkflowDefinitionValidator.validate(workflow_dict_input)

        # Verify all activities are present
        assert len(workflow_dict["workflow"]["activities"]) == 2
        assert workflow_dict["workflow"]["activities"][0]["id"] == "activity1"
        assert workflow_dict["workflow"]["activities"][1]["id"] == "activity2"
