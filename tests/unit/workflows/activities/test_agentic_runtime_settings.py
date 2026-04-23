"""Tests for agentic activity runtime settings injection."""

import pytest

from nexus.workflows.workflow_engine.activities.agentic_activity import (
    _inject_runtime_settings,
    execute_agentic_activity,
)


class TestInjectRuntimeSettings:
    """Tests for _inject_runtime_settings helper."""

    @pytest.mark.asyncio
    async def test_injects_timeout_when_missing(self) -> None:
        config: dict[str, object] = {"prompt": "test"}
        await _inject_runtime_settings(config)
        assert "timeout" in config
        assert isinstance(config["timeout"], int)

    @pytest.mark.asyncio
    async def test_preserves_explicit_timeout(self) -> None:
        config: dict[str, object] = {"prompt": "test", "timeout": 42}
        await _inject_runtime_settings(config)
        assert config["timeout"] == 42

    @pytest.mark.asyncio
    async def test_rejects_prompt_exceeding_max_length(self) -> None:
        config: dict[str, object] = {"prompt": "x" * 200000}
        with pytest.raises(ValueError, match="exceeds maximum length"):
            await _inject_runtime_settings(config)

    @pytest.mark.asyncio
    async def test_accepts_prompt_within_max_length(self) -> None:
        config: dict[str, object] = {"prompt": "short prompt"}
        await _inject_runtime_settings(config)


class TestExecuteAgenticActivitySettingsIntegration:
    """Tests that execute_agentic_activity handles settings errors correctly."""

    @pytest.mark.asyncio
    async def test_prompt_too_long_returns_failed(self) -> None:
        """Activity returns failed status when prompt exceeds max length."""
        config: dict[str, object] = {"prompt": "x" * 200000, "timeout": 300}
        result = await execute_agentic_activity(config, None)
        assert result["output"]["status"] == "failed"
        assert "exceeds maximum length" in result["output"]["error"]
