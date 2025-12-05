"""LangChain ChatOpenAI configuration for OpenRouter.

Configures LangChain to use OpenRouter as the LLM provider.
OpenRouter provides API gateway to multiple LLMs (Claude, GPT-4, etc.).
"""

import logging

from langchain_openai import ChatOpenAI

from nexus.agent_orchestrator.exceptions import LLMConfigurationError
from nexus.core.config import get_settings

logger = logging.getLogger(__name__)


def get_openrouter_llm(
    *,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> ChatOpenAI:
    """Get LangChain ChatOpenAI configured for OpenRouter.

    Args:
        model: OpenRouter model name (e.g., 'anthropic/claude-3.5-sonnet').
               If None, uses settings default.
        temperature: LLM temperature (0.0-1.0). If None, uses settings default.
        max_tokens: Maximum tokens in response. If None, uses settings default.

    Returns:
        Configured ChatOpenAI instance

    Raises:
        LLMConfigurationError: If NEXUS_OPENROUTER_API_KEY is not configured

    """
    # Get configuration from settings
    settings = get_settings()

    # Validate required settings
    if not settings.openrouter_api_key:
        error_msg = "NEXUS_OPENROUTER_API_KEY environment variable is required. Get your API key from https://openrouter.ai/keys"
        raise LLMConfigurationError(error_msg)

    # Use provided values or defaults from settings
    selected_model = model or settings.openrouter_model
    selected_temperature = temperature if temperature is not None else settings.openrouter_temperature
    selected_max_tokens = max_tokens if max_tokens is not None else settings.openrouter_max_tokens

    logger.info(
        "Initializing OpenRouter LLM: model=%s, temperature=%s, max_tokens=%s",
        selected_model,
        selected_temperature,
        selected_max_tokens,
    )

    # Configure ChatOpenAI with OpenRouter
    # OpenRouter uses OpenAI-compatible API format
    return ChatOpenAI(
        model=selected_model,
        api_key=settings.openrouter_api_key,
        base_url=str(settings.openrouter_base_url),
        temperature=selected_temperature,
        max_completion_tokens=selected_max_tokens,
        # OpenRouter-specific headers (optional but recommended)
        default_headers={
            "HTTP-Referer": "https://github.com/syntara-orchestration/syntara",
            "X-Title": "Nexus Agent Orchestrator",
        },
    )
