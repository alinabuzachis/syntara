"""Agent A2A Server Entrypoint.

Starts individual agents as standalone A2A servers.
Based on: https://github.com/a2aproject/a2a-samples/blob/main/samples/python/agents/a2a_mcp/src/a2a_mcp/agents/__main__.py

Usage:
    # Start specific agent
    python -m src.nexus.agents --agent generic-agent --port 8001

    # Or use environment variables
    AGENT_NAME=generic-agent AGENT_PORT=8001 python -m src.nexus.agents

Environment Variables:
    AGENT_NAME: Agent to start (generic-agent)
    AGENT_PORT: Port to bind (default: 8001)
    AGENT_HOST: Host to bind (default: 0.0.0.0)
    POSTGRES_URI: PostgreSQL connection string (default: postgresql://postgres:postgres@postgres:5432/nexus)
    LOG_LEVEL: Logging level (default: INFO)
    OPENROUTER_API_KEY: OpenRouter API key for LLM access (required)
    OPENAI_API_KEY: Alternative to OPENROUTER_API_KEY
    OPENAI_API_BASE: Base URL for OpenAI-compatible API (default: https://openrouter.ai/api/v1)
"""

import argparse
import asyncio
import logging
import os
import sys
from typing import Any

import uvicorn
from a2a.server.apps import A2AFastAPIApplication

# A2A SDK imports
# Import agent implementations
from .definitions.generic_agent import GenericAgent, GenericAgentA2AServer

# Constants
# Binding to 0.0.0.0 is required for container networking (accepting external connections)
DEFAULT_HOST = "0.0.0.0"  # noqa: S104
DEFAULT_PORT = 8001

# Agent registry
AGENTS = {
    "generic-agent": {
        "class": GenericAgent,
        "wrapper": GenericAgentA2AServer,
        "default_port": DEFAULT_PORT,
        "description": "General-purpose conversational agent with ReAct pattern",
    },
}


def setup_logging(level: str = "INFO") -> None:
    """Configure logging."""
    logging.basicConfig(
        level=getattr(logging, level.upper()),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )


def get_config_from_env() -> dict[str, Any]:
    """Extract configuration from environment variables."""
    return {
        "agent_name": os.getenv("AGENT_NAME"),
        "host": os.getenv("AGENT_HOST", DEFAULT_HOST),
        "port": int(os.getenv("AGENT_PORT", str(DEFAULT_PORT))),
        "postgres_uri": os.getenv("POSTGRES_URI", "postgresql://postgres:postgres@postgres:5432/nexus"),
        "log_level": os.getenv("LOG_LEVEL", "INFO"),
    }


def validate_environment() -> None:
    """Validate required environment variables."""
    logger = logging.getLogger(__name__)
    if not os.getenv("OPENROUTER_API_KEY") and not os.getenv("OPENAI_API_KEY"):
        logger.error("OPENROUTER_API_KEY or OPENAI_API_KEY environment variable is required")
        logger.error("Please set it in your .env file or export it:")
        logger.error("  export OPENROUTER_API_KEY=sk-or-v1-...")
        logger.error("  # or")
        logger.error("  export OPENAI_API_KEY=sk-...")
        sys.exit(1)


async def start_agent(agent_name: str, host: str, port: int, postgres_uri: str) -> None:
    """Start agent as A2A server.

    Args:
        agent_name: Name of agent to start
        host: Host to bind
        port: Port to bind
        postgres_uri: PostgreSQL connection string

    """
    if agent_name not in AGENTS:
        msg = f"Unknown agent '{agent_name}'. Available agents: {', '.join(AGENTS.keys())}"
        raise ValueError(msg)

    agent_info = AGENTS[agent_name]
    logger = logging.getLogger(__name__)

    logger.info("Starting %s: %s", agent_name, agent_info["description"])
    logger.info("  Host: %s", host)
    logger.info("  Port: %s", port)
    logger.info("  PostgreSQL: %s", postgres_uri)

    # Create agent wrapper with A2A server
    wrapper = agent_info["wrapper"](  # type: ignore[operator]
        checkpoint_uri=postgres_uri,
    )

    # Get request handler and agent card from wrapper
    request_handler = wrapper.get_request_handler()
    agent_card = wrapper.agent_card

    # Create FastAPI app
    a2a_app = A2AFastAPIApplication(agent_card=agent_card, http_handler=request_handler)
    app = a2a_app.build()

    # Start server
    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        log_level="info",
    )
    server = uvicorn.Server(config)

    logger.info("✅ %s server started at http://%s:%s", agent_name, host, port)
    logger.info("   Agent Card: http://%s:%s/agent-card", host, port)
    logger.info("   A2A Endpoint: http://%s:%s/a2a", host, port)

    await server.serve()


def main() -> None:
    """Execute the main entry point."""
    # Parse arguments
    parser = argparse.ArgumentParser(
        description="Start Nexus agent as A2A server",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Start react agent
  python -m src.nexus.agents --agent generic-agent --port 8001

  # Start with custom PostgreSQL
  python -m src.nexus.agents --agent research-agent --postgres postgresql://user:pass@localhost:5432/db

  # Or use environment variables
  export AGENT_NAME=generic-agent
  export AGENT_PORT=8001
  export POSTGRES_URI=postgresql://postgres:postgres@postgres:5432/nexus
  export OPENROUTER_API_KEY=sk-or-v1-...
  python -m src.nexus.agents

Available agents:
"""
        + "\n".join(f"  - {name}: {info['description']}" for name, info in AGENTS.items()),
    )

    parser.add_argument(
        "--agent",
        type=str,
        help="Agent to start (generic-agent)",
    )
    parser.add_argument("--host", type=str, help="Host to bind (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, help="Port to bind")
    parser.add_argument(
        "--postgres",
        type=str,
        help="PostgreSQL URI (default: postgresql://postgres:postgres@postgres:5432/nexus)",
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level (default: INFO)",
    )

    args = parser.parse_args()

    # Get config from environment or args
    env_config = get_config_from_env()

    agent_name = args.agent or env_config["agent_name"]
    host = args.host or env_config["host"]
    port = args.port or env_config["port"]
    postgres_uri = args.postgres or env_config["postgres_uri"]
    log_level = args.log_level or env_config["log_level"]

    if not agent_name:
        parser.print_help()
        sys.stderr.write("\nError: --agent or AGENT_NAME environment variable required\n")
        sys.exit(1)

    # Use default port for agent if not specified
    if port == DEFAULT_PORT and agent_name in AGENTS:
        port = AGENTS[agent_name]["default_port"]

    # Setup logging
    setup_logging(log_level)

    # Validate environment
    validate_environment()

    # Start agent
    logger = logging.getLogger(__name__)
    try:
        asyncio.run(start_agent(agent_name, host, port, postgres_uri))
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    except Exception:
        logger.exception("Failed to start agent")
        sys.exit(1)


if __name__ == "__main__":
    main()
