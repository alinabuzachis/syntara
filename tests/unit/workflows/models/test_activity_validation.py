"""Unit tests for Activity model type-specific field validation.

Tests the @model_validator that ensures type-specific required fields are present.
This validates the fix for the bug where @field_validator didn't catch missing fields.
"""

import pytest
from pydantic import ValidationError

from nexus.workflows.workflow_engine.models import Activity, ActivityType


class TestActivityTypeSpecificValidation:
    """Test that Activity validates type-specific required fields."""

    @pytest.mark.parametrize(
        ("activity_type", "expected_error_field"),
        [
            ("task", "task"),
            ("parallel", "branches"),
            ("sequence", "steps"),
            ("loop", "loop"),
            ("converge", "converge"),
            ("approval", "on_approved"),
        ],
    )
    def test_activity_requires_type_specific_field(self, activity_type: str, expected_error_field: str) -> None:
        """Each activity type must have its type-specific required field."""
        with pytest.raises(
            ValidationError, match=f"{expected_error_field} field is required when type='{activity_type}'"
        ):
            Activity.model_validate(
                {
                    "id": f"test_{activity_type}",
                    "type": activity_type,
                    "name": f"Test {activity_type.title()}",
                }
            )

    def test_condition_activity_requires_both_condition_and_then(self) -> None:
        """Condition activity must have both condition expression and then clause."""
        # Missing 'then'
        with pytest.raises(ValidationError, match="then field is required when type='condition'"):
            Activity.model_validate(
                {
                    "id": "test_condition",
                    "type": "condition",
                    "name": "Test Condition",
                    "condition": "true",
                }
            )

        # Missing 'condition'
        with pytest.raises(ValidationError, match="condition field is required when type='condition'"):
            Activity.model_validate(
                {
                    "id": "test_condition",
                    "type": "condition",
                    "name": "Test Condition",
                    "then": [
                        {
                            "id": "step1",
                            "type": "task",
                            "name": "Step 1",
                            "task": {"executor": "script", "config": {"language": "bash", "code": "echo 1"}},
                        }
                    ],
                }
            )

    @pytest.mark.parametrize(
        ("activity_type", "type_specific_field", "field_value"),
        [
            (
                "task",
                "task",
                {"executor": "script", "config": {"language": "bash", "code": "echo test"}},
            ),
            (
                "parallel",
                "branches",
                [
                    {
                        "id": "branch1",
                        "type": "task",
                        "name": "Branch 1",
                        "task": {"executor": "script", "config": {"language": "bash", "code": "echo 1"}},
                    },
                    {
                        "id": "branch2",
                        "type": "task",
                        "name": "Branch 2",
                        "task": {"executor": "script", "config": {"language": "bash", "code": "echo 2"}},
                    },
                ],
            ),
            (
                "sequence",
                "steps",
                [
                    {
                        "id": "step1",
                        "type": "task",
                        "name": "Step 1",
                        "task": {"executor": "script", "config": {"language": "bash", "code": "echo 1"}},
                    },
                ],
            ),
            (
                "loop",
                "loop",
                {
                    "type": "forEach",
                    "items": "${input.items}",
                    "do": [
                        {
                            "id": "loop_step",
                            "type": "task",
                            "name": "Loop Step",
                            "task": {"executor": "script", "config": {"language": "bash", "code": "echo ${item}"}},
                        },
                    ],
                },
            ),
            (
                "converge",
                "converge",
                {"branches": ["branch1", "branch2"], "strategy": "all"},
            ),
            (
                "approval",
                "onApproved",
                [
                    {
                        "id": "approved_step",
                        "type": "task",
                        "name": "Approved Step",
                        "task": {"executor": "script", "config": {"language": "bash", "code": "echo approved"}},
                    },
                ],
            ),
        ],
    )
    def test_activity_with_required_field_succeeds(
        self,
        activity_type: str,
        type_specific_field: str,
        field_value: dict[str, object] | list[object],
    ) -> None:
        """Activity with required type-specific field validates successfully."""
        activity_data = {
            "id": f"test_{activity_type}",
            "type": activity_type,
            "name": f"Test {activity_type.title()}",
            type_specific_field: field_value,
        }

        activity = Activity.model_validate(activity_data)
        assert activity.type.value == activity_type
        assert getattr(activity, type_specific_field.replace("onApproved", "on_approved")) is not None

    def test_condition_activity_with_both_fields_succeeds(self) -> None:
        """Condition activity with condition and then validates successfully."""
        activity = Activity.model_validate(
            {
                "id": "test_condition",
                "type": "condition",
                "name": "Test Condition",
                "condition": "true",
                "then": [
                    {
                        "id": "step1",
                        "type": "task",
                        "name": "Step 1",
                        "task": {"executor": "script", "config": {"language": "bash", "code": "echo 1"}},
                    },
                ],
            }
        )
        assert activity.type == ActivityType.CONDITION
        assert activity.condition == "true"
        assert activity.then is not None

    def test_approval_activity_optional_fields(self) -> None:
        """Approval activity onRejected field is optional."""
        # With onRejected
        activity_with_rejected = Activity.model_validate(
            {
                "id": "test_approval",
                "type": "approval",
                "name": "Test Approval",
                "onApproved": [
                    {
                        "id": "approved_step",
                        "type": "task",
                        "name": "Approved Step",
                        "task": {"executor": "script", "config": {"language": "bash", "code": "echo approved"}},
                    },
                ],
                "onRejected": [
                    {
                        "id": "rejected_step",
                        "type": "task",
                        "name": "Rejected Step",
                        "task": {"executor": "script", "config": {"language": "bash", "code": "echo rejected"}},
                    },
                ],
            }
        )
        assert activity_with_rejected.on_approved is not None
        assert activity_with_rejected.on_rejected is not None

        # Without onRejected
        activity_without_rejected = Activity.model_validate(
            {
                "id": "test_approval",
                "type": "approval",
                "name": "Test Approval",
                "onApproved": [
                    {
                        "id": "approved_step",
                        "type": "task",
                        "name": "Approved Step",
                        "task": {"executor": "script", "config": {"language": "bash", "code": "echo approved"}},
                    },
                ],
            }
        )
        assert activity_without_rejected.on_approved is not None
        assert activity_without_rejected.on_rejected is None
