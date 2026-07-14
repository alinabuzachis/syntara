"""Standalone runner for the example MCP server."""

import asyncio
import os
import signal
from contextlib import suppress

import structlog
from nexus_test_sdk.app.mcp_servers import ExampleMCPServer

logger = structlog.stdlib.get_logger(__name__)


async def main() -> None:
    """Run the MCP server."""
    # Use "127.0.0.1" instead of "0.0.0.0" for security unless explicitly overridden
    host = os.getenv("MCP_HOST", "127.0.0.1")
    port = int(os.getenv("MCP_PORT", "8765"))

    server = ExampleMCPServer(host=host, port=port)
    stop_event = asyncio.Event()

    loop = asyncio.get_running_loop()

    def _request_shutdown(sig: signal.Signals) -> None:
        logger.info("Received signal, shutting down", signal=sig.name)
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _request_shutdown, sig)

    logger.info("Starting MCP server", host=host, port=port)
    logger.info("MCP endpoint", endpoint=f"http://{host}:{port}/mcp")
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
    asyncio.run(main())
