"""Workflow engine constants loaded from Pydantic settings.

Static infrastructure settings (URLs, UUIDs, cleanup timeouts) that are
not runtime-configurable. Activity timeouts and limits have been moved
to runtime settings — see ``catalog.py``.
"""

from nexus.core.config.base import get_settings

# Clear cached settings so re-imports pick up any environment changes
get_settings.cache_clear()

# Load settings once at module import time
_settings = get_settings()

# Default timeouts
DEFAULT_AAP_TIMEOUT_SECONDS = _settings.aap_timeout_seconds

# Agentic activity infrastructure
AGENT_ORCHESTRATOR_BASE_URL = str(_settings.agent_orchestrator_base_url)
SYSTEM_USER_ID = _settings.system_user_id

# Script activity settings
SCRIPT_CLEANUP_TERMINATE_TIMEOUT = _settings.script_cleanup_terminate_timeout
SCRIPT_CLEANUP_KILL_TIMEOUT = _settings.script_cleanup_kill_timeout
MAX_ENV_VAR_LENGTH = _settings.max_env_var_length
