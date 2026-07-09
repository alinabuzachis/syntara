"""Unit tests for WorkflowVersionUpdate schema."""

import pytest
from pydantic import ValidationError

from nexus.workflows.models.workflow_version import WorkflowVersionUpdate


class TestWorkflowVersionUpdate:
    """Test WorkflowVersionUpdate request schema."""

    def test_valid_with_both_fields(self) -> None:
        update = WorkflowVersionUpdate(publish_name="Release 1.0", change_description="First release")
        assert update.publish_name == "Release 1.0"
        assert update.change_description == "First release"

    def test_valid_with_only_publish_name(self) -> None:
        update = WorkflowVersionUpdate(publish_name="Release 1.0")
        assert update.publish_name == "Release 1.0"
        assert update.change_description is None
        assert update.model_fields_set == {"publish_name"}

    def test_valid_with_only_change_description(self) -> None:
        update = WorkflowVersionUpdate(change_description="Bug fix")
        assert update.change_description == "Bug fix"
        assert update.publish_name is None
        assert update.model_fields_set == {"change_description"}

    def test_valid_empty_body(self) -> None:
        update = WorkflowVersionUpdate()
        assert update.publish_name is None
        assert update.change_description is None
        assert update.model_fields_set == set()

    def test_explicit_null_values(self) -> None:
        update = WorkflowVersionUpdate(publish_name=None, change_description=None)
        assert update.publish_name is None
        assert update.change_description is None
        assert update.model_fields_set == {"publish_name", "change_description"}

    def test_publish_name_max_length(self) -> None:
        with pytest.raises(ValidationError, match="String should have at most 255 characters"):
            WorkflowVersionUpdate(publish_name="x" * 256)

    def test_change_description_max_length(self) -> None:
        with pytest.raises(ValidationError, match="String should have at most 1024 characters"):
            WorkflowVersionUpdate(change_description="x" * 1025)

    def test_publish_name_at_max_length(self) -> None:
        update = WorkflowVersionUpdate(publish_name="x" * 255)
        assert update.publish_name is not None
        assert len(update.publish_name) == 255

    def test_change_description_at_max_length(self) -> None:
        update = WorkflowVersionUpdate(change_description="x" * 1024)
        assert update.change_description is not None
        assert len(update.change_description) == 1024

    def ***REMOVED***(self) -> None:
        update = WorkflowVersionUpdate.model_validate({"publish_name": "Name"})
        assert "publish_name" in update.model_fields_set
        assert "change_description" not in update.model_fields_set
