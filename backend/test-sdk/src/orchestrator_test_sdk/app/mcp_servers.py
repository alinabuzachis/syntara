"""Test MCP server implementations using FastMCP for integration testing.

Extension mechanism
-------------------
Use :func:`create_mcp_app` to build an MCP server pre-loaded with your own
tools, without subclassing or forking ``ExampleMCPServer``::

    from orchestrator_test_sdk.app.mcp_servers import create_mcp_app

    def my_tool(x: int, y: int) -> int:
        \"\"\"Multiply two numbers.\"\"\"
        return x * y

    server = create_mcp_app([my_tool], host="0.0.0.0", port=9000)

``server`` is an :class:`ExampleMCPServer` instance ready to be started with
``await server.start()`` or used as a context manager via ``async with
server.running()``.
"""

# Re-exported from the canonical location for discoverability.
# The implementation lives here; orchestrator_test_sdk.fixtures.example_mcp_server is a shim.

import asyncio
import logging
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager, suppress
from typing import Any

import uvicorn
from fastmcp import FastMCP
from fastmcp.server.auth import AuthProvider
from fastmcp.server.http import StarletteWithLifespan
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import PlainTextResponse, Response

logger = logging.getLogger(__name__)


class ForbiddenMiddleware(BaseHTTPMiddleware):
    """Middleware that returns 403 Forbidden for all requests."""

    async def dispatch(self, _request: Request, _call_next) -> Response:
        """Return 403 Forbidden for all requests."""
        return Response(status_code=403, content="Forbidden")


class BaseServer(ABC):
    """Abstract base for test MCP servers."""

    def __init__(self, host: str = "localhost", port: int = 0, auth: AuthProvider | None = None) -> None:
        """Initialize test MCP server."""
        self.host = host
        self.port = port
        self.server_url = ""
        self.base_url = ""
        self.mcp_app = FastMCP("Example MCP Server", auth=auth)
        self._server: uvicorn.Server | None = None
        self._server_task: asyncio.Task[None] | None = None

    @abstractmethod
    def get_app(self) -> StarletteWithLifespan:
        """Get the Starlette application for the MCP server."""

    async def start(self) -> None:
        """Start the test MCP server."""
        # Create the FastMCP HTTP app
        http_app = self.get_app()
        config = uvicorn.Config(
            http_app,
            host=self.host,
            port=self.port,
            log_level="warning",
            loop="asyncio",
            access_log=False,
            workers=1,
        )
        self._server = uvicorn.Server(config)
        self._server_task = asyncio.create_task(self._server.serve())
        await self._wait_for_socket_bound()
        actual_port = self._server.servers[0].sockets[0].getsockname()[1]
        self.port = actual_port
        self.server_url = f"http://{self.host}:{actual_port}"
        self.base_url = f"http://{self.host}:{actual_port}/mcp"

        # Wait for ASGI app to be fully ready
        await self._wait_for_server_ready()

        # Add grace period for FastMCP transport to fully initialize
        # This prevents "ASGI callable returned without completing response" race conditions
        await asyncio.sleep(0.2)

        logger.info("Test MCP server started at %s, MCP endpoint at %s", self.server_url, self.base_url)

    async def _wait_for_socket_bound(self, *, max_timeout: float = 10.0) -> None:
        """Wait for uvicorn to bind the server socket."""
        start_time = asyncio.get_event_loop().time()
        while (asyncio.get_event_loop().time() - start_time) < max_timeout:
            if self._server and self._server.started:
                return
            await asyncio.sleep(0.05)
        msg = f"Server socket did not bind within {max_timeout}s"
        raise TimeoutError(msg)

    async def _wait_for_server_ready(self, *, max_timeout: float = 10.0) -> None:
        """Wait for server to be ready by attempting HTTP requests.

        A TCP socket check is not sufficient because the ASGI application may
        not be fully initialised yet (the FastMCP transport can race), which
        leads to ``ASGI callable returned without completing response`` errors
        and 30-second timeouts in CI.

        Args:
            max_timeout: Maximum time to wait for server startup

        """
        import httpx

        start_time = asyncio.get_event_loop().time()
        async with httpx.AsyncClient() as client:
            while (asyncio.get_event_loop().time() - start_time) < max_timeout:
                try:
                    # Check the /health endpoint to ensure FastMCP app is fully initialized.
                    # Accept 200 (success) or 403 (ForbiddenMCPServer) as proof of readiness.
                    # Any HTTP response (not connection error) means ASGI is processing requests.
                    response = await client.get(f"http://{self.host}:{self.port}/health", timeout=2.0)
                    if response.status_code in (200, 403):
                        logger.debug("Server health check succeeded with status %s", response.status_code)
                        return
                    logger.debug("Server health check returned status %s, retrying", response.status_code)
                except (httpx.ConnectError, httpx.ReadError, httpx.RemoteProtocolError):
                    pass

                await asyncio.sleep(0.1)

        msg = f"Server did not start within {max_timeout}s"
        raise TimeoutError(msg)

    async def stop(self) -> None:
        """Stop the test MCP server."""
        if not self._server or not self._server_task:
            return
        try:
            self._server.should_exit = True
            await asyncio.wait_for(self._server_task, timeout=5.0)
        except TimeoutError:
            self._server_task.cancel()
            with suppress(asyncio.CancelledError):
                await self._server_task
        logger.info("Test MCP server stopped at %s", self.server_url)

    @asynccontextmanager
    async def running(self) -> AsyncIterator["BaseServer"]:
        """Context manager for running the test server."""
        await self.start()
        try:
            yield self
        finally:
            await self.stop()


class ExampleMCPServer(BaseServer):
    """Test MCP server using FastMCP for integration testing."""

    def __init__(self, host: str = "localhost", port: int = 0, auth: AuthProvider | None = None) -> None:
        """Initialize test MCP server."""
        super().__init__(host, port, auth)
        self._setup_tools()

    def get_app(self) -> StarletteWithLifespan:
        """Get the Starlette application for the MCP server."""
        return self.mcp_app.http_app(transport="http", host_origin_protection=False)

    def _setup_tools(self) -> None:
        """Set up test tools for the MCP server."""

        @self.mcp_app.tool()
        def calculate_sum(a: int, b: int) -> dict[str, Any]:
            """Calculate the sum of two numbers."""
            result = a + b
            return {
                "operation": "sum",
                "inputs": {"a": a, "b": b},
                "result": result,
                "message": f"The sum of {a} and {b} is {result}",
            }

        @self.mcp_app.tool()
        def calculate_product(a: float, b: float) -> dict[str, Any]:
            """Calculate the product of two numbers."""
            result = a * b
            return {
                "operation": "product",
                "inputs": {"a": a, "b": b},
                "result": result,
                "message": f"The product of {a} and {b} is {result}",
            }

        @self.mcp_app.tool()
        def get_greeting(name: str, *, formal: bool = False) -> dict[str, Any]:
            """Generate a greeting message."""
            message = f"Good day, {name}. I hope you are well." if formal else f"Hello, {name}! How are you?"
            return {
                "operation": "greeting",
                "inputs": {"name": name, "formal": formal},
                "message": message,
                "greeting_type": "formal" if formal else "casual",
            }

        @self.mcp_app.custom_route("/health", methods=["GET"])
        async def health_check(_request: Request) -> PlainTextResponse:
            """Health check endpoint."""
            return PlainTextResponse("OK")


def create_mcp_app(
    tools: list[Callable[..., Any]],
    *,
    host: str = "localhost",
    port: int = 0,
    auth: AuthProvider | None = None,
) -> ExampleMCPServer:
    """Build an MCP server pre-loaded with custom *tools*.

    Creates an :class:`ExampleMCPServer` (with the built-in example tools and
    health check) and registers each callable in *tools* as an additional MCP
    tool.

    Args:
        tools: Callable tool functions to register with FastMCP.
        host: Hostname to bind to.
        port: Port to bind to (0 = pick a free port).
        auth: Optional FastMCP auth provider.

    Returns:
        A configured :class:`ExampleMCPServer` ready to start.

    """
    server = ExampleMCPServer(host=host, port=port, auth=auth)
    for tool_fn in tools:
        server.mcp_app.tool(tool_fn)
    return server


class ForbiddenMCPServer(BaseServer):
    """Test MCP server that rejects all requests with 403."""

    def __init__(self, host: str = "localhost", port: int = 0, auth: AuthProvider | None = None) -> None:
        """Initialize test MCP server."""
        super().__init__(host, port, auth)

    def get_app(self) -> StarletteWithLifespan:
        """Get the Starlette application for the MCP server with forbidden middleware."""
        http_app = self.mcp_app.http_app(transport="http", host_origin_protection=False)
        http_app.add_middleware(ForbiddenMiddleware)
        return http_app
