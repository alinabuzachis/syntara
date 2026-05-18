"""Tests for switch activity."""

from typing import Any
from unittest.mock import patch

import pytest

from nexus.workflows.workflow_engine.activities.switch import switch

CASES_APPROVED_REJECTED = [
    {"port": "case_0", "label": "Approved", "condition": "${status} == 'approved'"},
    {"port": "case_1", "label": "Rejected", "condition": "${status} == 'rejected'"},
]


def _make_config(
    cases: list[dict[str, Any]] | None = None,
    default_port: str = "default",
    namespace: dict[str, Any] | None = None,
) -> dict[str, Any]:
    config: dict[str, Any] = {}
    if cases is not None:
        config["cases"] = cases
    config["default_port"] = default_port
    config["namespace"] = namespace or {}
    return config


class TestSwitchMatchesFirstCase:
    """First case evaluates truthy — routes to its port."""

    @pytest.mark.asyncio
    async def test_first_case_matches(self) -> None:
        config = _make_config(
            cases=CASES_APPROVED_REJECTED,
            namespace={"status": "approved"},
        )
        result = await switch(config, None)
        assert result["control"]["next_port"] == "case_0"

    @pytest.mark.asyncio
    async def test_first_case_output_status_completed(self) -> None:
        config = _make_config(
            cases=CASES_APPROVED_REJECTED,
            namespace={"status": "approved"},
        )
        result = await switch(config, None)
        assert result["output"]["status"] == "completed"
        assert result["output"]["matched_port"] == "case_0"


class TestSwitchMatchesSecondCase:
    """Second case evaluates truthy — routes to its port."""

    @pytest.mark.asyncio
    async def test_second_case_matches(self) -> None:
        config = _make_config(
            cases=CASES_APPROVED_REJECTED,
            namespace={"status": "rejected"},
        )
        result = await switch(config, None)
        assert result["control"]["next_port"] == "case_1"

    @pytest.mark.asyncio
    async def test_second_case_output(self) -> None:
        config = _make_config(
            cases=CASES_APPROVED_REJECTED,
            namespace={"status": "rejected"},
        )
        result = await switch(config, None)
        assert result["output"]["matched_port"] == "case_1"


class TestSwitchMultipleCasesFirstMatchWins:
    """Multiple truthy cases — first match wins."""

    @pytest.mark.asyncio
    async def test_first_truthy_case_wins(self) -> None:
        cases = [
            {"port": "case_0", "label": "Always true", "condition": "True"},
            {"port": "case_1", "label": "Also true", "condition": "True"},
        ]
        result = await switch(_make_config(cases=cases), None)
        assert result["control"]["next_port"] == "case_0"


class TestSwitchDefaultPort:
    """No case matches — routes to default port."""

    @pytest.mark.asyncio
    async def test_no_match_routes_to_default(self) -> None:
        config = _make_config(
            cases=CASES_APPROVED_REJECTED,
            namespace={"status": "pending"},
        )
        result = await switch(config, None)
        assert result["control"]["next_port"] == "default"

    @pytest.mark.asyncio
    async def test_no_match_output(self) -> None:
        config = _make_config(
            cases=CASES_APPROVED_REJECTED,
            namespace={"status": "pending"},
        )
        result = await switch(config, None)
        assert result["output"]["status"] == "completed"
        assert result["output"]["matched_port"] == "default"

    @pytest.mark.asyncio
    async def test_custom_default_port(self) -> None:
        config = _make_config(
            cases=[{"port": "case_0", "label": "Never", "condition": "False"}],
            default_port="fallback",
        )
        result = await switch(config, None)
        assert result["control"]["next_port"] == "fallback"


class TestSwitchMissingConfig:
    """Missing or empty cases returns error."""

    @pytest.mark.asyncio
    async def test_cases_not_a_list_returns_failed(self) -> None:
        result = await switch({"cases": "not_a_list", "namespace": {}}, None)
        assert result["output"]["status"] == "failed"
        assert "must be a list" in result["output"]["error"]["message"]
        assert "control" not in result

    @pytest.mark.asyncio
    async def test_cases_is_dict_returns_failed(self) -> None:
        result = await switch({"cases": {"port": "val"}, "namespace": {}}, None)
        assert result["output"]["status"] == "failed"
        assert "dict" in result["output"]["error"]["message"]

    @pytest.mark.asyncio
    async def test_too_many_cases_returns_failed(self) -> None:
        cases = [{"port": f"case_{i}", "label": f"Case {i}", "condition": "True"} for i in range(101)]
        result = await switch(_make_config(cases=cases), None)
        assert result["output"]["status"] == "failed"
        assert "exceeding the maximum" in result["output"]["error"]["message"]
        assert "control" not in result

    @pytest.mark.asyncio
    async def test_empty_cases_returns_failed(self) -> None:
        result = await switch(_make_config(cases=[]), None)
        assert result["output"]["status"] == "failed"
        assert result["output"]["error"]["type"] == "ConfigurationError"

    @pytest.mark.asyncio
    async def test_case_key_matches_default_port_returns_failed(self) -> None:
        cases = [
            {"port": "default", "label": "Conflicts", "condition": "True"},
        ]
        result = await switch(_make_config(cases=cases), None)
        assert result["output"]["status"] == "failed"
        assert "conflicts with default_port" in result["output"]["error"]["message"]
        assert "control" not in result

    @pytest.mark.asyncio
    async def test_case_key_matches_custom_default_port_returns_failed(self) -> None:
        cases = [
            {"port": "fallback", "label": "Conflicts", "condition": "True"},
        ]
        result = await switch(_make_config(cases=cases, default_port="fallback"), None)
        assert result["output"]["status"] == "failed"
        assert "conflicts with default_port" in result["output"]["error"]["message"]

    @pytest.mark.asyncio
    async def test_missing_cases_key_returns_failed(self) -> None:
        result = await switch({"namespace": {}}, None)
        assert result["output"]["status"] == "failed"
        assert "cases" in result["output"]["error"]["message"]

    @pytest.mark.asyncio
    async def test_duplicate_case_keys_returns_failed(self) -> None:
        cases = [
            {"port": "case_0", "label": "First", "condition": "True"},
            {"port": "case_0", "label": "Duplicate", "condition": "False"},
        ]
        result = await switch(_make_config(cases=cases), None)
        assert result["output"]["status"] == "failed"
        assert "Duplicate" in result["output"]["error"]["message"]
        assert "control" not in result

    @pytest.mark.asyncio
    async def test_missing_cases_has_no_control(self) -> None:
        result = await switch({"namespace": {}}, None)
        assert "control" not in result


class TestSwitchEmptyConditionSkipped:
    """Cases with empty condition strings are skipped."""

    @pytest.mark.asyncio
    async def test_empty_condition_skipped(self) -> None:
        cases = [
            {"port": "case_0", "label": "Empty", "condition": ""},
            {"port": "case_1", "label": "True", "condition": "True"},
        ]
        result = await switch(_make_config(cases=cases), None)
        assert result["control"]["next_port"] == "case_1"

    @pytest.mark.asyncio
    async def test_all_empty_conditions_goes_to_default(self) -> None:
        cases = [
            {"port": "case_0", "label": "Empty", "condition": ""},
            {"port": "case_1", "label": "Also empty", "condition": ""},
        ]
        result = await switch(_make_config(cases=cases), None)
        assert result["control"]["next_port"] == "default"


class TestSwitchEvaluationFailure:
    """Expression evaluation raises an exception."""

    @pytest.mark.asyncio
    async def test_invalid_expression_returns_failed(self) -> None:
        with patch(
            "nexus.workflows.workflow_engine.activities.switch.safe_eval_with_namespace",
            side_effect=ValueError("bad expression"),
        ):
            cases = [{"port": "case_0", "label": "Bad", "condition": "bad_expr"}]
            result = await switch(_make_config(cases=cases), None)
        assert result["output"]["status"] == "failed"
        assert result["output"]["error"]["type"] == "SwitchEvaluationError"

    @pytest.mark.asyncio
    async def test_error_on_second_case_reports_correct_condition(self) -> None:
        """Error message should reference the condition that actually failed, not the first one."""
        with patch(
            "nexus.workflows.workflow_engine.activities.switch.safe_eval_with_namespace",
            side_effect=[False, ValueError("fail on case 1")],
        ):
            cases = [
                {"port": "case_0", "label": "OK", "condition": "first_expr"},
                {"port": "case_1", "label": "Bad", "condition": "second_expr"},
            ]
            result = await switch(_make_config(cases=cases), None)
        assert result["output"]["status"] == "failed"
        assert "second_expr" in result["output"]["error"]["message"]
        assert "first_expr" not in result["output"]["error"]["message"]

    @pytest.mark.asyncio
    async def test_missing_key_field_returns_failed(self) -> None:
        """Case without 'key' field should fail, not silently fabricate a port name."""
        cases = [{"label": "No key", "condition": "True"}]
        result = await switch(_make_config(cases=cases), None)
        assert result["output"]["status"] == "failed"

    @pytest.mark.asyncio
    async def test_none_condition_value_skipped(self) -> None:
        """Case with condition=None should be skipped, not crash."""
        cases: list[dict[str, Any]] = [
            {"port": "case_0", "label": "None cond", "condition": None},
            {"port": "case_1", "label": "True", "condition": "True"},
        ]
        result = await switch(_make_config(cases=cases), None)
        assert result["control"]["next_port"] == "case_1"

    @pytest.mark.asyncio
    async def test_evaluation_error_has_no_control(self) -> None:
        with patch(
            "nexus.workflows.workflow_engine.activities.switch.safe_eval_with_namespace",
            side_effect=ValueError("invalid"),
        ):
            cases = [{"port": "case_0", "label": "Bad", "condition": "x"}]
            result = await switch(_make_config(cases=cases), None)
        assert "control" not in result

    @pytest.mark.asyncio
    async def test_uncaught_exception_propagates(self) -> None:
        with (
            patch(
                "nexus.workflows.workflow_engine.activities.switch.safe_eval_with_namespace",
                side_effect=OSError("disk full"),
            ),
            pytest.raises(OSError, match="disk full"),
        ):
            cases = [{"port": "case_0", "label": "Bad", "condition": "x"}]
            await switch(_make_config(cases=cases), None)


class TestSwitchOutputMapping:
    """Output mapping integration."""

    @pytest.mark.asyncio
    async def test_none_output_config_returns_full_result(self) -> None:
        cases = [{"port": "case_0", "label": "True", "condition": "True"}]
        result = await switch(_make_config(cases=cases), None)
        assert "matched_port" in result["output"]

    @pytest.mark.asyncio
    async def test_empty_output_config_suppresses_fields(self) -> None:
        cases = [{"port": "case_0", "label": "True", "condition": "True"}]
        result = await switch(_make_config(cases=cases), {})
        assert result["output"] == {"status": "completed"}

    @pytest.mark.asyncio
    async def test_output_mapping_does_not_affect_control(self) -> None:
        cases = [{"port": "case_0", "label": "True", "condition": "True"}]
        result = await switch(_make_config(cases=cases), {})
        assert result["control"] == {"next_port": "case_0"}

    @pytest.mark.asyncio
    async def test_output_mapping_ignored_on_failure(self) -> None:
        result = await switch({"namespace": {}}, {"port": "${result.matched_port}"})
        assert result["output"]["status"] == "failed"
        assert "port" not in result["output"]


class TestSwitchControlData:
    """Control data contains correct next_port."""

    @pytest.mark.asyncio
    async def test_matched_port_control(self) -> None:
        cases = [{"port": "case_0", "label": "True", "condition": "True"}]
        result = await switch(_make_config(cases=cases), None)
        assert result["control"] == {"next_port": "case_0"}

    @pytest.mark.asyncio
    async def test_default_control(self) -> None:
        cases = [{"port": "case_0", "label": "False", "condition": "False"}]
        result = await switch(_make_config(cases=cases), None)
        assert result["control"] == {"next_port": "default"}


class TestSwitchWithNamespace:
    """Test switch evaluation with namespace variable lookup (Tier 2)."""

    @pytest.mark.asyncio
    async def test_string_equality(self) -> None:
        config = _make_config(
            cases=[{"port": "case_0", "label": "Match", "condition": "${status} == 'active'"}],
            namespace={"status": "active"},
        )
        result = await switch(config, None)
        assert result["control"]["next_port"] == "case_0"

    @pytest.mark.asyncio
    async def test_numeric_comparison(self) -> None:
        config = _make_config(
            cases=[{"port": "case_0", "label": "High", "condition": "${score} > 80"}],
            namespace={"score": 95},
        )
        result = await switch(config, None)
        assert result["control"]["next_port"] == "case_0"

    @pytest.mark.asyncio
    async def test_boolean_variable(self) -> None:
        config = _make_config(
            cases=[{"port": "case_0", "label": "Verified", "condition": "${verified} == True"}],
            namespace={"verified": True},
        )
        result = await switch(config, None)
        assert result["control"]["next_port"] == "case_0"

    @pytest.mark.asyncio
    async def test_in_operator(self) -> None:
        config = _make_config(
            cases=[{"port": "case_0", "label": "Critical", "condition": "'critical' in ${tags}"}],
            namespace={"tags": ["critical", "urgent"]},
        )
        result = await switch(config, None)
        assert result["control"]["next_port"] == "case_0"

    @pytest.mark.asyncio
    async def test_not_operator(self) -> None:
        config = _make_config(
            cases=[{"port": "case_0", "label": "Not done", "condition": "not ${done}"}],
            namespace={"done": False},
        )
        result = await switch(config, None)
        assert result["control"]["next_port"] == "case_0"

    @pytest.mark.asyncio
    async def test_nested_dict_access(self) -> None:
        config = _make_config(
            cases=[{"port": "case_0", "label": "High risk", "condition": "${order.risk} > 0.7"}],
            namespace={"order": {"risk": 0.9}},
        )
        result = await switch(config, None)
        assert result["control"]["next_port"] == "case_0"

    @pytest.mark.asyncio
    async def test_missing_variable_returns_failed(self) -> None:
        config = _make_config(
            cases=[{"port": "case_0", "label": "Missing", "condition": "${unknown} == 'x'"}],
            namespace={"status": "ok"},
        )
        result = await switch(config, None)
        assert result["output"]["status"] == "failed"
        assert result["output"]["error"]["type"] == "SwitchEvaluationError"

    @pytest.mark.asyncio
    async def test_multi_case_with_namespace(self) -> None:
        cases = [
            {"port": "case_0", "label": "Low", "condition": "${priority} == 'low'"},
            {"port": "case_1", "label": "High", "condition": "${priority} == 'high'"},
            {"port": "case_2", "label": "Critical", "condition": "${priority} == 'critical'"},
        ]
        config = _make_config(cases=cases, namespace={"priority": "high"})
        result = await switch(config, None)
        assert result["control"]["next_port"] == "case_1"
