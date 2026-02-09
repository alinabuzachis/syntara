"""Standalone runner for the example MCP server."""

import asyncio
import logging
import os
import signal
import sys
from contextlib import suppress
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from tests.fixtures.example_mcp_server import ExampleMCPServer  # noqa: E402

logger = logging.getLogger(__name__)


async def main() -> None:
    """Run the MCP server."""
    # Use "127.0.0.1" instead of "0.0.0.0" for security unless explicitly overridden
    host = os.getenv("MCP_HOST", "127.0.0.1")
    port = int(os.getenv("MCP_PORT", "8765"))

    server = ExampleMCPServer(host=host, port=port)
    stop_event = asyncio.Event()

    loop = asyncio.get_running_loop()

    def _request_shutdown(sig: signal.Signals) -> None:
        logger.info("Received %s, shutting down", sig.name)
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _request_shutdown, sig)

    logger.info("Starting MCP server on %s:%s", host, port)
    logger.info("MCP endpoint: http://%s:%s/mcp", host, port)
    logger.info("Press Ctrl+C to stop")

    try:
        await server.start()
        # Keep server running until interrupted
        await stop_event.wait()
    finally:
        logger.info("Stopping MCP server...")
        with suppress(asyncio.CancelledError):
            await server.stop()
        logger.info("MCP server stopped")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
