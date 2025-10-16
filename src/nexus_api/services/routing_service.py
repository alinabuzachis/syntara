"""Routing service for directing requests to appropriate agent services."""

from typing import Any

from nexus_api.clients.a2a_client import A2AClient


class AgentRoute:
    """Configuration for routing to a specific agent service."""

    def __init__(self, agent_name: str, agent_url: str, description: str) -> None:
        """Initialize agent route.

        Args:
            agent_name: Name of the agent (e.g., "workflow-generator")
            agent_url: URL of the agent service (e.g., "http://workflow-gen:8001")
            description: Description of agent capabilities

        """
        self.agent_name = agent_name
        self.agent_url = agent_url
        self.description = description


class RoutingService:
    """Service for routing invocation requests to appropriate agent services.

    This service abstracts the routing logic, allowing the API layer to be
    independent of which agents exist or how they're deployed. Currently uses
    simple keyword-based routing; will be enhanced with MCP semantic search
    in NEXUS-002-4.2.
    """

    def __init__(self, a2a_client: A2AClient) -> None:
        """Initialize routing service.

        Args:
            a2a_client: Client for communicating with agent services via A2A

        """
        self.a2a_client = a2a_client

        # Mock agent registry - will be replaced with Tool Registry in NEXUS-002-4.2
        # NOTE: Per agreement with @Ladas, we will leverage the Tool Registry
        # to store and retrieve agent registration information
        self.agents = [
            AgentRoute(
                agent_name="workflow-generator",
                agent_url="http://workflow-gen:8001",  # Will be deployed in NEXUS-002-4.1
                description="Generates workflows from natural language prompts",
            ),
            AgentRoute(
                agent_name="generic-agent",
                agent_url="http://generic-agent:8002",  # Will be deployed in NEXUS-002-4
                description="Answers information queries and general questions",
            ),
        ]

    def select_agent(
        self,
        prompt: str,
        context: dict[str, Any] | None = None,  # noqa: ARG002
    ) -> AgentRoute:
        """Select appropriate agent for the given prompt.

        Currently uses simple keyword matching. Will be replaced with MCP
        semantic search in NEXUS-002-4.2.

        Args:
            prompt: User's natural language request
            context: Optional context data

        Returns:
            Selected agent route

        """
        prompt_lower = prompt.lower()

        # Simple keyword-based routing (placeholder for MCP semantic search)
        workflow_keywords = ["create", "generate", "build", "workflow", "deploy"]
        if any(keyword in prompt_lower for keyword in workflow_keywords):
            return self.agents[0]  # workflow-generator

        # Default to generic agent for questions and information queries
        return self.agents[1]  # generic-agent

    async def route_invocation(
        self,
        prompt: str,
        session_id: str,
        context: dict[str, Any] | None = None,
    ) -> tuple[AgentRoute, Any]:
        """Route invocation to appropriate agent service.

        Args:
            prompt: User's natural language request
            session_id: Session identifier for multi-tenant isolation
            context: Optional context data

        Returns:
            Tuple of (selected agent route, agent response)

        """
        agent = self.select_agent(prompt, context)

        # Execute task via A2A protocol
        # In Phase 1, this is mocked; in Phase 2+ it will make real HTTP calls
        response = None
        events = await self.a2a_client.execute_task(
            agent_url=agent.agent_url,
            task=prompt,
            session_id=session_id,
            context=context,
        )
        async for event in events:
            response = event  # Collect final response

        return agent, response
