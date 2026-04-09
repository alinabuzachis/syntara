"""Tests for condition activity."""

from unittest.mock import patch

import pytest

from nexus.workflows.workflow_engine.activities.condition import condition


class TestConditionTrueEvaluation:
    """Condition evaluates to true."""

    @pytest.mark.asyncio
    async def test_true_literal_returns_true_port(self) -> None:
        result = await condition({"condition": "True"}, None)
        assert result["control"]["next_port"] == "true"

    @pytest.mark.asyncio
    async def test_true_literal_output_status_completed(self) -> None:
        result = await condition({"condition": "True"}, None)
        assert result["output"]["status"] == "completed"
        assert result["output"]["evaluated_result"] is True

    @pytest.mark.asyncio
    async def test_comparison_true(self) -> None:
        result = await condition({"condition": "5 > 3"}, None)
        assert result["control"]["next_port"] == "true"
        assert result["output"]["evaluated_result"] is True


class TestConditionFalseEvaluation:
    """Condition evaluates to false."""

    @pytest.mark.asyncio
    async def test_false_literal_returns_false_port(self) -> None:
        result = await condition({"condition": "False"}, None)
        assert result["control"]["next_port"] == "false"

    @pytest.mark.asyncio
    async def test_false_literal_output_status_completed(self) -> None:
        result = await condition({"condition": "False"}, None)
        assert result["output"]["status"] == "completed"
        assert result["output"]["evaluated_result"] is False

    @pytest.mark.asyncio
    async def test_comparison_false(self) -> None:
        result = await condition({"condition": "3 > 5"}, None)
        assert result["control"]["next_port"] == "false"
        assert result["output"]["evaluated_result"] is False


class TestConditionMissingConfig:
    """Missing condition expression returns error."""

    @pytest.mark.asyncio
    async def test_empty_condition_returns_failed(self) -> None:
        result = await condition({"condition": ""}, None)
        assert result["output"]["status"] == "failed"
        assert result["output"]["error"]["type"] == "ConfigurationError"

    @pytest.mark.asyncio
    async def test_missing_condition_key_returns_failed(self) -> None:
        result = await condition({}, None)
        assert result["output"]["status"] == "failed"
        assert "Missing 'condition'" in result["output"]["error"]["message"]

    @pytest.mark.asyncio
    async def test_missing_condition_has_no_control(self) -> None:
        result = await condition({}, None)
        assert "control" not in result


class TestConditionEvaluationFailure:
    """Condition evaluation raises an exception."""

    @pytest.mark.asyncio
    async def test_invalid_expression_returns_failed(self) -> None:
        with patch(
            "nexus.workflows.workflow_engine.activities.condition.safe_eval_condition",
            side_effect=ValueError("bad expression"),
        ):
            result = await condition({"condition": "bad_expr"}, None)
        assert result["output"]["status"] == "failed"
        assert result["output"]["error"]["type"] == "ConditionEvaluationError"

    @pytest.mark.asyncio
    async def test_evaluation_error_has_no_control(self) -> None:
        with patch(
            "nexus.workflows.workflow_engine.activities.condition.safe_eval_condition",
            side_effect=RuntimeError("unexpected"),
        ):
            result = await condition({"condition": "x"}, None)
        assert "control" not in result

    @pytest.mark.asyncio
    async def test_uncaught_exception_propagates(self) -> None:
        """Exceptions outside the explicit catch list should propagate to Temporal."""
        with (
            patch(
                "nexus.workflows.workflow_engine.activities.condition.safe_eval_condition",
                side_effect=OSError("disk full"),
            ),
            pytest.raises(OSError, match="disk full"),
        ):
            await condition({"condition": "x"}, None)


class TestConditionOutputMapping:
    """Output mapping integration."""

    @pytest.mark.asyncio
    async def test_none_output_config_returns_full_result(self) -> None:
        result = await condition({"condition": "True"}, None)
        assert "evaluated_result" in result["output"]

    @pytest.mark.asyncio
    async def test_empty_output_config_suppresses_fields(self) -> None:
        result = await condition({"condition": "True"}, {})
        assert result["output"] == {"status": "completed"}

    @pytest.mark.asyncio
    async def test_field_mapping_extracts_specific_field(self) -> None:
        result = await condition(
            {"condition": "True"},
            {"eval": "${result.evaluated_result}"},
        )
        assert result["output"]["eval"] is True
        assert "evaluated_result" not in result["output"]


class TestConditionControlData:
    """Control data contains correct next_port."""

    @pytest.mark.asyncio
    async def test_true_control_next_port(self) -> None:
        result = await condition({"condition": "True"}, None)
        assert result["control"] == {"next_port": "true"}

    @pytest.mark.asyncio
    async def test_false_control_next_port(self) -> None:
        result = await condition({"condition": "False"}, None)
        assert result["control"] == {"next_port": "false"}

    @pytest.mark.asyncio
    async def test_output_mapping_does_not_affect_control(self) -> None:
        result = await condition({"condition": "True"}, {})
        assert result["control"] == {"next_port": "true"}


class TestConditionNoneValue:
    """Condition key present but value is None."""

    @pytest.mark.asyncio
    async def test_none_condition_value_returns_failed(self) -> None:
        result = await condition({"condition": None}, None)
        assert result["output"]["status"] == "failed"
        assert result["output"]["error"]["type"] == "ConfigurationError"

    @pytest.mark.asyncio
    async def test_none_condition_value_has_no_control(self) -> None:
        result = await condition({"condition": None}, None)
        assert "control" not in result


class TestConditionErrorMessageContent:
    """Error messages contain useful diagnostic info."""

    @pytest.mark.asyncio
    async def test_evaluation_error_message_includes_expression(self) -> None:
        with patch(
            "nexus.workflows.workflow_engine.activities.condition.safe_eval_condition",
            side_effect=ValueError("syntax error"),
        ):
            result = await condition({"condition": "x + y"}, None)
        assert "x + y" in result["output"]["error"]["message"]
        assert "syntax error" in result["output"]["error"]["message"]


class TestConditionOutputMappingOnFailure:
    """Output mapping is ignored when condition fails."""

    @pytest.mark.asyncio
    async def test_output_mapping_ignored_on_missing_config(self) -> None:
        result = await condition({}, {"eval": "${result.evaluated_result}"})
        assert result["output"]["status"] == "failed"
        assert "eval" not in result["output"]

    @pytest.mark.asyncio
    async def test_output_mapping_ignored_on_eval_error(self) -> None:
        with patch(
            "nexus.workflows.workflow_engine.activities.condition.safe_eval_condition",
            side_effect=ValueError("bad"),
        ):
            result = await condition({"condition": "bad"}, {"eval": "${result.evaluated_result}"})
        assert result["output"]["status"] == "failed"
        assert "eval" not in result["output"]
