"""Tests for condition activity."""

from unittest.mock import patch

import pytest

from nexus.workflows.workflow_engine.activities.condition import condition


class TestConditionTrueEvaluation:
    """Condition evaluates to true."""

    @pytest.mark.asyncio
    async def test_true_literal_returns_true_port(self) -> None:
        result = await condition({"condition": "True", "namespace": {}}, None)
        assert result["control"]["next_port"] == "true"

    @pytest.mark.asyncio
    async def test_true_literal_output_status_completed(self) -> None:
        result = await condition({"condition": "True", "namespace": {}}, None)
        assert result["output"]["status"] == "completed"
        assert result["output"]["evaluated_result"] is True

    @pytest.mark.asyncio
    async def test_comparison_true(self) -> None:
        result = await condition({"condition": "5 > 3", "namespace": {}}, None)
        assert result["control"]["next_port"] == "true"
        assert result["output"]["evaluated_result"] is True


class TestConditionFalseEvaluation:
    """Condition evaluates to false."""

    @pytest.mark.asyncio
    async def test_false_literal_returns_false_port(self) -> None:
        result = await condition({"condition": "False", "namespace": {}}, None)
        assert result["control"]["next_port"] == "false"

    @pytest.mark.asyncio
    async def test_false_literal_output_status_completed(self) -> None:
        result = await condition({"condition": "False", "namespace": {}}, None)
        assert result["output"]["status"] == "completed"
        assert result["output"]["evaluated_result"] is False

    @pytest.mark.asyncio
    async def test_comparison_false(self) -> None:
        result = await condition({"condition": "3 > 5", "namespace": {}}, None)
        assert result["control"]["next_port"] == "false"
        assert result["output"]["evaluated_result"] is False


class TestConditionMissingConfig:
    """Missing condition expression returns error."""

    @pytest.mark.asyncio
    async def test_empty_condition_returns_failed(self) -> None:
        result = await condition({"condition": "", "namespace": {}}, None)
        assert result["output"]["status"] == "failed"
        assert result["output"]["error"]["type"] == "ConfigurationError"

    @pytest.mark.asyncio
    async def test_missing_condition_key_returns_failed(self) -> None:
        result = await condition({"namespace": {}}, None)
        assert result["output"]["status"] == "failed"
        assert "Missing 'condition'" in result["output"]["error"]["message"]

    @pytest.mark.asyncio
    async def test_missing_condition_has_no_control(self) -> None:
        result = await condition({"namespace": {}}, None)
        assert "control" not in result


class TestConditionEvaluationFailure:
    """Condition evaluation raises an exception."""

    @pytest.mark.asyncio
    async def test_invalid_expression_returns_failed(self) -> None:
        with patch(
            "nexus.workflows.workflow_engine.activities.condition.safe_eval_with_namespace",
            side_effect=ValueError("bad expression"),
        ):
            result = await condition({"condition": "bad_expr", "namespace": {}}, None)
        assert result["output"]["status"] == "failed"
        assert result["output"]["error"]["type"] == "ConditionEvaluationError"

    @pytest.mark.asyncio
    async def test_evaluation_error_has_no_control(self) -> None:
        """ValueError from evaluation should return failed result without control key."""
        with patch(
            "nexus.workflows.workflow_engine.activities.condition.safe_eval_with_namespace",
            side_effect=ValueError("invalid expression"),
        ):
            result = await condition({"condition": "x", "namespace": {}}, None)
        assert "control" not in result

    @pytest.mark.asyncio
    async def test_uncaught_exception_propagates(self) -> None:
        """Exceptions outside the explicit catch list should propagate to Temporal."""
        with (
            patch(
                "nexus.workflows.workflow_engine.activities.condition.safe_eval_with_namespace",
                side_effect=OSError("disk full"),
            ),
            pytest.raises(OSError, match="disk full"),
        ):
            await condition({"condition": "x", "namespace": {}}, None)


class TestConditionOutputMapping:
    """Output mapping integration."""

    @pytest.mark.asyncio
    async def test_none_output_config_returns_full_result(self) -> None:
        result = await condition({"condition": "True", "namespace": {}}, None)
        assert "evaluated_result" in result["output"]

    @pytest.mark.asyncio
    async def test_empty_output_config_suppresses_fields(self) -> None:
        result = await condition({"condition": "True", "namespace": {}}, {})
        assert result["output"] == {"status": "completed"}

    @pytest.mark.asyncio
    async def test_field_mapping_extracts_specific_field(self) -> None:
        result = await condition(
            {"condition": "True", "namespace": {}},
            {"eval": "${result.evaluated_result}"},
        )
        assert result["output"]["eval"] is True
        assert "evaluated_result" not in result["output"]


class TestConditionControlData:
    """Control data contains correct next_port."""

    @pytest.mark.asyncio
    async def test_true_control_next_port(self) -> None:
        result = await condition({"condition": "True", "namespace": {}}, None)
        assert result["control"] == {"next_port": "true"}

    @pytest.mark.asyncio
    async def test_false_control_next_port(self) -> None:
        result = await condition({"condition": "False", "namespace": {}}, None)
        assert result["control"] == {"next_port": "false"}

    @pytest.mark.asyncio
    async def test_output_mapping_does_not_affect_control(self) -> None:
        result = await condition({"condition": "True", "namespace": {}}, {})
        assert result["control"] == {"next_port": "true"}


class TestConditionNoneValue:
    """Condition key present but value is None."""

    @pytest.mark.asyncio
    async def test_none_condition_value_returns_failed(self) -> None:
        result = await condition({"condition": None, "namespace": {}}, None)
        assert result["output"]["status"] == "failed"
        assert result["output"]["error"]["type"] == "ConfigurationError"

    @pytest.mark.asyncio
    async def test_none_condition_value_has_no_control(self) -> None:
        result = await condition({"condition": None, "namespace": {}}, None)
        assert "control" not in result


class TestConditionErrorMessageContent:
    """Error messages contain useful diagnostic info."""

    @pytest.mark.asyncio
    async def test_evaluation_error_message_includes_expression(self) -> None:
        with patch(
            "nexus.workflows.workflow_engine.activities.condition.safe_eval_with_namespace",
            side_effect=ValueError("syntax error"),
        ):
            result = await condition({"condition": "x + y", "namespace": {}}, None)
        assert "x + y" in result["output"]["error"]["message"]
        assert "syntax error" in result["output"]["error"]["message"]


class TestConditionOutputMappingOnFailure:
    """Output mapping is ignored when condition fails."""

    @pytest.mark.asyncio
    async def test_output_mapping_ignored_on_missing_config(self) -> None:
        result = await condition({"namespace": {}}, {"eval": "${result.evaluated_result}"})
        assert result["output"]["status"] == "failed"
        assert "eval" not in result["output"]

    @pytest.mark.asyncio
    async def test_output_mapping_ignored_on_eval_error(self) -> None:
        with patch(
            "nexus.workflows.workflow_engine.activities.condition.safe_eval_with_namespace",
            side_effect=ValueError("bad"),
        ):
            result = await condition({"condition": "bad", "namespace": {}}, {"eval": "${result.evaluated_result}"})
        assert result["output"]["status"] == "failed"
        assert "eval" not in result["output"]


class TestConditionWithNamespace:
    """Test condition evaluation with namespace variable lookup (Tier 2)."""

    @pytest.mark.asyncio
    async def test_variable_lookup_from_namespace(self) -> None:
        """Variable values are looked up from namespace."""
        namespace = {"status": "completed"}
        result = await condition({"condition": "${status} == 'completed'", "namespace": namespace}, None)
        assert result["control"]["next_port"] == "true"
        assert result["output"]["evaluated_result"] is True

    @pytest.mark.asyncio
    async def test_numeric_variable_type_preserved(self) -> None:
        """Numeric types are preserved (not converted to strings)."""
        namespace = {"count": 42}
        result = await condition({"condition": "${count} > 40", "namespace": namespace}, None)
        assert result["control"]["next_port"] == "true"
        assert result["output"]["evaluated_result"] is True

    @pytest.mark.asyncio
    async def test_nested_dict_access(self) -> None:
        """Dotted path access for nested dicts."""
        namespace = {"fetch_order": {"riskScore": 0.8}}
        result = await condition({"condition": "${fetch_order.riskScore} > 0.7", "namespace": namespace}, None)
        assert result["control"]["next_port"] == "true"
        assert result["output"]["evaluated_result"] is True

    @pytest.mark.asyncio
    async def test_complex_expression_with_namespace(self) -> None:
        """Complex boolean expressions with namespace variables."""
        namespace = {"age": 25, "verified": True}
        result = await condition({"condition": "${age} >= 18 and ${verified} == True", "namespace": namespace}, None)
        assert result["control"]["next_port"] == "true"
        assert result["output"]["evaluated_result"] is True

    @pytest.mark.asyncio
    async def test_namespace_is_defensive_copy(self) -> None:
        """Namespace is copied defensively to prevent mutations."""
        namespace = {"value": 10}
        result = await condition({"condition": "${value} == 10", "namespace": namespace}, None)
        # Verify original namespace unchanged (defensive copy worked)
        assert namespace == {"value": 10}
        assert result["control"]["next_port"] == "true"

    @pytest.mark.asyncio
    async def test_variable_not_found_in_namespace(self) -> None:
        """Missing variable in namespace raises KeyError."""
        namespace = {"status": "ok"}
        result = await condition({"condition": "${unknown} == 'value'", "namespace": namespace}, None)
        assert result["output"]["status"] == "failed"
        assert result["output"]["error"]["type"] == "ConditionEvaluationError"
        assert "unknown" in result["output"]["error"]["message"]
