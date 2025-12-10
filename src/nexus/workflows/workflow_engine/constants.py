"""Workflow engine constants loaded from settings.

This module loads configuration values from settings at import time to be used
as constants throughout the workflow engine. These values are deterministic and
safe to use in Temporal workflows.

This module is imported with workflow.unsafe.imports_passed_through() in
dynamic_workflow.py because it accesses settings which triggers tempfile.gettempdir().
However, the values themselves are deterministic constants that don't change during
workflow execution, making them safe for workflow use.
"""

from nexus.core.config import get_settings

# Clear cached settings so re-imports pick up any environment changes
get_settings.cache_clear()

# Load settings once at module import time
_settings = get_settings()

# Loop limits
MAX_LOOP_ITERATIONS = _settings.max_loop_iterations

# Default timeouts
DEFAULT_SCRIPT_TIMEOUT_SECONDS = _settings.script_timeout_seconds
DEFAULT_AGENTIC_TIMEOUT_SECONDS = _settings.agentic_timeout_seconds
API_TIMEOUT_SECONDS = _settings.api_timeout_seconds
DEFAULT_AAP_TIMEOUT_SECONDS = _settings.aap_timeout_seconds

# Agentic activity limits
MAX_INPUT_VALUE_LENGTH = _settings.max_input_value_length
MAX_TOTAL_INPUT_SIZE = _settings.max_total_input_size
MAX_PROMPT_LENGTH = _settings.max_prompt_length
AGENT_ORCHESTRATOR_BASE_URL = str(_settings.agent_orchestrator_base_url)
SYSTEM_USER_ID = _settings.system_user_id

# Script activity settings
SCRIPT_CLEANUP_TERMINATE_TIMEOUT = _settings.script_cleanup_terminate_timeout
SCRIPT_CLEANUP_KILL_TIMEOUT = _settings.script_cleanup_kill_timeout
MAX_ENV_VAR_LENGTH = _settings.max_env_var_length

# Duration limits for timeout parsing
MAX_DURATION_HOURS = _settings.max_duration_hours
MAX_DURATION_MINUTES = _settings.max_duration_minutes
MAX_DURATION_SECONDS = _settings.max_duration_seconds
