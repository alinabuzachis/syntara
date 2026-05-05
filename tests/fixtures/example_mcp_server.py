"""Test MCP server using FastMCP for integration testing."""

import asyncio
import logging
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
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
    """Test server using FastMCP for integration testing."""

    def __init__(self, host: str = "localhost", port: int = 8765, auth: AuthProvider | None = None) -> None:
        """Initialize test MCP server.

        Args:
            host: Host to bind server to
            port: Port to bind server to
            auth: Authentication provider for the server

        """
        self.host = host
        self.port = port
        self.server_url = f"http://{host}:{port}"
        self.base_url = f"http://{host}:{port}/mcp"  # MCP endpoint path
        self.mcp_app = FastMCP("Example MCP Server", auth=auth)
        self._server: uvicorn.Server | None = None
        self._server_task: asyncio.Task[None] | None = None

    @abstractmethod
    def get_app(self) -> StarletteWithLifespan:
        """Get the Starlette application for the MCP server."""

    async def start(self) -> None:
        """Start the test MCP server."""
        # Create the FastMCP HTTP app with streamable-http transport
        http_app = self.get_app()

        # Configure uvicorn to run the app
        config = uvicorn.Config(
            http_app,
            host=self.host,
            port=self.port,
            log_level="warning",
            loop="asyncio",
            access_log=False,
            workers=1,
        )

        # Start server in background task
        self._server = uvicorn.Server(config)
        self._server_task = asyncio.create_task(self._server.serve())

        # Wait for server to be ready with health check
        await self._wait_for_server_ready()

        logger.info("Test MCP server started at %s, MCP endpoint at %s", self.server_url, self.base_url)

    async def _wait_for_server_ready(self, *, max_timeout: float = 10.0) -> None:
        """Wait for server to be ready by attempting HTTP requests.

        A TCP socket check is not sufficient because the ASGI application may
        not be fully initialised yet (the streamable-http transport in FastMCP
        can race), which leads to ``ASGI callable returned without completing
        response`` errors and 30-second timeouts in CI.

        Args:
            max_timeout: Maximum time to wait for server startup

        """
        import httpx

        start_time = asyncio.get_event_loop().time()
        async with httpx.AsyncClient() as client:
            while (asyncio.get_event_loop().time() - start_time) < max_timeout:
                try:
                    # Make a real HTTP request so we know the ASGI app is ready.
                    # Any HTTP response (even 4xx/5xx) means the server is up.
                    response = await client.get(f"http://{self.host}:{self.port}/", timeout=2.0)
                    logger.debug("Server HTTP check returned status %s", response.status_code)
                    return
                except (httpx.ConnectError, httpx.ReadError, httpx.RemoteProtocolError):
                    pass

                await asyncio.sleep(0.1)

        msg = f"Server did not start within {max_timeout}s"
        raise TimeoutError(msg)

    async def stop(self) -> None:
        """Stop the test MCP server."""
        if not self._server:
            return
        if not self._server_task:
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

    def __init__(self, host: str = "localhost", port: int = 8765, auth: AuthProvider | None = None) -> None:
        """Initialize test MCP server.

        Args:
            host: Host to bind server to
            port: Port to bind server to
            auth: Authentication provider for the server

        """
        super().__init__(host, port, auth)
        self._setup_tools()

    def get_app(self) -> StarletteWithLifespan:
        """Get the Starlette application for the MCP server."""
        return self.mcp_app.http_app(transport="streamable-http")

    def _setup_tools(self) -> None:
        """Set up test tools for the MCP server."""

        @self.mcp_app.tool()
        def calculate_sum(a: int, b: int) -> dict[str, Any]:
            """Calculate the sum of two numbers.

            Args:
                a: First number
                b: Second number

            Returns:
                Dictionary with the sum result

            """
            result = a + b
            return {
                "operation": "sum",
                "inputs": {"a": a, "b": b},
                "result": result,
                "message": f"The sum of {a} and {b} is {result}",
            }

        @self.mcp_app.tool()
        def calculate_product(a: float, b: float) -> dict[str, Any]:
            """Calculate the product of two numbers.

            Args:
                a: First number
                b: Second number

            Returns:
                Dictionary with the product result

            """
            result = a * b
            return {
                "operation": "product",
                "inputs": {"a": a, "b": b},
                "result": result,
                "message": f"The product of {a} and {b} is {result}",
            }

        @self.mcp_app.tool()
        def get_greeting(name: str, *, formal: bool = False) -> dict[str, Any]:
            """Generate a greeting message.

            Args:
                name: Name of the person to greet
                formal: Whether to use formal greeting

            Returns:
                Dictionary with greeting message

            """
            message = f"Good day, {name}. I hope you are well." if formal else f"Hello, {name}! How are you?"

            return {
                "operation": "greeting",
                "inputs": {"name": name, "formal": formal},
                "message": message,
                "greeting_type": "formal" if formal else "casual",
            }

        @self.mcp_app.custom_route("/health", methods=["GET"])
        async def health_check(request: Request) -> PlainTextResponse:
            """Health check endpoint.

            Returns:
                Plain text response indicating server health

            """
            return PlainTextResponse("OK")


class ForbiddenMCPServer(BaseServer):
    """Test MCP server using FastMCP for integration testing that rejects all requests."""

    def __init__(self, host: str = "localhost", port: int = 8765, auth: AuthProvider | None = None) -> None:
        """Initialize test MCP server.

        Args:
            host: Host to bind server to
            port: Port to bind server to
            auth: Authentication provider for the server

        """
        super().__init__(host, port, auth)

    def get_app(self) -> StarletteWithLifespan:
        """Get the Starlette application for the MCP server with forbidden middleware."""
        http_app = self.mcp_app.http_app(transport="streamable-http")
        http_app.add_middleware(ForbiddenMiddleware)
        return http_app
