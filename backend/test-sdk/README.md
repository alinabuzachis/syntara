# orchestrator-test-sdk

Reusable pytest fixtures and test infrastructure for Orchestrator E2E and integration tests.

## MCP Development Server

The SDK includes a FastMCP-based development server (`ExampleMCPServer`) used for integration testing. It ships with three built-in example tools (`calculate_sum`, `calculate_product`, `get_greeting`) and a `/health` endpoint.

### Running the server

```bash
# Via make (from backend/)
make mcp-start

# Or directly
MCP_HOST=0.0.0.0 MCP_PORT=8765 uv run python tools/run_mcp_server.py
```

### Extending with custom tools

Use `create_mcp_app()` to build an MCP server with your own tools without subclassing or forking `ExampleMCPServer`:

```python
from orchestrator_test_sdk.app.mcp_servers import create_mcp_app


def reverse_string(text: str) -> str:
    """Reverse a string."""
    return text[::-1]


def word_count(text: str) -> int:
    """Count words in a string."""
    return len(text.split())


server = create_mcp_app(
    [reverse_string, word_count],
    host="0.0.0.0",
    port=9000,
)
```

The factory creates a standard `ExampleMCPServer` with the built-in tools and health check, then registers each function in your list as an additional MCP tool. The server is ready to start:

```python
# As a context manager (recommended for tests)
async with server.running():
    print(server.base_url)  # http://0.0.0.0:9000/mcp

# Or manually
await server.start()
# ...
await server.stop()
```

### Container image

The MCP server is containerized via `backend/containers/mcp/Containerfile`. The image includes `io.orchestrator.*` OCI labels for programmatic identification:

| Label | Value |
|---|---|
| `io.orchestrator.description` | Orchestrator MCP development and testing server |
| `io.orchestrator.use-case` | development |
| `io.orchestrator.mcp-protocol-version` | 2025-03-26 |
