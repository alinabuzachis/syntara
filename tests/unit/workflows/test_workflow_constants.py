"""Unit tests for workflow engine constants module.

This module tests the critical integration point where settings are loaded
at module import time into constants used throughout the workflow engine.

Note: This test file imports modules inside test functions (not at top level)
to test module reloading behavior. This is intentional and required for these tests.
"""

import importlib
import os
import sys
from collections.abc import Generator

import pytest

from nexus.core.config.base import get_settings


@pytest.fixture
def isolated_constants() -> Generator[None, None, None]:
    """Reload constants module for each test to ensure isolation.

    This fixture ensures that:
    1. Settings cache is cleared before the test
    2. Constants module is removed from cache before the test
    3. Test can set env vars and import a fresh constants module
    4. Everything is cleaned up after the test
    """
    # Remove constants from module cache if present
    module_name = "nexus.workflows.workflow_engine.constants"
    if module_name in sys.modules:
        del sys.modules[module_name]

    # Clear settings cache BEFORE the test so env vars can take effect
    get_settings.cache_clear()

    yield

    # Cleanup - remove from cache so next test gets fresh import
    if module_name in sys.modules:
        del sys.modules[module_name]
    get_settings.cache_clear()


@pytest.mark.usefixtures("isolated_constants")
class TestConstantsModuleLoading:
    """Tests for constants module loading from settings."""

    def test_constants_module_imports_successfully(self) -> None:
        """Test that constants module can be imported without errors."""
        # This also verifies it doesn't fail when imported in tests
        from nexus.workflows.workflow_engine import constants

        assert constants is not None

    def test_all_expected_constants_are_defined(self) -> None:
        """Test that all expected constants are defined in the module."""
        from nexus.workflows.workflow_engine import constants

        expected_constants = [
            "MAX_LOOP_ITERATIONS",
            "DEFAULT_SCRIPT_TIMEOUT_SECONDS",
            "DEFAULT_AGENTIC_TIMEOUT_SECONDS",
            "API_TIMEOUT_SECONDS",
            "MAX_INPUT_VALUE_LENGTH",
            "MAX_TOTAL_INPUT_SIZE",
            "MAX_PROMPT_LENGTH",
            "AGENT_ORCHESTRATOR_BASE_URL",
            "SYSTEM_USER_ID",
            "SCRIPT_CLEANUP_TERMINATE_TIMEOUT",
            "SCRIPT_CLEANUP_KILL_TIMEOUT",
            "MAX_ENV_VAR_LENGTH",
            "MAX_DURATION_HOURS",
            "MAX_DURATION_MINUTES",
            "MAX_DURATION_SECONDS",
        ]

        for const_name in expected_constants:
            assert hasattr(constants, const_name), f"Missing constant: {const_name}"

    def test_constants_loaded_from_settings_defaults(self) -> None:
        """Test that constants use settings defaults when no env vars are set."""
        # Clear any OpenRouter/Workflow env vars
        env_vars_to_clear = [k for k in os.environ if k.startswith("NEXUS_")]
        for key in env_vars_to_clear:
            os.environ.pop(key, None)

        get_settings.cache_clear()

        from nexus.workflows.workflow_engine import constants

        # Verify defaults (from base.py)
        assert constants.MAX_LOOP_ITERATIONS == 10000
        assert constants.DEFAULT_SCRIPT_TIMEOUT_SECONDS == 300
        assert constants.DEFAULT_AGENTIC_TIMEOUT_SECONDS == 300
        assert constants.API_TIMEOUT_SECONDS == 30
        assert constants.MAX_INPUT_VALUE_LENGTH == 10000
        assert constants.MAX_TOTAL_INPUT_SIZE == 50000
        assert constants.MAX_PROMPT_LENGTH == 100000
        assert constants.AGENT_ORCHESTRATOR_BASE_URL == "http://localhost:8000/api/v1"
        assert constants.SCRIPT_CLEANUP_TERMINATE_TIMEOUT == 1.0
        assert constants.SCRIPT_CLEANUP_KILL_TIMEOUT == 0.5
        assert constants.MAX_ENV_VAR_LENGTH == 32768
        assert constants.MAX_DURATION_HOURS == 8760
        assert constants.MAX_DURATION_MINUTES == 525600
        assert constants.MAX_DURATION_SECONDS == 31536000

    def test_constants_respect_environment_variables(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that constants correctly load from environment variables."""
        # Set environment variables
        monkeypatch.setenv("NEXUS_MAX_LOOP_ITERATIONS", "5000")
        monkeypatch.setenv("NEXUS_SCRIPT_TIMEOUT_SECONDS", "600")
        monkeypatch.setenv("NEXUS_AGENTIC_TIMEOUT_SECONDS", "450")
        monkeypatch.setenv("NEXUS_API_TIMEOUT_SECONDS", "60")
        monkeypatch.setenv("NEXUS_MAX_INPUT_VALUE_LENGTH", "20000")
        monkeypatch.setenv("NEXUS_MAX_TOTAL_INPUT_SIZE", "100000")
        monkeypatch.setenv("NEXUS_MAX_PROMPT_LENGTH", "200000")
        monkeypatch.setenv("NEXUS_AGENT_ORCHESTRATOR_BASE_URL", "http://custom.example.com/api/v1")
        monkeypatch.setenv("NEXUS_SCRIPT_CLEANUP_TERMINATE_TIMEOUT", "2.0")
        monkeypatch.setenv("NEXUS_SCRIPT_CLEANUP_KILL_TIMEOUT", "1.0")
        monkeypatch.setenv("NEXUS_MAX_ENV_VAR_LENGTH", "65536")

        # Import and reload to ensure settings are read with new env vars
        import nexus.workflows.workflow_engine.constants as constants_module

        constants = importlib.reload(constants_module)

        # Verify environment values are used
        assert constants.MAX_LOOP_ITERATIONS == 5000
        assert constants.DEFAULT_SCRIPT_TIMEOUT_SECONDS == 600
        assert constants.DEFAULT_AGENTIC_TIMEOUT_SECONDS == 450
        assert constants.API_TIMEOUT_SECONDS == 60
        assert constants.MAX_INPUT_VALUE_LENGTH == 20000
        assert constants.MAX_TOTAL_INPUT_SIZE == 100000
        assert constants.MAX_PROMPT_LENGTH == 200000
        assert constants.AGENT_ORCHESTRATOR_BASE_URL == "http://custom.example.com/api/v1"
        assert constants.SCRIPT_CLEANUP_TERMINATE_TIMEOUT == 2.0
        assert constants.SCRIPT_CLEANUP_KILL_TIMEOUT == 1.0
        assert constants.MAX_ENV_VAR_LENGTH == 65536

    def test_system_user_id_is_uuid(self) -> None:
        """Test that SYSTEM_USER_ID is a valid UUID."""
        from uuid import UUID

        from nexus.workflows.workflow_engine import constants

        # Should be able to parse as UUID
        assert isinstance(constants.SYSTEM_USER_ID, UUID)
        # Default value
        assert str(constants.SYSTEM_USER_ID) == "00000000-0000-0000-0000-000000000001"

    def test_constants_types_are_correct(self) -> None:
        """Test that all constants have the expected types."""
        from uuid import UUID

        from nexus.workflows.workflow_engine import constants

        # Integer constants
        assert isinstance(constants.MAX_LOOP_ITERATIONS, int)
        assert isinstance(constants.DEFAULT_SCRIPT_TIMEOUT_SECONDS, int)
        assert isinstance(constants.DEFAULT_AGENTIC_TIMEOUT_SECONDS, int)
        assert isinstance(constants.API_TIMEOUT_SECONDS, int)
        assert isinstance(constants.MAX_INPUT_VALUE_LENGTH, int)
        assert isinstance(constants.MAX_TOTAL_INPUT_SIZE, int)
        assert isinstance(constants.MAX_PROMPT_LENGTH, int)
        assert isinstance(constants.MAX_ENV_VAR_LENGTH, int)
        assert isinstance(constants.MAX_DURATION_HOURS, int)
        assert isinstance(constants.MAX_DURATION_MINUTES, int)
        assert isinstance(constants.MAX_DURATION_SECONDS, int)

        # Float constants
        assert isinstance(constants.SCRIPT_CLEANUP_TERMINATE_TIMEOUT, float)
        assert isinstance(constants.SCRIPT_CLEANUP_KILL_TIMEOUT, float)

        # String constant
        assert isinstance(constants.AGENT_ORCHESTRATOR_BASE_URL, str)

        # UUID constant
        assert isinstance(constants.SYSTEM_USER_ID, UUID)

    def test_timeout_constants_in_seconds(self) -> None:
        """Test that all timeout constants are in seconds (consistency check)."""
        from nexus.workflows.workflow_engine import constants

        # All timeout values should be reasonable (> 0, < 1 hour for defaults)
        assert 0 < constants.DEFAULT_SCRIPT_TIMEOUT_SECONDS <= 3600
        assert 0 < constants.DEFAULT_AGENTIC_TIMEOUT_SECONDS <= 3600
        assert 0 < constants.API_TIMEOUT_SECONDS <= 3600

        # Cleanup timeouts should be small (< 10 seconds)
        assert 0 < constants.SCRIPT_CLEANUP_TERMINATE_TIMEOUT < 10
        assert 0 < constants.SCRIPT_CLEANUP_KILL_TIMEOUT < 10

    def test_duration_limits_are_positive_or_zero(self) -> None:
        """Test that duration limits allow 0 (unlimited) or positive values."""
        from nexus.workflows.workflow_engine import constants

        assert constants.MAX_DURATION_HOURS >= 0
        assert constants.MAX_DURATION_MINUTES >= 0
        assert constants.MAX_DURATION_SECONDS >= 0

    def test_constants_match_settings_exactly(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test that constants exactly match settings values at import time."""
        # Set some unique values
        monkeypatch.setenv("NEXUS_MAX_LOOP_ITERATIONS", "7777")
        monkeypatch.setenv("NEXUS_SCRIPT_TIMEOUT_SECONDS", "555")
        monkeypatch.setenv("NEXUS_AGENTIC_TIMEOUT_SECONDS", "333")
        monkeypatch.setenv("NEXUS_MAX_PROMPT_LENGTH", "99999")

        # Import and reload to ensure settings are read with new env vars
        import nexus.workflows.workflow_engine.constants as constants_module

        constants = importlib.reload(constants_module)
        settings = get_settings()

        # Direct comparison with settings
        assert settings.max_loop_iterations == constants.MAX_LOOP_ITERATIONS
        assert settings.script_timeout_seconds == constants.DEFAULT_SCRIPT_TIMEOUT_SECONDS
        assert settings.agentic_timeout_seconds == constants.DEFAULT_AGENTIC_TIMEOUT_SECONDS
        assert settings.api_timeout_seconds == constants.API_TIMEOUT_SECONDS
        assert settings.max_input_value_length == constants.MAX_INPUT_VALUE_LENGTH
        assert settings.max_total_input_size == constants.MAX_TOTAL_INPUT_SIZE
        assert settings.max_prompt_length == constants.MAX_PROMPT_LENGTH
        assert str(settings.agent_orchestrator_base_url) == constants.AGENT_ORCHESTRATOR_BASE_URL
        assert settings.system_user_id == constants.SYSTEM_USER_ID
        assert settings.script_cleanup_terminate_timeout == constants.SCRIPT_CLEANUP_TERMINATE_TIMEOUT
        assert settings.script_cleanup_kill_timeout == constants.SCRIPT_CLEANUP_KILL_TIMEOUT
        assert settings.max_env_var_length == constants.MAX_ENV_VAR_LENGTH
        assert settings.max_duration_hours == constants.MAX_DURATION_HOURS
        assert settings.max_duration_minutes == constants.MAX_DURATION_MINUTES
        assert settings.max_duration_seconds == constants.MAX_DURATION_SECONDS


@pytest.mark.usefixtures("isolated_constants")
class TestConstantsTemporalCompatibility:
    """Tests for Temporal workflow compatibility."""

    def test_constants_importable_from_workflow_context(self) -> None:
        """Test that constants can be imported in a workflow-like context.

        This simulates the import that happens in dynamic_workflow.py where
        constants are imported with workflow.unsafe.imports_passed_through().
        """
        # This test verifies the module can be imported without triggering
        # Temporal sandbox restrictions (which would happen in actual workflow execution)
        from nexus.workflows.workflow_engine import constants

        # Verify key constants are accessible
        assert constants.MAX_LOOP_ITERATIONS > 0
        assert constants.DEFAULT_SCRIPT_TIMEOUT_SECONDS > 0
        assert constants.AGENT_ORCHESTRATOR_BASE_URL.startswith("http")

    def test_constants_module_docstring_documents_temporal_usage(self) -> None:
        """Test that module docstring documents Temporal sandbox considerations."""
        from nexus.workflows.workflow_engine import constants

        # Module should have docstring explaining Temporal usage
        assert constants.__doc__ is not None
        assert "Temporal" in constants.__doc__ or "workflow" in constants.__doc__


@pytest.mark.usefixtures("isolated_constants")
class TestConstantsUsagePatterns:
    """Tests for expected usage patterns of constants."""

    def test_constants_are_module_level_variables(self) -> None:
        """Test that constants are simple module-level variables, not functions."""
        from nexus.workflows.workflow_engine import constants

        # None of these should be callable
        assert not callable(constants.MAX_LOOP_ITERATIONS)
        assert not callable(constants.DEFAULT_SCRIPT_TIMEOUT_SECONDS)
        assert not callable(constants.AGENT_ORCHESTRATOR_BASE_URL)

    def test_constants_can_be_imported_individually(self) -> None:
        """Test that constants can be imported individually or as a group."""
        # Individual imports (common pattern in codebase)
        from nexus.workflows.workflow_engine.constants import (
            API_TIMEOUT_SECONDS,
            DEFAULT_AGENTIC_TIMEOUT_SECONDS,
            DEFAULT_SCRIPT_TIMEOUT_SECONDS,
            MAX_LOOP_ITERATIONS,
        )

        assert MAX_LOOP_ITERATIONS > 0
        assert DEFAULT_SCRIPT_TIMEOUT_SECONDS > 0
        assert DEFAULT_AGENTIC_TIMEOUT_SECONDS > 0
        assert API_TIMEOUT_SECONDS > 0

    def test_reimporting_uses_cached_module(self) -> None:
        """Test that reimporting constants uses the cached module instance."""
        from nexus.workflows.workflow_engine import constants as constants1
        from nexus.workflows.workflow_engine import constants as constants2

        # Should be the same module object
        assert constants1 is constants2
        assert id(constants1) == id(constants2)
