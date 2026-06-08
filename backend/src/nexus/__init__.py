"""Top-level Nexus package exposing subpackages for agents, API, and tool manager."""

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from nexus.core.logging.logging import configure_structlog

configure_structlog()

__all__ = ["api", "tool_manager"]
