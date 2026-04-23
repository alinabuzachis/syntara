"""Lightweight credential config for threading LLM credentials through service layers."""

from dataclasses import dataclass


@dataclass(frozen=True)
class LLMCredentialConfig:
    """Immutable credential config carrying api_key, base_url, and model through the call chain.

    Each service creates its own LLM instance with these shared credentials
    but independent temperature/max_tokens settings.
    """

    api_key: str
    base_url: str
    model: str
