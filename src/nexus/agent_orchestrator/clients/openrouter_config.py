"""LangChain ChatOpenAI configuration for OpenRouter.

Configures LangChain to use OpenRouter as the LLM provider.
OpenRouter provides API gateway to multiple LLMs (Claude, GPT-4, etc.).
"""

import logging

from langchain_openai import ChatOpenAI

from nexus.core.config import get_settings

logger = logging.getLogger(__name__)


def get_openrouter_llm(
    *,
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 1000,
) -> ChatOpenAI:
    """Get LangChain ChatOpenAI configured for OpenRouter.

    Args:
        model: OpenRouter model name (e.g., 'anthropic/claude-3.5-sonnet').
               If None, uses settings default.
        temperature: LLM temperature (0.0-1.0). Default: 0.7
        max_tokens: Maximum tokens in response. Default: 1000

    Returns:
        Configured ChatOpenAI instance

    Raises:
        ValueError: If NEXUS_OPENROUTER_API_KEY is not configured

    """
    # Get configuration from settings
    settings = get_settings()

    # Validate required settings
    if not settings.openrouter_api_key:
        error_msg = "NEXUS_OPENROUTER_API_KEY environment variable is required. Get your API key from https://openrouter.ai/keys"
        raise ValueError(error_msg)

    # Use provided model or default from settings
    selected_model = model or settings.openrouter_model

    logger.info(
        "Initializing OpenRouter LLM: model=%s, temperature=%s, max_tokens=%s",
        selected_model,
        temperature,
        max_tokens,
    )

    # Configure ChatOpenAI with OpenRouter
    # OpenRouter uses OpenAI-compatible API format
    return ChatOpenAI(
        model=selected_model,
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        temperature=temperature,
        max_completion_tokens=max_tokens,
        # OpenRouter-specific headers (optional but recommended)
        default_headers={
            "HTTP-Referer": "https://github.com/syntara-orchestration/syntara",
            "X-Title": "Nexus Agent Orchestrator",
        },
    )
