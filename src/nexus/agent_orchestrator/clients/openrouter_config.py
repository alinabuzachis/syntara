"""LangChain ChatOpenAI configuration for OpenRouter.

Configures LangChain to use OpenRouter as the LLM provider.
OpenRouter provides API gateway to multiple LLMs (Claude, GPT-4, etc.).
"""

import structlog
from langchain_openai import ChatOpenAI

from nexus.agent_orchestrator.exceptions import LLMConfigurationError
from nexus.core.config.base import get_settings

logger = structlog.stdlib.get_logger(__name__)


def get_openrouter_llm(
    *,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> ChatOpenAI:
    """Get LangChain ChatOpenAI configured for OpenRouter.

    Credential-provided values take precedence over environment variables,
    enabling the Nexus credential system to supply LLM keys at runtime.

    Args:
        model: OpenRouter model name (e.g., 'anthropic/claude-3.5-sonnet').
               If None, uses settings default.
        temperature: LLM temperature (0.0-1.0). If None, uses settings default.
        max_tokens: Maximum tokens in response. If None, uses settings default.
        api_key: API key from credential system. Falls back to APP_OPENROUTER_API_KEY.
        base_url: Base URL from credential system. Falls back to APP_OPENROUTER_BASE_URL.

    Returns:
        Configured ChatOpenAI instance

    Raises:
        LLMConfigurationError: If no API key is available from credentials or env var

    """
    settings = get_settings()

    selected_api_key = api_key or settings.openrouter_api_key
    if not selected_api_key:
        error_msg = (
            "No LLM API key available. Attach an LLM Provider credential to the workflow node, "
            "or set APP_OPENROUTER_API_KEY environment variable."
        )
        raise LLMConfigurationError(error_msg)

    selected_base_url = base_url or str(settings.openrouter_base_url)
    selected_model = model or settings.openrouter_model
    selected_temperature = temperature if temperature is not None else settings.openrouter_temperature
    selected_max_tokens = max_tokens if max_tokens is not None else settings.openrouter_max_tokens

    logger.info(
        "Initializing OpenRouter LLM",
        model=selected_model,
        temperature=selected_temperature,
        max_tokens=selected_max_tokens,
        has_credential_key=bool(api_key),
    )

    return ChatOpenAI(
        model=selected_model,
        api_key=selected_api_key,  # type: ignore[arg-type]
        base_url=selected_base_url,
        temperature=selected_temperature,
        max_completion_tokens=selected_max_tokens,
        default_headers={
            "HTTP-Referer": "https://github.com/syntara-orchestration/syntara",
            "X-Title": "Nexus Agent Orchestrator",
        },
    )
