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
    api_key: str | None = None,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    base_url: str | None = None,
) -> ChatOpenAI:
    """Configure LangChain ChatOpenAI for an LLM provider endpoint.

    Despite the name, this function supports any OpenAI-compatible endpoint —
    not just OpenRouter. It will be renamed as part of a broader refactor of
    the legacy OpenRouter implementation.

    Args:
        api_key: API key from credential system (required).
        model: Model name (e.g. 'gpt-4o', 'anthropic/claude-opus-4'). If None, uses settings default.
        temperature: LLM temperature (0.0-1.0). If None, uses settings default.
        max_tokens: Maximum tokens in response. If None, uses settings default.
        base_url: Base URL of the LLM provider endpoint. If None, uses settings default.

    Returns:
        Configured ChatOpenAI instance

    Raises:
        LLMConfigurationError: If no API key is provided

    """
    if not api_key:
        error_msg = "No LLM API key available. Attach an LLM Provider credential to the workflow's agentic node."
        raise LLMConfigurationError(error_msg)

    settings = get_settings()
    selected_base_url = str(base_url or settings.openrouter_base_url)
    selected_model = model or settings.openrouter_model
    selected_temperature = temperature if temperature is not None else settings.openrouter_temperature
    selected_max_tokens = max_tokens if max_tokens is not None else settings.openrouter_max_tokens

    logger.info(
        "Initializing OpenRouter LLM",
        model=selected_model,
        temperature=selected_temperature,
        max_tokens=selected_max_tokens,
    )

    return ChatOpenAI(
        model=selected_model,
        api_key=api_key,  # type: ignore[arg-type]
        base_url=selected_base_url,
        temperature=selected_temperature,
        max_completion_tokens=selected_max_tokens,
        stream_usage=True,
        default_headers={
            "HTTP-Referer": "https://github.com/syntara-orchestration/syntara",
            "X-Title": "Nexus Agent Orchestrator",
        },
    )
