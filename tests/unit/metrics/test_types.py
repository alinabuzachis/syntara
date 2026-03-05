"""Unit tests for metric types, MetricRecord model, and MetricsSummary."""

from datetime import UTC, datetime
from uuid import UUID

import pytest
from pydantic import ValidationError

from nexus.metrics.types import (
    METRIC_CATEGORIES,
    MetricRecord,
    MetricsQuery,
    MetricsSummary,
    MetricType,
)

# =============================================================================
# MetricType enum tests
# =============================================================================


class TestMetricType:
    """Tests for the MetricType enum."""

    def test_metric_type_values_exist(self) -> None:
        """All expected metric types are defined."""
        expected = {
            "LLM_DURATION",
            "LLM_TOKENS_INPUT",
            "LLM_TOKENS_OUTPUT",
            "LLM_TTFT",
            "LLM_STATUS",
            "CACHE_HIT",
            "CACHE_MISS",
            "CACHE_LOOKUP_DURATION",
            "CACHE_UTILIZATION",
            "WORKFLOW_DURATION",
            "WORKFLOW_STATUS",
            "ACTIVITY_DURATION",
            "AGENT_ROUTING_DURATION",
            "AGENT_INVOCATION_DURATION",
            "AGENT_STATUS",
            "REQUEST_DURATION",
            "COMPONENT_DURATION",
            "ERROR",
        }
        actual = {m.name for m in MetricType}
        assert actual == expected

    def test_metric_type_is_string_enum(self) -> None:
        """MetricType values are usable as plain strings."""
        assert MetricType.LLM_DURATION.value == "llm_duration_ms"
        assert isinstance(MetricType.LLM_DURATION, str)

    def test_metric_type_from_value(self) -> None:
        """MetricType can be constructed from its string value."""
        assert MetricType("llm_duration_ms") is MetricType.LLM_DURATION

    def test_metric_categories_keys(self) -> None:
        """All expected categories are present."""
        assert set(METRIC_CATEGORIES.keys()) == {"llm", "cache", "workflow", "agent", "error"}

    def test_metric_categories_contain_correct_types(self) -> None:
        """Each category contains the right MetricType members."""
        assert MetricType.LLM_DURATION in METRIC_CATEGORIES["llm"]
        assert MetricType.CACHE_HIT in METRIC_CATEGORIES["cache"]
        assert MetricType.WORKFLOW_DURATION in METRIC_CATEGORIES["workflow"]
        assert MetricType.AGENT_ROUTING_DURATION in METRIC_CATEGORIES["agent"]
        assert MetricType.ERROR in METRIC_CATEGORIES["error"]

    def test_all_metric_types_belong_to_a_category(self) -> None:
        """Every MetricType is listed in at least one category (except system overhead)."""
        categorized = {mt for types in METRIC_CATEGORIES.values() for mt in types}
        uncategorized = set(MetricType) - categorized
        assert uncategorized == {MetricType.REQUEST_DURATION, MetricType.COMPONENT_DURATION}


# =============================================================================
# MetricRecord model tests
# =============================================================================


class TestMetricRecord:
    """Tests for the MetricRecord SQLModel."""

    def test_creation_with_required_fields(self) -> None:
        """MetricRecord can be created with just metric_type and value."""
        record = MetricRecord(metric_type=MetricType.LLM_DURATION, value=123.45)
        assert record.metric_type == MetricType.LLM_DURATION
        assert record.value == pytest.approx(123.45)
        assert record.unit == ""
        assert record.labels == {}

    def test_auto_generated_id(self) -> None:
        """Each record gets a unique UUID."""
        r1 = MetricRecord(metric_type=MetricType.LLM_DURATION, value=1.0)
        r2 = MetricRecord(metric_type=MetricType.LLM_DURATION, value=2.0)
        assert isinstance(r1.id, UUID)
        assert r1.id != r2.id

    def test_auto_generated_created_at(self) -> None:
        """created_at is auto-populated with a recent UTC timestamp."""
        record = MetricRecord(metric_type=MetricType.LLM_DURATION, value=1.0)
        assert record.created_at is not None
        assert record.created_at.tzinfo is not None
        delta = datetime.now(UTC) - record.created_at
        assert delta.total_seconds() < 2

    def test_labels_stored_correctly(self) -> None:
        """Labels dict is preserved through construction."""
        labels = {"model": "gpt-4", "status": "success"}
        record = MetricRecord(
            metric_type=MetricType.LLM_DURATION,
            value=100.0,
            labels=labels,
        )
        assert record.labels == labels

    def test_unit_field(self) -> None:
        """Unit field is stored correctly."""
        record = MetricRecord(
            metric_type=MetricType.LLM_TOKENS_INPUT,
            value=1500,
            unit="tokens",
        )
        assert record.unit == "tokens"

    def test_serialization_roundtrip(self) -> None:
        """model_dump produces a dict that can recreate the record."""
        original = MetricRecord(
            metric_type=MetricType.LLM_DURATION,
            value=245.5,
            unit="ms",
            labels={"model": "gpt-4"},
        )
        data = original.model_dump()
        restored = MetricRecord.model_validate(data)
        assert restored.metric_type == original.metric_type
        assert restored.value == original.value
        assert restored.unit == original.unit
        assert restored.labels == original.labels

    def test_labels_none_defaults_to_empty_dict(self) -> None:
        """Passing None for labels yields an empty dict."""
        record = MetricRecord(
            metric_type=MetricType.LLM_DURATION,
            value=1.0,
            labels=None,
        )
        assert record.labels == {}

    def test_labels_rejects_non_string_keys(self) -> None:
        """Labels with non-string keys are rejected."""
        with pytest.raises(ValidationError, match="Value error, labels key '1' must be a string, got int"):
            MetricRecord(
                metric_type=MetricType.LLM_DURATION,
                value=1.0,
                labels={1: 123},
            )

    def test_labels_rejects_non_string_values(self) -> None:
        """Labels with non-string values are rejected."""
        with pytest.raises(ValidationError, match="Value error, labels value for key 'key' must be a string, got int"):
            MetricRecord(
                metric_type=MetricType.LLM_DURATION,
                value=1.0,
                labels={"key": 123},
            )

    def test_extra_fields_forbidden(self) -> None:
        """Unknown fields are rejected by the strict model config."""
        with pytest.raises(ValueError, match="extra"):
            MetricRecord(
                metric_type=MetricType.LLM_DURATION,
                value=1.0,
                unknown_field="bad",
            )


# =============================================================================
# MetricsQuery tests
# =============================================================================


class TestMetricsQuery:
    """Tests for the MetricsQuery parameter model."""

    def test_defaults(self) -> None:
        """Default values match spec expectations."""
        query = MetricsQuery()
        assert query.category == "all"
        assert query.start_time is None
        assert query.end_time is None
        assert query.limit == 20
        assert query.cursor is None
        assert query.sort is None
        assert query.include_total is False

    def test_custom_values(self) -> None:
        """Custom filter values are accepted."""
        now = datetime.now(UTC)
        query = MetricsQuery(category="llm", start_time=now, limit=50)
        assert query.category == "llm"
        assert query.start_time == now
        assert query.limit == 50


# =============================================================================
# MetricsSummary tests
# =============================================================================


class TestMetricsSummary:
    """Tests for the MetricsSummary response model."""

    def test_cache_hit_rate_with_data(self) -> None:
        """Cache hit rate is computed correctly."""
        now = datetime.now(UTC)
        summary = MetricsSummary(
            cache_hits=7,
            cache_misses=3,
            period_start=now,
            period_end=now,
        )
        assert summary.cache_hit_rate == pytest.approx(0.7)

    def test_cache_hit_rate_no_data(self) -> None:
        """Cache hit rate is 0.0 when no cache operations recorded."""
        now = datetime.now(UTC)
        summary = MetricsSummary(period_start=now, period_end=now)
        assert summary.cache_hit_rate == pytest.approx(0.0)

    def test_error_rate_with_data(self) -> None:
        """Error rate is computed correctly."""
        now = datetime.now(UTC)
        summary = MetricsSummary(
            total_requests=100,
            total_errors=5,
            period_start=now,
            period_end=now,
        )
        assert summary.error_rate == pytest.approx(0.05)

    def test_error_rate_no_data(self) -> None:
        """Error rate is 0.0 when no requests recorded."""
        now = datetime.now(UTC)
        summary = MetricsSummary(period_start=now, period_end=now)
        assert summary.error_rate == pytest.approx(0.0)
