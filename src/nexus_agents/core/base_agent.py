"""Base Agent with Nexus Metadata Support.

This module provides a base class for all Nexus agents that supports:
- Dynamic configuration via nexus:agentConfig metadata
- Configuration validation and security
- Default configuration from agent cards
- Priority-based config resolution (metadata > defaults)
"""

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


# Configuration limits
MAX_TOKENS_LIMIT = 32000
MIN_PENALTY = -2.0
MAX_PENALTY = 2.0

# Allowed values for validation
ALLOWED_MODELS = {
    # OpenAI
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
    # Anthropic
    "claude-3.5-sonnet",
    "claude-3-opus",
    "claude-3-sonnet",
    "claude-3-haiku",
    # OpenRouter prefixes
    "anthropic/claude-3.5-sonnet",
    "anthropic/claude-3-opus",
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "google/gemini-2.0-flash-exp",
}

ALLOWED_TOOLS = {
    "web_search",
    "wikipedia",
    "arxiv_search",
    "calculator",
    "database",
    "code_interpreter",
    "file_operations",
    "image_generation",
    "handoff_to_agent",
    "find_agent",
    "get_swarm_context",
    "workflow_create",
    "workflow_execute",
    "workflow_status",
    "workflow_cancel",
    "workflow_list",
}


@dataclass
class AgentDefaults:
    """Default configuration values for an agent.

    Groups all default configuration parameters to reduce argument count
    in BaseAgentWithMetadata.__init__.
    """

    agent_name: str
    model: str
    temperature: float
    max_tokens: int
    system_prompt: str
    tools: list[str]
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentConfig:
    """Resolved agent configuration after merging metadata with defaults."""

    # LLM Configuration (required fields)
    model: str
    temperature: float
    max_tokens: int

    # Agent Behavior (required fields)
    system_prompt: str
    tools: list[str]

    # LLM Configuration (optional fields)
    top_p: float = 1.0
    frequency_penalty: float = 0.0
    presence_penalty: float = 0.0

    # Agent Behavior (optional fields)
    max_iterations: int = 10
    timeout: int = 300

    # Memory & State
    memory_strategy: str = "buffer"
    max_memory_messages: int = 50

    # Source tracking
    config_source: str = "default"  # "metadata", "defaults", "merged"


class BaseAgentWithMetadata:
    """Base class for Nexus agents with metadata-based configuration support.

    All Nexus agents inherit from this class to get:
    - Metadata extraction from A2A configuration
    - Configuration validation and security
    - Default configuration from agent cards
    - Priority-based resolution (metadata > defaults)
    """

    def __init__(
        self,
        defaults: AgentDefaults,
    ) -> None:
        """Initialize base agent with defaults from agent card.

        Args:
            defaults: AgentDefaults object with all default configuration

        """
        self.agent_name = defaults.agent_name
        self.default_model = defaults.model
        self.default_temperature = defaults.temperature
        self.default_max_tokens = defaults.max_tokens
        self.default_system_prompt = defaults.system_prompt
        self.default_tools = defaults.tools
        self.extra_defaults = defaults.extra

        logger.info(
            "Initialized %s with defaults: model=%s, temperature=%s",
            defaults.agent_name,
            defaults.model,
            defaults.temperature,
        )

    def extract_config_from_metadata(self, configuration: dict[str, Any]) -> dict[str, Any]:
        """Extract nexus:agentConfig from A2A configuration.metadata.

        Args:
            configuration: A2A configuration object (with metadata field)

        Returns:
            Dict containing nexus:agentConfig or empty dict if not present

        """
        metadata = configuration.get("metadata", {})
        nexus_config = metadata.get("nexus:agentConfig", {})

        if nexus_config:
            logger.info(
                "Extracted nexus:agentConfig from metadata: %s",
                list(nexus_config.keys()),
            )
        else:
            logger.debug("No nexus:agentConfig found in metadata, using defaults")

        return nexus_config  # type: ignore[no-any-return]

    def _validate_model(self, model: str) -> None:
        """Validate model name."""
        if model not in ALLOWED_MODELS:
            msg = f"Model '{model}' not allowed. Allowed models: {sorted(ALLOWED_MODELS)}"
            raise ValueError(msg)

    def _validate_numeric_range(self, name: str, value: object, min_val: float, max_val: float) -> None:
        """Validate numeric value is in range."""
        if not isinstance(value, int | float):
            msg = f"{name} must be a number, got {type(value)}"
            raise TypeError(msg)
        if not (min_val <= value <= max_val):
            msg = f"{name} {value} out of range [{min_val}, {max_val}]"
            raise ValueError(msg)

    def _validate_tools_list(self, tools: object) -> None:
        """Validate tools list contains only allowed tools."""
        if not isinstance(tools, list):
            msg = f"tools must be a list, got {type(tools)}"
            raise TypeError(msg)
        for tool in tools:
            if tool not in ALLOWED_TOOLS:
                msg = f"Tool '{tool}' not allowed. Allowed tools: {sorted(ALLOWED_TOOLS)}"
                raise ValueError(msg)

    def validate_config(self, config: dict[str, Any]) -> None:
        """Validate configuration values for security and correctness.

        Raises:
            ValueError: If any configuration value is invalid

        Args:
            config: Configuration dict to validate

        """
        if "model" in config:
            self._validate_model(config["model"])

        if "temperature" in config:
            self._validate_numeric_range("temperature", config["temperature"], 0.0, 1.0)

        if "maxTokens" in config or "max_tokens" in config:
            max_tokens = config.get("maxTokens") or config.get("max_tokens")
            if not isinstance(max_tokens, int):
                msg = f"maxTokens must be an integer, got {type(max_tokens)}"
                raise ValueError(msg)
            if not (1 <= max_tokens <= MAX_TOKENS_LIMIT):
                msg = f"maxTokens {max_tokens} out of range [1, {MAX_TOKENS_LIMIT}]"
                raise ValueError(msg)

        if "tools" in config:
            self._validate_tools_list(config["tools"])

        if "topP" in config or "top_p" in config:
            top_p = config.get("topP") or config.get("top_p")
            self._validate_numeric_range("topP", top_p, 0.0, 1.0)

        for penalty_name in ["frequencyPenalty", "presencePenalty"]:
            if penalty_name in config:
                self._validate_numeric_range(penalty_name, config[penalty_name], MIN_PENALTY, MAX_PENALTY)

        logger.debug("Configuration validation passed for %s", list(config.keys()))

    def merge_with_defaults(self, metadata_config: dict[str, Any]) -> AgentConfig:
        """Merge metadata configuration with defaults.

        Priority order:
        1. Explicit metadata (highest priority)
        2. Agent card defaults
        3. System defaults (lowest priority)

        Args:
            metadata_config: Config from nexus:agentConfig metadata

        Returns:
            AgentConfig with resolved configuration

        """
        # Determine config source for tracking
        config_source = "metadata" if metadata_config else "defaults"

        # Resolve each field with priority: metadata > defaults
        model = metadata_config.get("model", self.default_model)
        temperature = metadata_config.get("temperature", self.default_temperature)
        max_tokens = metadata_config.get("maxTokens", metadata_config.get("max_tokens", self.default_max_tokens))
        top_p = metadata_config.get("topP", metadata_config.get("top_p", 1.0))
        frequency_penalty = metadata_config.get("frequencyPenalty", 0.0)
        presence_penalty = metadata_config.get("presencePenalty", 0.0)

        # System prompt
        system_prompt = metadata_config.get(
            "systemPrompt", metadata_config.get("system_prompt", self.default_system_prompt)
        )

        # Tools
        tools = metadata_config.get("tools", self.default_tools)

        # Execution parameters
        max_iterations = metadata_config.get("maxIterations", 10)
        timeout = metadata_config.get("timeout", 300)

        # Memory parameters
        memory_strategy = metadata_config.get("memoryStrategy", "buffer")
        max_memory_messages = metadata_config.get("maxMemoryMessages", 50)

        resolved_config = AgentConfig(
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=top_p,
            frequency_penalty=frequency_penalty,
            presence_penalty=presence_penalty,
            system_prompt=system_prompt,
            tools=tools,
            max_iterations=max_iterations,
            timeout=timeout,
            memory_strategy=memory_strategy,
            max_memory_messages=max_memory_messages,
            config_source=config_source,
        )

        logger.info(
            "Resolved config (source=%s): model=%s, temperature=%s, tools=%s, max_tokens=%s",
            config_source,
            model,
            temperature,
            tools,
            max_tokens,
        )

        return resolved_config

    def get_effective_config(self, configuration: dict[str, Any]) -> AgentConfig:
        """Get effective configuration by extracting metadata, validating, and merging with defaults.

        This is the main entry point for agents to get their configuration.

        Args:
            configuration: A2A configuration object

        Returns:
            AgentConfig with validated and resolved configuration

        Raises:
            ValueError: If configuration validation fails

        """
        # 1. Extract metadata config
        metadata_config = self.extract_config_from_metadata(configuration)

        # 2. Validate metadata config
        if metadata_config:
            self.validate_config(metadata_config)

        # 3. Merge with defaults
        effective_config = self.merge_with_defaults(metadata_config)

        logger.info(
            "%s using effective config: model=%s, temp=%s, source=%s",
            self.agent_name,
            effective_config.model,
            effective_config.temperature,
            effective_config.config_source,
        )

        return effective_config

    def log_config_application(
        self,
        config: AgentConfig,
        thread_id: str,
        user_id: str | None = None,
    ) -> None:
        """Log configuration application for audit purposes.

        Args:
            config: Applied configuration
            thread_id: Thread/context ID
            user_id: Optional user ID

        """
        audit_data = {
            "event": "config_applied",
            "agent": self.agent_name,
            "thread_id": thread_id,
            "user_id": user_id,
            "config": {
                "model": config.model,
                "temperature": config.temperature,
                "max_tokens": config.max_tokens,
                "tools": config.tools,
                "config_source": config.config_source,
            },
        }

        logger.info("Config application audit: %s", audit_data)
