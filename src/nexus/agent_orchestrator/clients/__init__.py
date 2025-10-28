"""Client interfaces for external services."""

from nexus.agent_orchestrator.clients.a2a_client import A2AClient, MockA2AClient

__all__ = [
    "A2AClient",
    "MockA2AClient",
]
