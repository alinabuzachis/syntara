"""Tests for compute_wait_seconds utility."""

from nexus.workflows.workflow_engine.utils.duration import compute_wait_seconds


class TestComputeWaitSeconds:
    """Test duration computation from config dict."""

    def test_all_fields(self) -> None:
        config = {"days": 1, "hours": 2, "minutes": 3, "seconds": 4}
        assert compute_wait_seconds(config) == 86400 + 7200 + 180 + 4

    def test_days_only(self) -> None:
        assert compute_wait_seconds({"days": 2}) == 172800

    def test_hours_only(self) -> None:
        assert compute_wait_seconds({"hours": 5}) == 18000

    def test_minutes_only(self) -> None:
        assert compute_wait_seconds({"minutes": 30}) == 1800

    def test_seconds_only(self) -> None:
        assert compute_wait_seconds({"seconds": 45}) == 45

    def test_empty_config_returns_zero(self) -> None:
        assert compute_wait_seconds({}) == 0

    def test_missing_fields_default_to_zero(self) -> None:
        assert compute_wait_seconds({"hours": 1}) == 3600

    def test_all_zeros(self) -> None:
        assert compute_wait_seconds({"days": 0, "hours": 0, "minutes": 0, "seconds": 0}) == 0

    def test_large_days(self) -> None:
        assert compute_wait_seconds({"days": 365}) == 31536000
