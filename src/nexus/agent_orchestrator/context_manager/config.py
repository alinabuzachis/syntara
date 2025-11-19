"""Configuration settings for the Context Manager.

Contains hardcoded default values for MVP scaffolding.
Full YAML configuration parsing will be implemented in AAP-58170.
"""

from typing import Any, cast

# Default configuration values for Context Manager MVP
CONTEXT_MANAGER_DEFAULTS = {
    # Grounding score requirements
    "required_grounding_score": 0.7,
    "minimum_grounding_score": 0.5,
    # Token budget settings
    "max_total_tokens": 4000,
    "max_context_tokens": 3000,
    "max_system_tokens": 500,
    "max_user_tokens": 500,
    # Retrieval settings
    "default_k": 10,
    "enable_hybrid_search": True,
    "semantic_weight": 0.7,
    "lexical_weight": 0.3,
    # Compression settings
    "compression_mode": "extractive",
    "max_snippets_per_doc": 3,
    "snippet_min_length": 100,
    "snippet_max_length": 500,
    # Assembly settings
    "enforce_hierarchy": True,
    "priority_order": ["system", "context", "user"],
    "include_citations": True,
    # Timing and performance
    "request_timeout_seconds": 30,
    "max_concurrent_requests": 5,
}


def get_default_config() -> dict[str, Any]:
    """Get the default configuration values.

    Returns:
        Dictionary containing default configuration settings

    """
    return CONTEXT_MANAGER_DEFAULTS.copy()


def get_required_grounding_score() -> float:
    """Get the required grounding score threshold.

    Returns:
        Float value for minimum required grounding score

    """
    return cast("float", CONTEXT_MANAGER_DEFAULTS["required_grounding_score"])
