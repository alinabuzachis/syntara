"""Agent Definitions.

This module contains all concrete agent implementations.
Each agent is wrapped with A2A protocol support.

Currently Active:
- GenericAgent: General-purpose conversational agent (fully implemented and tested)

Coming Soon:
- ResearchAgent, OrchestratorAgent, SwarmAgent, WorkflowManagerAgent
"""

# Currently active agents
from .generic_agent import GenericAgent, GenericAgentA2AServer

__all__ = [
    "GenericAgent",
    "GenericAgentA2AServer",
]
